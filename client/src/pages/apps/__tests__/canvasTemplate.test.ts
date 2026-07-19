/**
 * Tests: canvasTemplate — the generic canvas.yaml -> ConfigSection[] adapter.
 * Pure mapping only (no network).
 */

import { describe, it, expect } from 'vitest'
import {
  canvasTemplateToSections,
  canvasTemplateToItems,
  makeCanvasItem,
  resolveItemSpec,
  type CanvasTemplate,
} from '../canvasTemplate'

const template: CanvasTemplate = {
  name: 'Host Group',
  sections: [
    {
      name: 'General',
      icon: 'Settings',
      description: 'General settings',
      fields: [
        {
          key: 'index_name',
          label: 'Index Name',
          fieldType: 'text',
          required: true,
          defaultValue: 'main',
          validation: { pattern: '^[a-z]+$' },
          helpText: 'lowercase only',
          placeholder: 'e.g. main',
        },
        {
          key: 'policy',
          label: 'Policy',
          fieldType: 'select',
          options: [
            { label: 'Strict', value: 'strict' },
            { label: 'Lax', value: 'lax' },
          ],
        },
        { key: 'notes', label: 'Notes', fieldType: 'textarea' },
      ],
    },
  ],
}

describe('canvasTemplateToSections', () => {
  it('maps fieldType -> type and generates unique ids + order', () => {
    const [section] = canvasTemplateToSections(template)
    expect(section.name).toBe('General')
    expect(section.icon).toBe('Settings')
    expect(section.description).toBe('General settings')
    expect(section.order).toBe(0)
    expect(section.id).toBeTruthy()

    const [f0, f1, f2] = section.fields
    expect(f0.type).toBe('text')
    expect(f1.type).toBe('select')
    expect(f2.type).toBe('textarea')
    expect(f0.order).toBe(0)
    expect(f1.order).toBe(1)
    expect(f2.order).toBe(2)
    expect(f0.id).toBeTruthy()
    expect(f0.id).not.toBe(f1.id)
  })

  it('passes options and validation through and preserves required + copy', () => {
    const [section] = canvasTemplateToSections(template)
    const text = section.fields[0]
    const select = section.fields[1]

    expect(text.required).toBe(true)
    expect(text.validation).toEqual({ pattern: '^[a-z]+$' })
    expect(text.helpText).toBe('lowercase only')
    expect(text.placeholder).toBe('e.g. main')
    expect(text.label).toBe('Index Name')

    expect(select.options).toEqual([
      { label: 'Strict', value: 'strict' },
      { label: 'Lax', value: 'lax' },
    ])
  })

  it('falls back label to key and type to text when absent', () => {
    const [section] = canvasTemplateToSections({
      sections: [{ name: 'S', fields: [{ key: 'bare', fieldType: '' as unknown as string }] }],
    })
    expect(section.fields[0].label).toBe('bare')
    expect(section.fields[0].type).toBe('text')
  })

  it('seeds value from the field defaultValue, else empty string', () => {
    const [section] = canvasTemplateToSections(template)
    expect(section.fields[0].value).toBe('main') // from field defaultValue
    expect(section.fields[1].value).toBe('') // no default anywhere
    expect(section.fields[2].value).toBe('')
  })

  it('merges defaults.yaml values, overriding the field defaultValue', () => {
    const defaults = { General: { index_name: 'from-defaults', policy: 'strict' } }
    const [section] = canvasTemplateToSections(template, defaults)
    expect(section.fields[0].value).toBe('from-defaults') // default override
    expect(section.fields[1].value).toBe('strict') // default fills empty
    expect(section.fields[2].value).toBe('') // untouched
    // The original template defaultValue is still preserved separately.
    expect(section.fields[0].defaultValue).toBe('main')
  })

  it('returns [] for an empty or absent template', () => {
    expect(canvasTemplateToSections(null)).toEqual([])
    expect(canvasTemplateToSections(undefined)).toEqual([])
    expect(canvasTemplateToSections({})).toEqual([])
    expect(canvasTemplateToSections({ sections: [] })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// item: templates — one configuration declaring MANY items
// ---------------------------------------------------------------------------

const itemTemplate: CanvasTemplate = {
  name: 'Indexes',
  item: {
    label: 'Index',
    identityField: 'name',
    repeatable: true,
    minItems: 1,
    maxItems: 100,
    groups: [
      {
        name: 'General',
        icon: 'database',
        fields: [{ key: 'name', label: 'Index Name', fieldType: 'text', required: true }],
      },
      {
        name: 'Sizing',
        fields: [
          { key: 'maxDataSizeMB', label: 'Max Size', fieldType: 'number', defaultValue: 500000 },
          { key: 'frozenTimeDays', label: 'Frozen After', fieldType: 'number', defaultValue: 90 },
        ],
      },
    ],
  },
}

describe('item templates', () => {
  it('puts every group field in ONE item, so nothing is dropped on deploy', () => {
    const items = canvasTemplateToItems(itemTemplate)

    expect(items).toHaveLength(1)
    // The whole point: Sizing's fields live in the same item as General's, rather
    // than in sibling sections that deploy would skip for lacking an identity key.
    expect(items[0].fields.map((f) => f.key)).toEqual(['name', 'maxDataSizeMB', 'frozenTimeDays'])
    expect(items[0].fields.find((f) => f.key === 'maxDataSizeMB')?.group).toBe('Sizing')
  })

  it('inherits defaults so common entries are not retyped, tenant defaults winning', () => {
    const item = makeCanvasItem(itemTemplate, {
      defaults: { frozenTimeDays: 30 },
      customerDefaults: { maxDataSizeMB: 1000, frozenTimeDays: 7 },
    })
    const value = (key: string) => item.fields.find((f) => f.key === key)?.value

    expect(value('maxDataSizeMB')).toBe(1000) // tenant default
    expect(value('frozenTimeDays')).toBe(7) // tenant default beats defaults.yaml (30) and 90
    expect(value('name')).toBe('') // no default anywhere
  })

  it('duplicates an item by seeding it from the source values', () => {
    const seeded = makeCanvasItem(itemTemplate, {
      defaults: { frozenTimeDays: 30 },
      seed: { name: 'web_logs', maxDataSizeMB: 42 },
    })
    const value = (key: string) => seeded.fields.find((f) => f.key === key)?.value

    expect(value('name')).toBe('web_logs')
    expect(value('maxDataSizeMB')).toBe(42) // seed beats the field defaultValue
    expect(value('frozenTimeDays')).toBe(30) // unseeded fields still inherit
    expect(seeded.name).toBe('web_logs') // titled by its identityField
  })

  it('materializes minItems copies', () => {
    const items = canvasTemplateToItems({
      ...itemTemplate,
      item: { ...itemTemplate.item!, minItems: 3 },
    })

    expect(items).toHaveLength(3)
    expect(items.map((i) => i.name)).toEqual(['Index 1', 'Index 2', 'Index 3'])
  })

  it('reads a legacy sections template as one repeatable item', () => {
    const spec = resolveItemSpec(template)

    expect(spec.repeatable).toBe(true)
    expect(spec.label).toBe('General')
    expect(spec.identityField).toBeUndefined()
  })
})
