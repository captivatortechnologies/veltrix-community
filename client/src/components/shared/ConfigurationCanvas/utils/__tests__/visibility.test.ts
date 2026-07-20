import { describe, it, expect } from 'vitest';
import { isFieldVisible, fieldValueMap } from '../visibility';

describe('fieldValueMap', () => {
  it('builds a key->value lookup from fields', () => {
    expect(
      fieldValueMap([
        { key: 'mode', value: 'json' },
        { key: 'x', value: 2 },
      ]),
    ).toEqual({ mode: 'json', x: 2 });
  });
});

describe('isFieldVisible', () => {
  it('is always visible with no condition', () => {
    expect(isFieldVisible({}, {})).toBe(true);
    expect(isFieldVisible({ visibleWhen: undefined }, { mode: 'json' })).toBe(true);
  });

  it('honors equals (exact and loose string/number match)', () => {
    expect(isFieldVisible({ visibleWhen: { field: 'mode', equals: 'json' } }, { mode: 'json' })).toBe(true);
    expect(isFieldVisible({ visibleWhen: { field: 'mode', equals: 'json' } }, { mode: 'guided' })).toBe(false);
    // A number field's value may arrive as the string "5".
    expect(isFieldVisible({ visibleWhen: { field: 'n', equals: 5 } }, { n: '5' })).toBe(true);
    expect(isFieldVisible({ visibleWhen: { field: 'on', equals: true } }, { on: true })).toBe(true);
  });

  it('honors in (membership)', () => {
    const f = { visibleWhen: { field: 'mode', in: ['keyvalue', 'json'] } };
    expect(isFieldVisible(f, { mode: 'json' })).toBe(true);
    expect(isFieldVisible(f, { mode: 'keyvalue' })).toBe(true);
    expect(isFieldVisible(f, { mode: 'guided' })).toBe(false);
  });

  it('hides when the referenced sibling has no value', () => {
    expect(isFieldVisible({ visibleWhen: { field: 'mode', equals: 'json' } }, {})).toBe(false);
    expect(isFieldVisible({ visibleWhen: { field: 'mode', in: ['json'] } }, {})).toBe(false);
  });

  it('fails OPEN (visible) on a malformed condition', () => {
    // Neither equals nor in — a bad template must not hide everything.
    expect(isFieldVisible({ visibleWhen: { field: 'mode' } }, { mode: 'json' })).toBe(true);
    // Missing field key.
    expect(isFieldVisible({ visibleWhen: { field: '' } }, { mode: 'json' })).toBe(true);
  });
});
