import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import { FieldInputProps } from '../../types';
import { useConfigCanvasContext } from '../../context';
import { fetchConfigOptions, type ConfigOptionItem } from '@/pages/apps/appConfigResources';

/**
 * Generic live multi-select. Fetches its options from the app's options provider
 * (GET /apps/:appId/config-options?source=<field.optionsSource>) — the label is
 * shown, the value/id is stored. Nothing app-specific lives here; the app decides
 * what a `source` returns. Value shape: string[] of ids.
 */
export const RemoteMultiSelectField: React.FC<FieldInputProps<string[]>> = ({
  field,
  value,
  onChange,
  error,
  disabled,
  className,
}) => {
  const { appId, entityType, environmentId } = useConfigCanvasContext();
  const selected = Array.isArray(value) ? value : [];
  const source = field.optionsSource ?? '';
  const multi = field.optionsMulti !== false;
  const canFetch = Boolean(appId && entityType && source);

  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<ConfigOptionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // id -> label cache, so selected chips keep their name even when the id is not
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

  const toggle = (v: string, label?: string) => {
    if (label) labelCache.current.set(v, label);
    if (!multi) {
      onChange(selected.includes(v) ? [] : [v]);
      return;
    }
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  const remove = (v: string) => onChange(selected.filter((x) => x !== v));
  const labelFor = (v: string) => labelCache.current.get(v) || v;

  return (
    <div className={className}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full"
            >
              {labelFor(v)}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(v)}
                  className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
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
                  const isSel = selected.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 ${
                        isSel ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggle(opt.value, opt.label)}
                        disabled={disabled}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900 dark:text-white">{opt.label}</span>
                      {opt.description && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">- {opt.description}</span>
                      )}
                    </label>
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
