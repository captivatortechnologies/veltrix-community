// ========================================================================
// App Database Migration Runner
//
// Executes SQL migration files from an app's server/migrations/ directory.
// Tracks which migrations have been applied in the app_migrations table.
// Migrations run in filename order (001_initial.sql, 002_add_index.sql, etc).
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient, Prisma } from '@prisma/client'

interface MigrationRecord {
  id: string
  appId: string
  filename: string
  appliedAt: Date
  checksum: string
}

/**
 * How an app's tables are namespaced in Postgres:
 *   - 'shared': tables live in the `public` schema, every object name MUST
 *     start with the app's `tablePrefix`. Used for trusted first-party
 *     (BUILT_IN) apps whose SQL we ship and review.
 *   - 'schema': the app gets its own Postgres schema and its migrations run
 *     with `search_path` pinned to it, so its DDL physically cannot reach
 *     platform tables in `public`. Used for less-trusted MARKETPLACE / CUSTOM
 *     (self-managed) apps.
 */
export type AppIsolation = 'shared' | 'schema' | 'database' | 'external'

export interface AppMigrationOptions {
  /** Required for 'shared' isolation; every created object must start with it. */
  tablePrefix?: string
  /** Defaults to 'shared' for backward compatibility. */
  isolation?: AppIsolation
  /** Explicit schema name for 'schema' isolation (defaults to appSchemaName(appId)). */
  schema?: string
}

/** Platform schemas an app migration may never target. */
const PROTECTED_SCHEMAS = new Set(['public', 'pg_catalog', 'information_schema', 'pg_toast'])

/**
 * Statement-level DDL/DCL an app migration may never execute — these escape
 * table-level namespacing entirely (roles, cross-db, extensions, raw schema ops).
 */
const FORBIDDEN_STATEMENT = new RegExp(
  [
    '\\bCREATE\\s+(ROLE|USER|DATABASE|EXTENSION|SCHEMA)\\b',
    '\\bDROP\\s+(ROLE|USER|DATABASE|SCHEMA)\\b',
    '\\bALTER\\s+(ROLE|USER|DATABASE|SYSTEM)\\b',
    '\\b(GRANT|REVOKE)\\b',
    '\\bSET\\s+ROLE\\b',
    '\\bCOPY\\b',
    '\\bCREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\b',
  ].join('|'),
  'i',
)

/** Object-creating/altering DDL whose target name we enforce. */
const OWNED_DDL =
  /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|UNIQUE\s+INDEX|SEQUENCE|VIEW|MATERIALIZED\s+VIEW|TYPE|TRIGGER)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:ONLY\s+)?("?[A-Za-z0-9_.]+"?)/i

/**
 * Reject any migration statement that would touch objects outside the app's
 * namespace. This is a static defense layer; the strong guarantee for 'schema'
 * isolation comes from Postgres search_path (and, in future, a per-app role).
 */
export function assertStatementOwnership(statement: string, opts: AppMigrationOptions): void {
  const isolation = opts.isolation ?? 'shared'

  if (FORBIDDEN_STATEMENT.test(statement)) {
    throw new Error(`Migration statement is not permitted for an app: "${trim(statement)}"`)
  }

  // A database-isolated app owns its entire (separate) Postgres database, so any
  // table name is fine there; only the cluster-global forbidden statements above
  // are enforced. External apps run no platform-managed SQL at all.
  if (isolation === 'database' || isolation === 'external') return

  // Any explicitly schema-qualified reference must point at the app's own schema.
  const appSchema = opts.schema
  const qualified = statement.matchAll(/(?:^|[\s("])("?[A-Za-z_][A-Za-z0-9_]*"?)\s*\.\s*"?[A-Za-z_]/g)
  for (const m of qualified) {
    const schema = unquote(m[1])
    if (isolation === 'schema') {
      if (schema !== appSchema) {
        throw new Error(
          `Migration may only reference its own schema "${appSchema}", not "${schema}": "${trim(statement)}"`,
        )
      }
    } else if (PROTECTED_SCHEMAS.has(schema.toLowerCase())) {
      throw new Error(
        `Shared-isolation migration may not reference schema "${schema}": "${trim(statement)}"`,
      )
    }
  }

  // For 'shared' isolation, every object an app creates/alters/drops must carry
  // the app's table prefix as a namespacing token so it can never collide with
  // or clobber a platform table (accepts both `splunk_x` and `idx_splunk_x`).
  if (isolation === 'shared') {
    const match = OWNED_DDL.exec(statement)
    if (match) {
      const name = unquote(match[1].split('.').pop() as string)
      const prefix = opts.tablePrefix ?? ''
      if (!prefix || !name.toLowerCase().includes(prefix.toLowerCase())) {
        throw new Error(
          `Shared-isolation object "${name}" must be namespaced with the app's tablePrefix "${prefix}": "${trim(statement)}"`,
        )
      }
    }
  }
}

function unquote(id: string): string {
  return id.replace(/^"(.*)"$/, '$1')
}

function trim(sql: string): string {
  const s = sql.replace(/\s+/g, ' ').trim()
  return s.length > 120 ? `${s.slice(0, 117)}...` : s
}

/**
 * Split a SQL migration file into individual statements on top-level
 * semicolons, ignoring semicolons that live inside line comments (`-- ...`),
 * block comments (`/* ... *\/`, which nest in Postgres), single-quoted string
 * literals (`'...'` with `''` escaping) and dollar-quoted strings
 * (`$$ ... $$` / `$tag$ ... $tag$`). Comments are dropped from the returned
 * statements; string and dollar-quote bodies are preserved verbatim.
 *
 * A naive `sql.split(';')` breaks whenever a comment or literal contains a
 * semicolon — e.g. `-- foreign key; enforced in code` splits mid-comment and
 * the trailing prose gets executed as broken SQL. This tokenizer avoids that.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  const n = sql.length

  while (i < n) {
    const ch = sql[i]
    const next = sql[i + 1]

    // Line comment: drop everything through the end of the line.
    if (ch === '-' && next === '-') {
      i += 2
      while (i < n && sql[i] !== '\n') i++
      current += ' '
      continue
    }

    // Block comment: drop to the matching close (Postgres block comments nest).
    if (ch === '/' && next === '*') {
      let depth = 1
      i += 2
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++
          i += 2
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--
          i += 2
        } else {
          i++
        }
      }
      current += ' '
      continue
    }

    // Single-quoted string literal: copy verbatim, honoring '' escapes.
    if (ch === "'") {
      current += ch
      i++
      while (i < n) {
        current += sql[i]
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            current += sql[i + 1]
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      continue
    }

    // Dollar-quoted string: $tag$ ... $tag$ (tag may be empty). Everything
    // between the matching delimiters is literal, including ';' and comments.
    if (ch === '$') {
      const opener = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (opener) {
        const tag = opener[0]
        const end = sql.indexOf(tag, i + tag.length)
        if (end === -1) {
          current += sql.slice(i)
          i = n
        } else {
          current += sql.slice(i, end + tag.length)
          i = end + tag.length
        }
        continue
      }
    }

    // Top-level statement terminator.
    if (ch === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      i++
      continue
    }

    current += ch
    i++
  }

  const tail = current.trim()
  if (tail) statements.push(tail)
  return statements
}

/** Deterministic, collision-free Postgres schema name for a schema-isolated app. */
export function appSchemaName(appId: string): string {
  return `app_${appId.replace(/[^A-Za-z0-9]+/g, '_').toLowerCase()}`
}

/** Deterministic Postgres database name for a database-isolated app. */
export function appDatabaseName(appId: string): string {
  return `app_${appId.replace(/[^A-Za-z0-9]+/g, '_').toLowerCase()}`
}

/** Minimal shape of a node-postgres client — enough to run per-app-database migrations. */
export interface AppPgClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
  end(): Promise<void>
}

/** Opens a connection to an app's own database. Injectable so tests need no real Postgres. */
export type AppPgConnector = (connectionString: string) => Promise<AppPgClient>

const defaultPgConnector: AppPgConnector = async (connectionString) => {
  const pg: any = await import('pg')
  const client = new pg.Client({ connectionString })
  await client.connect()
  return client
}

export class AppMigrationRunner {
  constructor(
    private db: PrismaClient,
    private pgConnector: AppPgConnector = defaultPgConnector,
  ) {}

  /**
   * Ensure the app_migrations tracking table exists.
   * This is a platform table, not an app table.
   */
  async ensureMigrationTable(): Promise<void> {
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS app_migrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        app_id VARCHAR(255) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(app_id, filename)
      )
    `)
  }

  /**
   * Run pending migrations for an app.
   * Only executes migrations that haven't been applied yet.
   */
  async runMigrations(
    appId: string,
    migrationsDir: string,
    options: AppMigrationOptions = {},
  ): Promise<string[]> {
    const isolation = options.isolation ?? 'shared'

    // External: the app owns its datastore entirely; the platform manages no
    // schema for it (its connection is supplied at runtime via app settings).
    if (isolation === 'external') {
      console.log(`[MigrationRunner] ${appId}: external isolation — no platform-managed migrations`)
      return []
    }

    // Database: the app gets its own Postgres database (hard blast-radius
    // isolation); its migrations run there over a dedicated connection.
    if (isolation === 'database') {
      return this.runDatabaseMigrations(appId, migrationsDir, { ...options, isolation })
    }

    await this.ensureMigrationTable()

    const schema = isolation === 'schema' ? options.schema ?? appSchemaName(appId) : undefined
    const opts: AppMigrationOptions = { ...options, isolation, schema }

    if (!fs.existsSync(migrationsDir)) {
      return []
    }

    // A schema-isolated app owns a dedicated Postgres schema; create it up front
    // so its migrations can run with search_path pinned to it. We also give it a
    // dedicated least-privilege role that owns the schema, so the DATABASE (not
    // just the static guard) confines the app to its own tables.
    let roleEnforced = false
    if (schema) {
      await this.db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
      roleEnforced = await this.ensureAppRole(schema)
    }

    // Get all SQL files sorted by name
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    if (files.length === 0) return []

    // Get already applied migrations
    const applied = await this.db.$queryRawUnsafe<MigrationRecord[]>(
      `SELECT filename, checksum FROM app_migrations WHERE app_id = $1`,
      appId,
    )
    const appliedMap = new Map(applied.map((m) => [m.filename, m.checksum]))

    const executed: string[] = []

    for (const file of files) {
      const filePath = path.join(migrationsDir, file)
      const sql = fs.readFileSync(filePath, 'utf-8').trim()

      if (!sql) continue

      const checksum = this.computeChecksum(sql)

      // Check if already applied
      if (appliedMap.has(file)) {
        const existingChecksum = appliedMap.get(file)
        if (existingChecksum !== checksum) {
          throw new Error(
            `Migration "${file}" for app "${appId}" has been modified after it was applied. ` +
            `Expected checksum: ${existingChecksum}, got: ${checksum}. ` +
            `Do not modify applied migrations - create a new migration instead.`,
          )
        }
        continue // Already applied with same checksum
      }

      // Execute the migration (split by semicolons for multi-statement SQL)
      try {
        const statements = splitSqlStatements(sql)

        // Static ownership guard: refuse to run anything that reaches outside
        // the app's namespace before we touch the database.
        for (const statement of statements) {
          assertStatementOwnership(statement, opts)
        }

        // Apply the file atomically. For a schema-isolated app, pin search_path
        // for the transaction so unqualified DDL lands in — and can only see —
        // the app's own schema, and (when available) assume the app's dedicated
        // least-privilege role so the DB rejects any reach into platform tables.
        await this.db.$transaction(async (tx) => {
          if (schema) {
            await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)
            if (roleEnforced) {
              await tx.$executeRawUnsafe(`SET LOCAL ROLE "${schema}"`)
            }
          }
          for (const statement of statements) {
            await tx.$executeRawUnsafe(statement)
          }
        })

        // Record the migration (always in the platform-owned tracking table).
        await this.db.$executeRawUnsafe(
          `INSERT INTO public.app_migrations (app_id, filename, checksum) VALUES ($1, $2, $3)`,
          appId,
          file,
          checksum,
        )

        executed.push(file)
        console.log(`[MigrationRunner] Applied ${appId}/${file}`)
      } catch (err) {
        console.error(`[MigrationRunner] Failed to apply ${appId}/${file}:`, err)
        throw new Error(`Migration failed for "${appId}/${file}": ${(err as Error).message}`)
      }
    }

    return executed
  }

  /**
   * Get the list of applied migrations for an app.
   */
  async getAppliedMigrations(appId: string): Promise<Array<{ filename: string; appliedAt: Date }>> {
    await this.ensureMigrationTable()

    const results = await this.db.$queryRawUnsafe<Array<{ filename: string; applied_at: Date }>>(
      `SELECT filename, applied_at FROM app_migrations WHERE app_id = $1 ORDER BY filename`,
      appId,
    )

    return results.map((r) => ({ filename: r.filename, appliedAt: r.applied_at }))
  }

  /**
   * Ensure a dedicated, least-privilege Postgres role exists for a schema-
   * isolated app and owns its schema. Migrations then run as this role
   * (SET LOCAL ROLE), so the database itself — not just the static guard —
   * prevents the app from reading or altering platform tables.
   *
   * The role shares the schema's name and is NOLOGIN: it is only ever assumed
   * via SET ROLE on the platform's own pooled connection, never authenticated
   * directly. The platform's login user is made a member so it can SET ROLE.
   *
   * Degrades gracefully: if the platform's DB user cannot manage roles, this
   * logs and returns false, and migrations fall back to schema + search_path
   * isolation (still covered by the static ownership guard).
   */
  private async ensureAppRole(schema: string): Promise<boolean> {
    try {
      const exists = await this.db.$queryRawUnsafe<Array<{ one: number }>>(
        `SELECT 1 AS one FROM pg_roles WHERE rolname = $1`,
        schema,
      )
      if (exists.length === 0) {
        await this.db.$executeRawUnsafe(`CREATE ROLE "${schema}" NOLOGIN`)
      }
      await this.db.$executeRawUnsafe(`GRANT "${schema}" TO CURRENT_USER`)
      await this.db.$executeRawUnsafe(`ALTER SCHEMA "${schema}" OWNER TO "${schema}"`)
      return true
    } catch (err) {
      console.warn(
        `[MigrationRunner] Least-privilege role for "${schema}" unavailable ` +
          `(${(err as Error).message}); falling back to schema + guard isolation.`,
      )
      return false
    }
  }

  /**
   * Tear down a schema-isolated app: drop its dedicated schema (and everything
   * in it), its dedicated role, and forget its recorded migrations. Safe to
   * call on uninstall. Only ever drops an `app_`-prefixed schema/role, never a
   * platform one.
   */
  async dropAppSchema(appId: string, schema: string = appSchemaName(appId)): Promise<void> {
    if (PROTECTED_SCHEMAS.has(schema.toLowerCase()) || !schema.startsWith('app_')) {
      throw new Error(`Refusing to drop non-app schema "${schema}"`)
    }
    await this.db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    // Best-effort: drop the app's dedicated role (it shares the schema name).
    try {
      await this.db.$executeRawUnsafe(`DROP OWNED BY "${schema}" CASCADE`)
      await this.db.$executeRawUnsafe(`DROP ROLE IF EXISTS "${schema}"`)
    } catch (err) {
      console.warn(`[MigrationRunner] Could not drop role "${schema}": ${(err as Error).message}`)
    }
    await this.db.$executeRawUnsafe(`DELETE FROM public.app_migrations WHERE app_id = $1`, appId)
  }

  /**
   * Drop a database-isolated app's dedicated Postgres database (and everything
   * in it). Only ever drops an `app_`-prefixed database.
   */
  async dropAppDatabase(appId: string): Promise<void> {
    const dbName = appDatabaseName(appId)
    if (!dbName.startsWith('app_')) {
      throw new Error(`Refusing to drop non-app database "${dbName}"`)
    }
    // WITH (FORCE) terminates lingering connections (Postgres 13+). Cannot run
    // inside a transaction; $executeRawUnsafe autocommits.
    await this.db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
  }

  /** Create the app's dedicated database if it does not yet exist. */
  private async ensureDatabase(dbName: string): Promise<void> {
    const exists = await this.db.$queryRawUnsafe<Array<{ one: number }>>(
      `SELECT 1 AS one FROM pg_database WHERE datname = $1`,
      dbName,
    )
    if (exists.length === 0) {
      // CREATE DATABASE cannot run inside a transaction; $executeRawUnsafe autocommits.
      await this.db.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
    }
  }

  /** Derive the app database's connection string from the platform's DATABASE_URL. */
  private appDbConnectionString(dbName: string): string {
    const base = process.env.DATABASE_URL_VL
    if (!base) {
      throw new Error('DATABASE_URL_VL is not set; cannot provision a per-app database')
    }
    const url = new URL(base)
    url.pathname = `/${dbName}`
    return url.toString()
  }

  /**
   * Apply an app's migrations into its OWN Postgres database. The separate
   * database is the isolation boundary — Postgres has no cross-database queries,
   * so the app cannot reach platform data at all. Migration tracking lives in
   * the app database, making it fully self-contained.
   */
  private async runDatabaseMigrations(
    appId: string,
    migrationsDir: string,
    opts: AppMigrationOptions,
  ): Promise<string[]> {
    if (!fs.existsSync(migrationsDir)) return []
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    if (files.length === 0) return []

    const dbName = appDatabaseName(appId)
    await this.ensureDatabase(dbName)

    const client = await this.pgConnector(this.appDbConnectionString(dbName))
    const executed: string[] = []
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS app_migrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        app_id VARCHAR(255) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(app_id, filename)
      )`)

      const appliedRes = await client.query(
        `SELECT filename, checksum FROM app_migrations WHERE app_id = $1`,
        [appId],
      )
      const appliedMap = new Map<string, string>(
        appliedRes.rows.map((r: any) => [r.filename, r.checksum]),
      )

      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').trim()
        if (!sql) continue
        const checksum = this.computeChecksum(sql)

        if (appliedMap.has(file)) {
          if (appliedMap.get(file) !== checksum) {
            throw new Error(
              `Migration "${file}" for app "${appId}" has been modified after it was applied. ` +
                `Do not modify applied migrations - create a new migration instead.`,
            )
          }
          continue
        }

        const statements = sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
        for (const statement of statements) {
          assertStatementOwnership(statement, opts)
        }

        try {
          await client.query('BEGIN')
          for (const statement of statements) {
            await client.query(statement)
          }
          await client.query('COMMIT')
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined)
          throw new Error(`Migration failed for "${appId}/${file}": ${(err as Error).message}`)
        }

        await client.query(
          `INSERT INTO app_migrations (app_id, filename, checksum) VALUES ($1, $2, $3)`,
          [appId, file, checksum],
        )
        executed.push(file)
        console.log(`[MigrationRunner] Applied ${appId}/${file} (database ${dbName})`)
      }
    } finally {
      await client.end()
    }
    return executed
  }

  /**
   * Compute a simple checksum for migration content.
   * Uses a basic hash to detect modifications to applied migrations.
   */
  private computeChecksum(content: string): string {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0')
  }
}
