// ========================================================================
// canvasTemplate — generic adapter between an app's canvas.yaml schema
// (served by the platform) and the shared ConfigurationCanvas component's
// ConfigSection[] model. ZERO app-specific knowledge: everything is driven
// by the appId / configTypeId route params and the fetched template JSON.
//
// Server contracts consumed here (both generic, keyed by appId+configTypeId):
//   GET /api/apps/:appId/config-types/:configTypeId/canvas   -> CanvasTemplate
//   GET /api/apps/:appId/config-types/:configTypeId/defaults  -> CanvasDefaults
//
// NOTE: the canvas.yaml field key is `fieldType`; the ConfigurationCanvas
// component uses `type`. This module performs that fieldType -> type mapping
// (and defaultValue -> value seeding) so callers never see the difference.
// ========================================================================

import { API_URL } from '@/config'
import type { ConfigField, ConfigSection } from '@/components/shared/ConfigurationCanvas'

// ---------------------------------------------------------------------------
// Template shape (parsed canvas.yaml JSON returned by the server)
// ---------------------------------------------------------------------------

export interface CanvasTemplateFieldOption {
  label: string
  value: string
  description?: string
}

export interface CanvasTemplateFileCatalogEntry {
  value: string
  label?: string
  description?: string
  folders?: string[]
  template?: string
}

export interface CanvasTemplateFieldValidation {
  pattern?: string
  patternMessage?: string
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
}

export interface CanvasTemplateField {
  key: string
  label?: string
  /** canvas.yaml uses `fieldType`; mapped to ConfigField.type below. */
  fieldType: string
  required?: boolean
  defaultValue?: unknown
  options?: CanvasTemplateFieldOption[]
  validation?: CanvasTemplateFieldValidation
  helpText?: string
  placeholder?: string
  /** Known-file catalog for a `files` field (drives the filename combobox). */
  fileCatalog?: CanvasTemplateFileCatalogEntry[]
  /** Conditional visibility keyed on a sibling field's value (see ConfigField). */
  visibleWhen?: { field: string; equals?: string | number | boolean; in?: Array<string | number | boolean> }
  /** For a `keyvalue` field: lock keys to read-only labels (edit values only). */
  lockKeys?: boolean
  /** For a `remote-multiselect` field: options source key + multi flag. */
  optionsSource?: string
  optionsMulti?: boolean
}

export interface CanvasTemplateSection {
  name: string
  icon?: string
  description?: string
  fields?: CanvasTemplateField[]
}

/** A presentational field group *within* one item (General, Sizing, Retention…). */
export interface CanvasTemplateGroup {
  name: string
  icon?: string
  description?: string
  fields?: CanvasTemplateField[]
}

/**
 * `item:` — describes ONE object the configuration creates in the target tool.
 * The user may add many; each is a section row, and the groups only lay out its
 * fields. This is what replaces "duplicate the section to add another IOC".
 */
export interface CanvasTemplateItem {
  /** Singular noun for the UI: "Index" -> "Add Index". */
  label?: string
  /** Field key that names an item and must be unique across items. */
  identityField?: string
  /** Can the user add more than one? Defaults to true. */
  repeatable?: boolean
  minItems?: number
  maxItems?: number
  groups?: CanvasTemplateGroup[]
}

export interface CanvasTemplate {
  id?: string
  name?: string
  description?: string
  /** Preferred. When absent, `sections` is read as the legacy one-section-per-item form. */
  item?: CanvasTemplateItem
  sections?: CanvasTemplateSection[]
}

/**
 * defaults.yaml. Item templates use the flat `{ <fieldKey>: value }` form —
 * these seed EVERY new item. The legacy nested `{ <sectionName>: { … } }` form
 * is still accepted for templates that declare `sections`.
 */
export type CanvasDefaults = Record<string, unknown>

/** A resolved item spec — legacy `sections` templates get a synthetic one. */
export interface ResolvedItemSpec {
  label: string
  identityField?: string
  repeatable: boolean
  minItems: number
  maxItems?: number
  groups: CanvasTemplateGroup[]
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

let idCounter = 0
/** Unique, collision-free id for generated sections/fields. */
function makeId(prefix: string): string {
  idCounter += 1
  return `tmpl-${prefix}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Stable, collision-free id for a NEW canvas item (group/policy/…). It becomes
 * the ConfigurationCanvasSection id and is PRESERVED across edits (round-tripped
 * on save), so deploy handlers can key an external-id map by it and update the
 * SAME target on rename instead of creating a duplicate. A UUID (not the
 * counter-based makeId) so it never collides across the global section table.
 */
function newItemId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  return makeId('item')
}

/**
 * Normalize a template to a single item spec.
 *
 * `item:` is used as-is. A legacy `sections:` template means "one section is one
 * item" (how CrowdStrike's IOC canvas has always worked), so its first section
 * becomes the item's only group and the item stays repeatable.
 */
export function resolveItemSpec(template: CanvasTemplate | null | undefined): ResolvedItemSpec {
  const item = template?.item
  if (item) {
    return {
      label: item.label ?? 'Item',
      identityField: item.identityField,
      repeatable: item.repeatable !== false,
      minItems: item.minItems ?? 1,
      maxItems: item.maxItems,
      groups: item.groups ?? [],
    }
  }

  const sections = template?.sections ?? []
  return {
    label: sections[0]?.name ?? 'Item',
    identityField: undefined,
    repeatable: true,
    minItems: 1,
    maxItems: undefined,
    groups: sections.length > 0 ? [sections[0]] : [],
  }
}

/**
 * Seed a field's value, later source winning:
 *   canvas.yaml defaultValue  ->  defaults.yaml  ->  customer defaults
 * so adding an item never means retyping entries the tenant always uses.
 * `customerDefaults` is the tenant's own default set (the app's "Index Defaults").
 */
function seedValue(
  field: CanvasTemplateField,
  defaults?: CanvasDefaults | null,
  customerDefaults?: CanvasDefaults | null,
): unknown {
  const fromCustomer = customerDefaults?.[field.key]
  if (fromCustomer !== undefined) return fromCustomer

  const fromDefaults = defaults?.[field.key]
  if (fromDefaults !== undefined) return fromDefaults

  return field.defaultValue !== undefined ? field.defaultValue : ''
}

/**
 * Which defaults.yaml entries apply to a group's fields.
 *
 * An `item:` template ships FLAT defaults, so they seed every group. A legacy
 * `sections:` template ships them NESTED under the section name.
 */
function defaultsForGroup(
  template: CanvasTemplate | null | undefined,
  group: CanvasTemplateGroup,
  defaults?: CanvasDefaults | null,
): CanvasDefaults | undefined {
  if (template?.item) return defaults ?? undefined
  const nested = defaults?.[group.name]
  return nested && typeof nested === 'object' ? (nested as CanvasDefaults) : undefined
}

/**
 * Build ONE item as a ConfigSection. Every field of every group lands in the same
 * section — so a handler reading `section.fields` sees the whole item, which is
 * exactly what deploy expects.
 */
function buildItem(
  template: CanvasTemplate | null | undefined,
  groups: CanvasTemplateGroup[],
  options: {
    defaults?: CanvasDefaults | null
    customerDefaults?: CanvasDefaults | null
    seed?: Record<string, unknown>
    identityField?: string
    displayName?: string
    fallbackName: string
    icon?: string
    description?: string
    order: number
    /** Tag fields with their group. Legacy one-section-per-item configs have no groups. */
    tagGroups: boolean
  },
): ConfigSection {
  const fields: ConfigField[] = []
  for (const group of groups) {
    const groupDefaults = defaultsForGroup(template, group, options.defaults)
    for (const field of group.fields ?? []) {
      const seeded =
        options.seed && options.seed[field.key] !== undefined
          ? options.seed[field.key]
          : seedValue(field, groupDefaults, options.customerDefaults)
      fields.push({
        id: makeId('field'),
        key: field.key,
        label: field.label ?? field.key,
        type: (field.fieldType as ConfigField['type']) || 'text',
        value: seeded,
        defaultValue: field.defaultValue,
        required: field.required,
        placeholder: field.placeholder,
        helpText: field.helpText,
        options: field.options as ConfigField['options'],
        validation: field.validation as ConfigField['validation'],
        fileCatalog: field.fileCatalog as ConfigField['fileCatalog'],
        visibleWhen: field.visibleWhen as ConfigField['visibleWhen'],
        lockKeys: field.lockKeys,
        optionsSource: field.optionsSource,
        optionsMulti: field.optionsMulti,
        group: options.tagGroups ? group.name : undefined,
        order: fields.length,
      })
    }
  }

  const identityValue = options.identityField
    ? fields.find((f) => f.key === options.identityField)?.value
    : undefined

  return {
    id: newItemId(),
    name:
      options.displayName ??
      (typeof identityValue === 'string' && identityValue ? identityValue : options.fallbackName),
    icon: options.icon,
    description: options.description,
    collapsed: false,
    order: options.order,
    fields,
  }
}

/**
 * Re-derive template-owned field PRESENTATION onto a saved canvas's fields on edit.
 *
 * The server persists a field's FULL presentation (label, fieldType, helpText,
 * validation, options, optionsSource, group…) frozen at save time — only `value`
 * is user data. So when a canvas.yaml field later changes (e.g. `memberUserIds`
 * went from a free-text `tags` box to a live `remote-multiselect` users picker,
 * and was relabelled "Member User IDs" -> "Members"), a config saved under the OLD
 * template keeps rendering the OLD field: stale type, stale label, and the picker
 * never appears. This re-applies EVERY presentation prop from the CURRENT template
 * (matched by field key) so an edit always reflects today's canvas — the field's
 * saved `value` and stable `id`/`key`/`order` are the only things kept.
 *
 * Fields present in the saved config but absent from the template (a field the
 * template removed) are left exactly as saved. Fields the template ADDED are not
 * injected here — a new template field appears only when the item is re-added.
 */
export function applyTemplateFieldMeta(
  sections: ConfigSection[],
  template: CanvasTemplate | null | undefined,
): ConfigSection[] {
  if (!template) return sections
  const isItem = Boolean(template.item)
  // key -> { template field, containing group name (item templates only) }
  const meta = new Map<string, { field: CanvasTemplateField; group?: string }>()
  const collect = (fields?: CanvasTemplateField[], group?: string) => {
    for (const f of fields ?? []) if (f.key && !meta.has(f.key)) meta.set(f.key, { field: f, group })
  }
  for (const group of template.item?.groups ?? []) collect(group.fields, group.name)
  for (const section of template.sections ?? []) collect(section.fields)
  if (meta.size === 0) return sections

  return sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => {
      const entry = meta.get(field.key)
      if (!entry) return field
      const t = entry.field
      // Template WINS on every presentation prop (so a relabel/retype/rule change
      // in canvas.yaml takes effect on existing configs); keep only the user's
      // data (`value`) and the field's stable identity (`id`, `key`, `order`).
      return {
        ...field,
        label: t.label ?? field.key,
        type: (t.fieldType as ConfigField['type']) || 'text',
        required: t.required,
        placeholder: t.placeholder,
        helpText: t.helpText,
        defaultValue: t.defaultValue,
        options: t.options as ConfigField['options'],
        validation: t.validation as ConfigField['validation'],
        fileCatalog: t.fileCatalog as ConfigField['fileCatalog'],
        visibleWhen: t.visibleWhen as ConfigField['visibleWhen'],
        lockKeys: t.lockKeys,
        optionsSource: t.optionsSource,
        optionsMulti: t.optionsMulti,
        group: isItem ? entry.group : field.group,
      }
    }),
  }))
}

/** Build one new item from the template — the factory behind Add and Duplicate. */
export function makeCanvasItem(
  template: CanvasTemplate | null | undefined,
  options: {
    defaults?: CanvasDefaults | null
    customerDefaults?: CanvasDefaults | null
    /** Values copied from an existing item ("Duplicate"). Beats all defaults. */
    seed?: Record<string, unknown>
    displayName?: string
    order?: number
  } = {},
): ConfigSection {
  const spec = resolveItemSpec(template)
  const order = options.order ?? 0
  return buildItem(template, spec.groups, {
    defaults: options.defaults,
    customerDefaults: options.customerDefaults,
    seed: options.seed,
    identityField: spec.identityField,
    displayName: options.displayName,
    fallbackName: `${spec.label} ${order + 1}`,
    icon: spec.groups[0]?.icon,
    order,
    tagGroups: Boolean(template?.item),
  })
}

/** The items a NEW configuration starts with. */
export function canvasTemplateToItems(
  template: CanvasTemplate | null | undefined,
  defaults?: CanvasDefaults | null,
  customerDefaults?: CanvasDefaults | null,
): ConfigSection[] {
  if (!template) return []

  // Legacy `sections:` — each declared section IS one item, keeping its own name,
  // its own fields and its defaults (which are nested under that section name).
  if (!template.item) {
    return (template.sections ?? []).map((section, index) =>
      buildItem(template, [section], {
        defaults,
        customerDefaults,
        displayName: section.name,
        fallbackName: section.name,
        icon: section.icon,
        description: section.description,
        order: index,
        tagGroups: false,
      }),
    )
  }

  // `item:` — materialize `minItems` copies (at least one) of the single item.
  const spec = resolveItemSpec(template)
  const count = Math.max(1, spec.minItems)
  return Array.from({ length: count }, (_, index) =>
    makeCanvasItem(template, { defaults, customerDefaults, order: index }),
  )
}

/** @deprecated Use {@link canvasTemplateToItems}. Kept for callers not yet migrated. */
export function canvasTemplateToSections(
  template: CanvasTemplate | null | undefined,
  defaults?: CanvasDefaults | null,
): ConfigSection[] {
  return canvasTemplateToItems(template, defaults)
}

// ---------------------------------------------------------------------------
// Fetchers (localStorage 'token' Bearer — the SAME source configurationCanvasApi
// and authFetch use; deliberately NOT the tools-integration 'authToken').
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/** Fetch the parsed canvas.yaml template for an app's configuration type. */
export async function fetchCanvasTemplate(
  appId: string,
  configTypeId: string,
): Promise<CanvasTemplate> {
  const res = await fetch(
    `${API_URL}/apps/${encodeURIComponent(appId)}/config-types/${encodeURIComponent(
      configTypeId,
    )}/canvas`,
    { method: 'GET', headers: authHeaders(), credentials: 'include' },
  )
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized: Please log in again.')
    if (res.status === 404) throw new Error('This configuration type has no canvas template.')
    throw new Error(`Failed to load canvas template: ${res.statusText}`)
  }
  return res.json()
}

/**
 * Fetch the defaults.yaml values for an app's configuration type. Defaults are
 * optional, so a non-OK response resolves to {} rather than throwing — a new
 * config simply starts from the template's own field defaults.
 */
export async function fetchCanvasDefaults(
  appId: string,
  configTypeId: string,
): Promise<CanvasDefaults> {
  try {
    const res = await fetch(
      `${API_URL}/apps/${encodeURIComponent(appId)}/config-types/${encodeURIComponent(
        configTypeId,
      )}/defaults`,
      { method: 'GET', headers: authHeaders(), credentials: 'include' },
    )
    if (!res.ok) return {}
    return (await res.json()) as CanvasDefaults
  } catch {
    return {}
  }
}
