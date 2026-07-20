/**
 * Field visibility — evaluate a field's `visibleWhen` condition against the
 * current values of its sibling fields. Pure and side-effect-free so both the
 * renderer (ConfigSection) and validation (validationUtils) share one source of
 * truth for "is this field showing right now".
 */

import { ConfigField } from '../types';

/**
 * Loose scalar equality. Canvas field values can arrive as strings even for
 * number/boolean fields (form inputs), so compare by string when a strict
 * match fails. Nullish values only match other nullish values.
 */
function scalarEquals(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (actual === undefined || actual === null || expected === undefined || expected === null) {
    return false;
  }
  return String(actual) === String(expected);
}

/** Build a `{ key: value }` lookup from an item's fields. */
export function fieldValueMap(
  fields: Array<Pick<ConfigField, 'key' | 'value'>>,
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const field of fields) map[field.key] = field.value;
  return map;
}

/**
 * Whether a field should render given its siblings' current values. A field
 * with no `visibleWhen` is always visible. A malformed condition (missing
 * `field`, or neither `equals` nor `in`) fails OPEN — visible — so a bad
 * template can never hide everything.
 */
export function isFieldVisible(
  field: Pick<ConfigField, 'visibleWhen'>,
  siblingValues: Record<string, unknown>,
): boolean {
  const cond = field.visibleWhen;
  if (!cond || !cond.field) return true;
  const actual = siblingValues[cond.field];
  if (Array.isArray(cond.in)) return cond.in.some((expected) => scalarEquals(actual, expected));
  if (cond.equals !== undefined) return scalarEquals(actual, cond.equals);
  return true;
}
