import React, { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FieldInputProps, KeyValueEntry } from '../../types';

/**
 * KeyValueField — edit a list of `key = value` attributes (e.g. the attributes
 * of a Splunk .conf stanza). The field value is `KeyValueEntry[]`. Used by the
 * generic Splunk config-file form and reusable anywhere a flat attribute map is
 * authored.
 *
 * `lockKeys` renders attribute keys as read-only labels and hides the "Add
 * attribute" action — the form then only edits VALUES of a fixed set of keys
 * (structural changes are made in the raw text view).
 */
export const KeyValueField: React.FC<FieldInputProps<KeyValueEntry[]> & { lockKeys?: boolean }> = ({
  field,
  value,
  onChange,
  error,
  disabled = false,
  className = '',
  lockKeys = false,
}) => {
  const rows = useMemo<KeyValueEntry[]>(() => (Array.isArray(value) ? value : []), [value]);

  const update = (next: KeyValueEntry[]) => onChange(next);
  const addRow = () => update([...rows, { key: '', value: '' }]);
  const removeRow = (index: number) => update(rows.filter((_, i) => i !== index));
  const setKey = (index: number, key: string) =>
    update(rows.map((r, i) => (i === index ? { ...r, key } : r)));
  const setValue = (index: number, val: string) =>
    update(rows.map((r, i) => (i === index ? { ...r, value: val } : r)));

  return (
    <div className={className}>
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {field.placeholder || 'No attributes yet — add key = value pairs.'}
          </p>
        )}
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            {lockKeys ? (
              <span
                className="w-1/3 min-w-[120px] truncate rounded-md bg-gray-100 dark:bg-gray-700/60 px-2 py-1.5 text-sm font-mono text-gray-700 dark:text-gray-200"
                title={row.key}
              >
                {row.key}
              </span>
            ) : (
              <input
                type="text"
                aria-label="Attribute name"
                value={row.key}
                disabled={disabled}
                onChange={(e) => setKey(index, e.target.value)}
                placeholder="key"
                className="w-1/3 min-w-[120px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm font-mono text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            )}
            <span className="text-gray-400" aria-hidden="true">=</span>
            <input
              type="text"
              aria-label="Attribute value"
              value={row.value}
              disabled={disabled}
              onChange={(e) => setValue(index, e.target.value)}
              placeholder="value"
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm font-mono text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => removeRow(index)}
                aria-label={`Remove ${row.key || 'attribute'}`}
                className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!disabled && !lockKeys && (
        <button
          type="button"
          onClick={addRow}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add attribute
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};

export default KeyValueField;
