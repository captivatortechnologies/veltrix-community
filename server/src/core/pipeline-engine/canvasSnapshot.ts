import type { CanvasItemSnapshot } from './types'

/**
 * Flatten a canvas's persisted sections into the items handed to app handlers.
 *
 * A section IS one item (one index, one IOC). The item's fields are flat across
 * its presentational groups, so a handler sees every field the user filled in
 * regardless of how the canvas laid them out.
 *
 * Accepts both shapes we hold sections in: the relational `fields: [{key, value}]`
 * rows, and the already-flat `fields: {key: value}` a sandbox run posts.
 */
/**
 * Spread into a CanvasSnapshot literal. Emits `items` and its deprecated
 * `sections` alias from a single flatten, so the two can never disagree.
 */
export function canvasItemsOf(
  sections: Array<{ id?: string; name: string; fields?: unknown }> | undefined | null,
): { items: CanvasItemSnapshot[]; sections: CanvasItemSnapshot[] } {
  const items = toCanvasItems(sections)
  return { items, sections: items }
}

export function toCanvasItems(
  sections: Array<{ id?: string; name: string; fields?: unknown }> | undefined | null,
): CanvasItemSnapshot[] {
  return (sections ?? []).map((section, index) => ({
    id: section.id ?? `item-${index}`,
    name: section.name,
    fields: Array.isArray(section.fields)
      ? (section.fields as Array<{ key: string; value: unknown }>).reduce<Record<string, unknown>>(
          (acc, field) => {
            acc[field.key] = field.value
            return acc
          },
          {},
        )
      : ((section.fields as Record<string, unknown>) ?? {}),
  }))
}
