// ========================================================================
// Tests: app-vetting.service.ts (APAV-style server-side app vetting)
//
// Fixture apps are built in a temp directory and broken one rule at a
// time — mirrors cli/test/validator.test.mjs in the veltrix-apps repo
// (the canonical check corpus this service is kept in sync with).
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { vetApp, type VetResult } from '../app-vetting.service'

jest.setTimeout(60000) // client bundle tests spawn esbuild

const HANDLER = 'export default async function handler() {\n  return null\n}\n'

const MANIFEST = `id: fixture-app
name: Fixture App
version: 1.0.0
vendor: Test
description: Fixture app for vetting tests
category: CUSTOM
platform:
  minVersion: "1.0.0"
permissions:
  platform: []
  app:
    - resource: configs
      actions: [read]
      description: test
pipeline:
  configurationTypes:
    - id: configs
      name: Configs
      canvasTemplate: config-types/configs/canvas.yaml
      defaultConfig: config-types/configs/defaults.yaml
      handlers:
        validate: config-types/configs/validate
        deploy: config-types/configs/deploy
        rollback: config-types/configs/rollback
        healthCheck: config-types/configs/healthCheck
        getStatus: config-types/configs/getStatus
      targets:
        componentTypes: [test-component]
        requiresCredential: false
        requiresConnectivity: false
server:
  entry: server/index
  routes:
    prefix: /api/apps/fixture-app
`

const CANVAS = `id: fixture-configs
name: Configs
toolType: fixture-app
entityType: configs
sections:
  - name: General
    fields:
      - key: name
        label: Name
        fieldType: text
        required: true
      - key: mode
        label: Mode
        fieldType: select
        defaultValue: fast
        options:
          - label: Fast
            value: fast
          - label: Safe
            value: safe
`

const DEFAULTS = `General:
  name: ""
  mode: fast
`

const CLIENT_SECTION = `client:
  entry: client/index
  pages:
    - path: /fixture
      component: FixturePage
      label: Fixture
`

const VALID_CLIENT_ENTRY = [
  "import React from 'react'",
  '',
  'export default function FixturePage() {',
  "  return React.createElement('div', null, 'fixture')",
  '}',
  '',
].join('\n')

const tempRoots: string[] = []

/** Write a minimal valid app into <tmp>/fixture-app and return its path. */
function makeApp(overrides: Record<string, string | null> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-vetting-test-'))
  tempRoots.push(root)
  const appDir = path.join(root, 'fixture-app')
  const files: Record<string, string | null> = {
    'manifest.yaml': MANIFEST,
    'package.json': JSON.stringify({
      name: 'veltrix-app-fixture-app',
      private: true,
      version: '1.0.0',
    }),
    'README.md': '# Fixture',
    'config-types/configs/canvas.yaml': CANVAS,
    'config-types/configs/defaults.yaml': DEFAULTS,
    'config-types/configs/validate.ts': HANDLER,
    'config-types/configs/deploy.ts': HANDLER,
    'config-types/configs/rollback.ts': HANDLER,
    'config-types/configs/healthCheck.ts': HANDLER,
    'config-types/configs/getStatus.ts': HANDLER,
    'server/index.ts': 'export default async function registerRoutes() {}\n',
    ...overrides,
  }
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue
    const full = path.join(appDir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return appDir
}

afterAll(() => {
  for (const root of tempRoots) {
    try {
      fs.rmSync(root, { recursive: true, force: true })
    } catch {
      // best-effort temp cleanup
    }
  }
})

const errorsMatching = (result: VetResult, re: RegExp) => result.errors.filter((e) => re.test(e))
const warningsMatching = (result: VetResult, re: RegExp) =>
  result.warnings.filter((w) => re.test(w))

describe('vetApp', () => {
  test('valid fixture app passes with no errors', async () => {
    const result = await vetApp(makeApp())
    expect(result.errors).toEqual([])
    expect(result.manifest?.id).toBe('fixture-app')
  })

  test('package.json version must match manifest.version', async () => {
    const result = await vetApp(
      makeApp({ 'package.json': JSON.stringify({ name: 'x', version: '2.0.0' }) }),
    )
    expect(errorsMatching(result, /package\.json version/)).toHaveLength(1)
  })

  test('forbidden module imports are errors', async () => {
    const result = await vetApp(
      makeApp({
        'config-types/configs/deploy.ts':
          "import { exec } from 'node:child_process'\n" + HANDLER,
      }),
    )
    expect(errorsMatching(result, /security: .*child_process/)).toHaveLength(1)
  })

  test('eval and process.exit are errors, fs import is a warning', async () => {
    const result = await vetApp(
      makeApp({
        'config-types/configs/deploy.ts':
          "import fs from 'node:fs'\nexport default async function handler() {\n  eval('1')\n  process.exit(1)\n}\n",
      }),
    )
    expect(errorsMatching(result, /uses eval\(\)/)).toHaveLength(1)
    expect(errorsMatching(result, /process\.exit/)).toHaveLength(1)
    expect(warningsMatching(result, /security: .*node:fs/)).toHaveLength(1)
  })

  test('test files are exempt from in-process safety errors', async () => {
    const result = await vetApp(
      makeApp({
        'config-types/configs/__tests__/deploy.test.ts': 'process.exit(0)\n',
      }),
    )
    expect(errorsMatching(result, /process\.exit/)).toEqual([])
  })

  test('canvas: unknown fieldType and optionless select are errors', async () => {
    const badCanvas = CANVAS.replace('fieldType: text', 'fieldType: dropdown').replace(
      /        options:[\s\S]*$/m,
      '',
    )
    const result = await vetApp(makeApp({ 'config-types/configs/canvas.yaml': badCanvas }))
    expect(errorsMatching(result, /canvas: .*fieldType must be one of/)).toHaveLength(1)
    expect(errorsMatching(result, /canvas: .*select but declares no options/)).toHaveLength(1)
  })

  test('canvas: invalid validation regex is an error', async () => {
    const badCanvas = CANVAS.replace(
      'fieldType: text\n        required: true',
      'fieldType: text\n        required: true\n        validation:\n          pattern: "[unclosed"',
    )
    const result = await vetApp(makeApp({ 'config-types/configs/canvas.yaml': badCanvas }))
    expect(errorsMatching(result, /canvas: .*not a valid regex/)).toHaveLength(1)
  })

  test('canvas: select defaultValue must be an option value', async () => {
    const badCanvas = CANVAS.replace('defaultValue: fast', 'defaultValue: turbo')
    const result = await vetApp(makeApp({ 'config-types/configs/canvas.yaml': badCanvas }))
    expect(
      errorsMatching(result, /canvas: .*"turbo" is not one of its option values/),
    ).toHaveLength(1)
  })

  test('settings: select default must be an option value', async () => {
    const manifest =
      MANIFEST +
      `settings:
  - key: region
    type: select
    label: Region
    default: mars
    options:
      - label: One
        value: one
`
    const result = await vetApp(makeApp({ 'manifest.yaml': manifest }))
    expect(
      errorsMatching(result, /settings: .*"mars" is not one of its option values/),
    ).toHaveLength(1)
  })

  test('defaults referencing unknown sections or fields warn', async () => {
    const result = await vetApp(
      makeApp({
        'config-types/configs/defaults.yaml': 'Nonexistent:\n  name: ""\nGeneral:\n  ghost: 1\n',
      }),
    )
    expect(warningsMatching(result, /defaults section "Nonexistent"/)).toHaveLength(1)
    expect(warningsMatching(result, /defaults key "General\.ghost"/)).toHaveLength(1)
  })

  test('duplicate configuration type ids are errors', async () => {
    const manifest = MANIFEST.replace(
      'server:\n  entry: server/index',
      `    - id: configs
      name: Configs Again
      canvasTemplate: config-types/configs/canvas.yaml
      handlers:
        validate: config-types/configs/validate
        deploy: config-types/configs/deploy
        rollback: config-types/configs/rollback
        healthCheck: config-types/configs/healthCheck
        getStatus: config-types/configs/getStatus
      targets:
        componentTypes: [test-component]
server:
  entry: server/index`,
    )
    const result = await vetApp(makeApp({ 'manifest.yaml': manifest }))
    expect(errorsMatching(result, /"configs" is declared more than once/)).toHaveLength(1)
  })

  test('git merge-conflict markers are errors', async () => {
    const result = await vetApp(
      makeApp({ 'README.md': '# Fixture\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n' }),
    )
    expect(errorsMatching(result, /merge-conflict markers/)).toHaveLength(1)
  })

  test('high-confidence secret shapes (AWS access key) are errors', async () => {
    const result = await vetApp(
      makeApp({
        'config-types/configs/deploy.ts': "const key = 'AKIAIOSFODNN7EXAMPLE'\n" + HANDLER,
      }),
    )
    expect(errorsMatching(result, /security: .*AWS access key/)).toHaveLength(1)
  })

  test('secret-named long literals warn outside tests', async () => {
    const result = await vetApp(
      makeApp({
        'config-types/configs/deploy.ts':
          "const conf = { client_secret: 'abcdefghijklmnopqrstuvwx' }\n" + HANDLER,
      }),
    )
    expect(warningsMatching(result, /secret-named key/)).toHaveLength(1)
  })

  test('symlinks are errors (skipped where symlinks are unavailable)', async () => {
    const appDir = makeApp()
    try {
      fs.symlinkSync(path.join(appDir, 'README.md'), path.join(appDir, 'link.md'))
    } catch {
      // Windows without Developer Mode/admin cannot create symlinks — skip.
      console.warn('skipping symlink vetting assertion: cannot create symlinks on this system')
      return
    }
    const result = await vetApp(appDir)
    expect(errorsMatching(result, /security: symlinks are not allowed/)).toHaveLength(1)
  })

  test('hidden files warn', async () => {
    const result = await vetApp(makeApp({ '.secret-config': 'x' }))
    expect(warningsMatching(result, /hidden file/)).toHaveLength(1)
  })

  test('import escaping the app directory is an error', async () => {
    const result = await vetApp(
      makeApp({
        'config-types/configs/deploy.ts':
          "import secret from '../../../outside'\n" + HANDLER,
      }),
    )
    expect(errorsMatching(result, /escapes the app directory/)).toHaveLength(1)
  })

  test('@prisma/client import is an error', async () => {
    const result = await vetApp(
      makeApp({
        'config-types/configs/deploy.ts':
          "import { PrismaClient } from '@prisma/client'\n" + HANDLER,
      }),
    )
    expect(errorsMatching(result, /@prisma\/client/)).toHaveLength(1)
  })

  test('client bundle dry-run: valid client entry passes', async () => {
    const result = await vetApp(
      makeApp({
        'manifest.yaml': MANIFEST + CLIENT_SECTION,
        'client/index.tsx': VALID_CLIENT_ENTRY,
      }),
    )
    expect(result.errors).toEqual([])
  })

  test('client bundle dry-run: syntax error in client entry is an error', async () => {
    const result = await vetApp(
      makeApp({
        'manifest.yaml': MANIFEST + CLIENT_SECTION,
        'client/index.tsx': 'export default function FixturePage( {\n  return <div>broken\n',
      }),
    )
    expect(errorsMatching(result, /client: bundle check failed/)).toHaveLength(1)
  })

  test('client bundle dry-run: missing client entry file is an error', async () => {
    const result = await vetApp(
      makeApp({
        'manifest.yaml': MANIFEST + CLIENT_SECTION,
        // no client/index.tsx written
      }),
    )
    expect(
      errorsMatching(result, /client: client\.entry "client\/index" did not resolve to a file/),
    ).toHaveLength(1)
  })

  test('server.routes.prefix must match /api/apps/<id>', async () => {
    const manifest = MANIFEST.replace(
      'prefix: /api/apps/fixture-app',
      'prefix: /api/apps/other-app',
    )
    const result = await vetApp(makeApp({ 'manifest.yaml': manifest }))
    expect(
      errorsMatching(result, /server\.routes\.prefix must be "\/api\/apps\/fixture-app"/),
    ).toHaveLength(1)
  })

  test('missing app directory is a single error', async () => {
    const result = await vetApp(path.join(os.tmpdir(), 'veltrix-vetting-nonexistent-app'))
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/App directory not found/)
  })
})

// ---------------------------------------------------------------------------
// Branding (kept in sync with the CLI validator's branding section)
// ---------------------------------------------------------------------------

const SAFE_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#FC0000"/></svg>\n'

const BRANDING_SECTION = `branding:
  primaryColor: "#FC0000"
  accentColor: "#0f0"
  logo: ./assets/logo.svg
`

describe('vetApp branding', () => {
  test('valid branding (hex colors + small safe SVG logo) passes', async () => {
    const result = await vetApp(
      makeApp({
        'manifest.yaml': MANIFEST + BRANDING_SECTION,
        'assets/logo.svg': SAFE_LOGO_SVG,
      }),
    )
    expect(result.errors).toEqual([])
  })

  test('invalid hex colors are errors', async () => {
    const manifest =
      MANIFEST +
      `branding:
  primaryColor: "red"
  accentColor: "#12345"
`
    const result = await vetApp(makeApp({ 'manifest.yaml': manifest }))
    expect(
      errorsMatching(result, /branding: primaryColor must be a #RGB or #RRGGBB hex color/),
    ).toHaveLength(1)
    expect(
      errorsMatching(result, /branding: accentColor must be a #RGB or #RRGGBB hex color/),
    ).toHaveLength(1)
  })

  test('script-bearing SVG logos are errors', async () => {
    const result = await vetApp(
      makeApp({
        'manifest.yaml': MANIFEST + BRANDING_SECTION,
        'assets/logo.svg':
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>\n',
      }),
    )
    expect(
      errorsMatching(result, /branding: logo SVG contains scripting or event handlers/),
    ).toHaveLength(1)
  })

  test('event-handler attributes in SVG logos are errors', async () => {
    const result = await vetApp(
      makeApp({
        'manifest.yaml': MANIFEST + BRANDING_SECTION,
        'assets/logo.svg':
          '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="1"/></svg>\n',
      }),
    )
    expect(
      errorsMatching(result, /branding: logo SVG contains scripting or event handlers/),
    ).toHaveLength(1)
  })

  test('oversized logos are errors', async () => {
    const result = await vetApp(
      makeApp({
        'manifest.yaml': MANIFEST + BRANDING_SECTION,
        'assets/logo.svg': `<svg xmlns="http://www.w3.org/2000/svg"><!--${'x'.repeat(129 * 1024)}--></svg>\n`,
      }),
    )
    expect(errorsMatching(result, /branding: logo exceeds 128 KB/)).toHaveLength(1)
  })

  test("logo paths with '..' segments are errors", async () => {
    const manifest = MANIFEST + 'branding:\n  logo: ../outside/logo.svg\n'
    const result = await vetApp(makeApp({ 'manifest.yaml': manifest }))
    expect(
      errorsMatching(result, /branding: logo must not contain '\.\.' path segments/),
    ).toHaveLength(1)
  })

  test('non-svg/png logo files are errors', async () => {
    const manifest = MANIFEST + 'branding:\n  logo: ./assets/logo.gif\n'
    const result = await vetApp(
      makeApp({ 'manifest.yaml': manifest, 'assets/logo.gif': 'GIF89a' }),
    )
    expect(
      errorsMatching(result, /branding: logo must be an \.svg \(preferred\) or \.png file/),
    ).toHaveLength(1)
  })

  test('a missing logo file is an error', async () => {
    const result = await vetApp(makeApp({ 'manifest.yaml': MANIFEST + BRANDING_SECTION }))
    expect(errorsMatching(result, /branding: logo points to a missing file/)).toHaveLength(1)
  })

  test('logoDark is validated with the same rules', async () => {
    const manifest =
      MANIFEST +
      `branding:
  logo: ./assets/logo.svg
  logoDark: ./assets/logo-dark.svg
`
    const result = await vetApp(
      makeApp({
        'manifest.yaml': manifest,
        'assets/logo.svg': SAFE_LOGO_SVG,
        'assets/logo-dark.svg':
          '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">x</a></svg>\n',
      }),
    )
    expect(
      errorsMatching(result, /branding: logoDark SVG contains scripting or event handlers/),
    ).toHaveLength(1)
  })
})
