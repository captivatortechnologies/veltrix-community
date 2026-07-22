import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import { FieldInputProps } from '../../types';
import { useConfigCanvasContext } from '../../context';
import { fetchConfigOptions, type ConfigOptionItem } from '@/pages/apps/appConfigResources';

/**
 * Generic live single-select. The single-value sibling of RemoteMultiSelectField:
 * fetches its options from the app's options provider
 * (GET /apps/:appId/config-options?source=<field.optionsSource>) — the label is
 * shown, and a SINGLE value/id is stored as a bare string (not an array), so it
 * drops into any existing single-id text field without changing the value shape.
 */
export const RemoteSelectField: React.FC<FieldInputProps<string>> = ({
  field,
  value,
  onChange,
  error,
  disabled,
  className,
}) => {
  const { appId, entityType, environmentId } = useConfigCanvasContext();
  const selected = typeof value === 'string' ? value : '';
  const source = field.optionsSource ?? '';
  const canFetch = Boolean(appId && entityType && source);

  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<ConfigOptionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // id -> label cache, so the selected value keeps its name even when it is not
  // in the currently-fetched page (e.g. after a filtered search).
  const labelCache = useRef<Map<string, string>>(new Map());

  const load = useCallback(
    async (q: string) => {
      if (!canFetch) return;
      setLoading(true);
      setLoadError(null);
      try {
        const opts = await fetchConfigOptions({
          appId: appId as string,
          configTypeId: entityType as string,
          source,
          environmentId,
          query: q || undefined,
        });
        setOptions(opts);
        opts.forEach((o) => labelCache.current.set(o.value, o.label));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load options');
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [appId, entityType, source, environmentId, canFetch],
  );

  // Debounced fetch while the list is open and the query changes.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void load(query);
    }, 250);
    return () => clearTimeout(t);
  }, [open, query, load]);

  // Resolve a saved selection to its name on edit: without this the pre-selected
  // chip shows the raw stored id until the user opens the dropdown. Fetch the
  // unfiltered first page ONCE when the field mounts with an unresolved value.
  const preloadedRef = useRef(false);
  useEffect(() => {
    if (preloadedRef.current || !canFetch) return;
    if (!selected || labelCache.current.has(selected)) return;
    preloadedRef.current = true;
    void load('');
  }, [canFetch, selected, load]);

  const choose = (v: string, label?: string) => {
    if (label) labelCache.current.set(v, label);
    onChange(v);
    setOpen(false);
  };
  const clear = () => onChange('');
  const labelFor = (v: string) => labelCache.current.get(v) || v;

  return (
    <div className={className}>
      {selected && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
            {labelFor(selected)}
            {!disabled && (
              <button
                type="button"
                onClick={clear}
                className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                aria-label="Clear selection"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        </div>
      )}

      {!canFetch ? (
        <div className="px-3 py-2 text-sm text-amber-600 dark:text-amber-400 border rounded-md border-gray-300 dark:border-gray-600">
          {source
            ? 'Save a connection and assign an environment for this app to load options.'
            : 'This field has no options source configured.'}
        </div>
      ) : (
        <div
          className={`border rounded-md ${
            error ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
          } ${disabled ? 'bg-gray-100 dark:bg-gray-800' : 'bg-white dark:bg-gray-700'}`}
        >
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-200 dark:border-gray-600">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              disabled={disabled}
              placeholder={field.placeholder || 'Search…'}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              className="w-full bg-transparent text-sm text-gray-900 dark:text-white outline-none"
            />
            {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
          </div>
          {open && (
            <div className="max-h-48 overflow-y-auto">
              {loadError ? (
                <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400">{loadError}</div>
              ) : options.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  {loading ? 'Loading…' : 'No matching options'}
                </div>
              ) : (
                options.map((opt) => {
                  const isSel = selected === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => choose(opt.value, opt.label)}
                      disabled={disabled}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 ${
                        isSel ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <span className="text-sm text-gray-900 dark:text-white">{opt.label}</span>
                      {opt.description && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">- {opt.description}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
