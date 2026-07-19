import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Download, FileText, FolderTree, LayoutList, Plus, Search, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ConfigField, FieldInputProps, FieldOption, FileEntry, FileCatalogEntry, KeyValueEntry } from '../../types';
import { KeyValueField } from './KeyValueField';
import { useConfigCanvasContext } from '../../context';
import { configurationCanvasApi, type ConfigurationCanvasListItem } from '../../api/configurationCanvasApi';

/**
 * FilesField — author files laid out in an app/TA folder structure.
 *
 * Each row is one file: a top-level folder (default/, bin/, static/, …), a
 * filename, and its text content. The field value is a `FileEntry[]`
 * (`{ path, content }`), where `path` is `<folder>/<filename>`. Used by the
 * Splunk Apps configuration type to let users build an app/TA from
 * configuration files, scripts, libraries and static assets when the app is
 * not installed from Splunkbase.
 *
 * `field.options` (value = folder, e.g. "default") drive the folder picker; a
 * sensible Splunk default set is used when none are provided.
 */

const DEFAULT_FOLDERS: FieldOption[] = [
  { value: 'default', label: 'default/' },
  { value: 'local', label: 'local/' },
  { value: 'bin', label: 'bin/' },
  { value: 'static', label: 'static/' },
  { value: 'metadata', label: 'metadata/' },
  { value: 'lookups', label: 'lookups/' },
  { value: 'lib', label: 'lib/' },
  { value: 'README', label: 'README/' },
];

/** Split a stored `path` into its top-level folder and the remainder (filename). */
function splitPath(path: string): { folder: string; filename: string } {
  const trimmed = (path ?? '').replace(/^\/+/, '');
  const slash = trimmed.indexOf('/');
  if (slash === -1) return { folder: '', filename: trimmed };
  return { folder: trimmed.slice(0, slash), filename: trimmed.slice(slash + 1) };
}

/** Join a folder + filename back into a stored `path`. */
function joinPath(folder: string, filename: string): string {
  const f = folder.trim().replace(/\/+$/, '');
  const name = filename.trim().replace(/^\/+/, '');
  return f ? `${f}/${name}` : name;
}

// ---------------------------------------------------------------------------
// CatalogCombobox — a contained, portaled, searchable filename picker.
//
// Behaves like the platform's other dropdowns (Select/MultiSelect): a styled
// trigger + a floating panel rendered in a portal so it's never clipped by the
// canvas's scroll containers. Free-text is allowed (type any custom filename);
// the panel suggests known catalog files with their descriptions.
// ---------------------------------------------------------------------------

interface CatalogComboboxProps {
  value: string;
  entries: FileCatalogEntry[];
  disabled?: boolean;
  onChange: (filename: string) => void;
}

const CatalogCombobox: React.FC<CatalogComboboxProps> = ({ value, entries, disabled, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = spaceBelow < 300 && rect.top > spaceBelow;
    setMenuPos({
      left: rect.left,
      width: Math.max(rect.width, 260),
      top: dropUp ? undefined : rect.bottom + 4,
      bottom: dropUp ? window.innerHeight - rect.top + 4 : undefined,
    });
  }, []);

  const selectedEntry = entries.find((e) => e.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.value.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q),
    );
  }, [entries, query]);

  const open = useCallback(() => {
    if (disabled) return;
    setQuery('');
    setIsOpen(true);
  }, [disabled]);

  const close = useCallback((focusTrigger = true) => {
    setIsOpen(false);
    setQuery('');
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) close(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const handle = () => updateMenuPosition();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [isOpen, updateMenuPosition]);

  const commit = (filename: string) => {
    onChange(filename);
    close();
  };

  return (
    <div ref={containerRef} className="relative min-w-[120px] flex-1">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label="Filename"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-left text-gray-900 dark:text-gray-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
      >
        <span className={`truncate font-mono ${value ? '' : 'text-gray-400 dark:text-gray-500'}`}>
          {value || 'Choose or type a .conf file…'}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && menuPos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: menuPos.top,
            bottom: menuPos.bottom,
            left: menuPos.left,
            width: menuPos.width,
            zIndex: 1000,
          }}
          className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 px-2.5 py-2">
            <Search size={14} aria-hidden="true" className="flex-shrink-0 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  close();
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  // Commit either the top suggestion or the typed custom name.
                  commit(filtered[0]?.value ?? query.trim());
                }
              }}
              placeholder="Filter or type a custom filename…"
              aria-label="Filter files"
              className="w-full bg-transparent text-sm font-mono text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400 placeholder:font-sans"
            />
          </div>
          <ul role="listbox" aria-label="Configuration files" className="max-h-60 overflow-auto py-1">
            {query.trim() && !entries.some((e) => e.value === query.trim()) && (
              <li
                role="option"
                aria-selected={false}
                onClick={() => commit(query.trim())}
                className="cursor-pointer px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                Use custom name “<span className="font-mono">{query.trim()}</span>”
              </li>
            )}
            {filtered.length === 0 && !query.trim() && (
              <li className="px-3 py-2 text-sm text-gray-400">No files</li>
            )}
            {filtered.map((entry) => {
              const isSelected = entry.value === value;
              return (
                <li
                  key={entry.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => commit(entry.value)}
                  className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <Check
                    size={14}
                    aria-hidden="true"
                    className={`mt-0.5 flex-shrink-0 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-transparent'}`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-gray-900 dark:text-gray-100">{entry.value}</span>
                    {entry.description && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{entry.description}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Conf form editor — the "Form" view of a .conf file.
//
// A .conf file is a list of stanzas (`[stanza]`) each holding `key = value`
// attributes. The form parses the text into that structure and lets the user
// edit stanzas + attributes as fields (like the Indexes/Roles forms), then
// serializes back to .conf text so the stored value stays a plain file. Round-
// tripping is structural: comments are dropped once you edit in form view.
// ---------------------------------------------------------------------------

interface ConfStanzaModel {
  name: string;
  attributes: KeyValueEntry[];
}

/** Parse .conf text into stanzas; pre-header `key = value` lines go under `default`. */
export function parseConfText(text: string): ConfStanzaModel[] {
  const stanzas: ConfStanzaModel[] = [];
  let current: ConfStanzaModel | null = null;
  const preHeader: KeyValueEntry[] = [];
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const header = /^\[(.*)\]$/.exec(line);
    if (header) {
      if (current) stanzas.push(current);
      current = { name: header[1].trim(), attributes: [] };
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    const value = line.slice(eq + 1).trim();
    if (current) current.attributes.push({ key, value });
    else preHeader.push({ key, value });
  }
  if (current) stanzas.push(current);
  if (preHeader.length > 0) stanzas.unshift({ name: 'default', attributes: preHeader });
  return stanzas;
}

/** Serialize stanzas back to .conf text. */
export function serializeConf(stanzas: ConfStanzaModel[]): string {
  if (stanzas.length === 0) return '';
  const blocks = stanzas.map((stanza) => {
    const header = `[${stanza.name || 'default'}]`;
    const attrs = stanza.attributes
      .filter((a) => a.key.trim() !== '')
      .map((a) => `${a.key.trim()} = ${a.value}`)
      .join('\n');
    return attrs ? `${header}\n${attrs}` : header;
  });
  return `${blocks.join('\n\n')}\n`;
}

/** Minimal field object so a stanza's attributes can reuse KeyValueField. */
const ATTR_FIELD: ConfigField = {
  id: 'conf-attrs',
  key: 'attributes',
  label: '',
  type: 'keyvalue',
  value: [],
  order: 0,
  placeholder: 'No attributes yet — add key = value pairs.',
};

const ConfStanzaEditor: React.FC<{
  content: string;
  disabled?: boolean;
  onChange: (text: string) => void;
}> = ({ content, disabled, onChange }) => {
  // Parse once on mount; the form is the editor of record while open.
  const [stanzas, setStanzas] = useState<ConfStanzaModel[]>(() => parseConfText(content));

  const apply = (next: ConfStanzaModel[]) => {
    setStanzas(next);
    onChange(serializeConf(next));
  };

  const removeStanza = (index: number) => apply(stanzas.filter((_, i) => i !== index));
  const setStanzaAttributes = (index: number, attributes: KeyValueEntry[]) =>
    apply(stanzas.map((s, i) => (i === index ? { ...s, attributes } : s)));

  const isDefault = (s: ConfStanzaModel) => (s.name || 'default').toLowerCase() === 'default';
  const hasDefault = stanzas.some(isDefault);
  const addDefaultValues = () => apply([{ name: 'default', attributes: [] }, ...stanzas]);

  // The [default] stanza floats to the top; its values are inherited by every
  // other stanza in the file (Splunk's native mechanism for shared defaults).
  const ordered = stanzas
    .map((stanza, index) => ({ stanza, index }))
    .sort((a, b) => Number(isDefault(b.stanza)) - Number(isDefault(a.stanza)));

  return (
    <div className="space-y-3 p-3">
      {stanzas.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No stanzas in this file yet — add default values below, or switch to{' '}
          <span className="font-medium">Text</span> to add stanzas.
        </p>
      )}

      {!disabled && !hasDefault && (
        <button
          type="button"
          onClick={addDefaultValues}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add default values
        </button>
      )}

      {ordered.map(({ stanza, index }) => {
        const def = isDefault(stanza);
        return (
          <div
            key={index}
            className={`rounded-md border ${def ? 'border-blue-300 dark:border-blue-700' : 'border-gray-200 dark:border-gray-700'}`}
          >
            <div
              className={`flex items-center gap-2 border-b px-2 py-1.5 ${
                def
                  ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40'
              }`}
            >
              {def ? (
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Default values{' '}
                  <span className="font-normal text-blue-600/80 dark:text-blue-300/70">
                    — applied to all stanzas in this file
                  </span>
                </span>
              ) : (
                <>
                  <span className="font-mono text-sm text-gray-400" aria-hidden="true">[</span>
                  <span
                    className="flex-1 truncate rounded-md bg-white dark:bg-gray-700 px-2 py-1 text-sm font-mono text-gray-700 dark:text-gray-200"
                    title={stanza.name}
                  >
                    {stanza.name}
                  </span>
                  <span className="font-mono text-sm text-gray-400" aria-hidden="true">]</span>
                </>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeStanza(index)}
                  aria-label={def ? 'Remove default values' : `Remove stanza ${stanza.name || index + 1}`}
                  className="ml-auto rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="p-2">
              <KeyValueField
                field={ATTR_FIELD}
                value={stanza.attributes}
                onChange={(attrs) => setStanzaAttributes(index, attrs as KeyValueEntry[])}
                disabled={disabled}
                lockKeys={!def}
              />
            </div>
          </div>
        );
      })}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Author shared defaults in <span className="font-medium">Default values</span>; other stanzas
        inherit them and expose editable values only. Use <span className="font-medium">Text</span> to
        add or rename stanzas and keys.
      </p>
    </div>
  );
};

export const FilesField: React.FC<FieldInputProps<FileEntry[]>> = ({
  field,
  value,
  onChange,
  error,
  disabled = false,
  className = '',
}) => {
  const files = useMemo<FileEntry[]>(() => (Array.isArray(value) ? value : []), [value]);
  const folders = field.options && field.options.length > 0 ? field.options : DEFAULT_FOLDERS;
  const catalog = useMemo<FileCatalogEntry[]>(() => field.fileCatalog ?? [], [field.fileCatalog]);

  // Cross-config import: pull this same field's files from another saved config
  // of the same type. The deploy pipeline can't resolve references, so imported
  // files are a read-only SNAPSHOT copy; edit the source config to change them.
  const { toolType, entityType } = useConfigCanvasContext();
  const canImport = Boolean(toolType && entityType);
  const [importList, setImportList] = useState<ConfigurationCanvasListItem[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const openImport = async () => {
    setImportOpen(true);
    setImportError(null);
    if (importList) return;
    try {
      const list = await configurationCanvasApi.getAll({ toolType, entityType });
      setImportList(list);
    } catch {
      setImportError('Could not load configurations to import from.');
      setImportList([]);
    }
  };

  const importFrom = async (item: ConfigurationCanvasListItem) => {
    setImportError(null);
    try {
      const canvas = await configurationCanvasApi.getById(item.id);
      const sections = configurationCanvasApi.sectionsFromApi(canvas.sections);
      const incoming: FileEntry[] = [];
      for (const section of sections) {
        for (const f of section.fields) {
          if (f.key === field.key && Array.isArray(f.value)) {
            for (const fe of f.value as FileEntry[]) {
              if (fe && typeof fe.path === 'string') {
                incoming.push({ path: fe.path, content: fe.content ?? '', imported: true, source: item.name });
              }
            }
          }
        }
      }
      if (incoming.length === 0) {
        setImportError(`"${item.name}" has no files to import.`);
        return;
      }
      update([...files, ...incoming]);
      setImportOpen(false);
    } catch {
      setImportError(`Could not import from "${item.name}".`);
    }
  };

  // Which file rows are shown in the structured "Form" view (vs raw text). Keyed
  // by row index — transient UI state, reset naturally as rows change.
  const [formModes, setFormModes] = useState<Set<number>>(new Set());
  const toggleFormMode = (index: number) =>
    setFormModes((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });

  /** A .conf file under default/local can be edited as a structured stanza form. */
  const isConfFile = (folder: string, filename: string): boolean =>
    (folder === 'default' || folder === 'local') && filename.trim().toLowerCase().endsWith('.conf');

  /** Catalog entries that apply to a given folder (defaults to default/ + local/). */
  const catalogForFolder = (folder: string): FileCatalogEntry[] =>
    catalog.filter((entry) =>
      entry.folders && entry.folders.length > 0
        ? entry.folders.includes(folder)
        : folder === 'default' || folder === 'local',
    );

  const update = (next: FileEntry[]) => onChange(next);

  const addFile = () => {
    update([...files, { path: `${folders[0]?.value ?? 'default'}/`, content: '' }]);
  };

  const removeFile = (index: number) => {
    update(files.filter((_, i) => i !== index));
  };

  const setFolder = (index: number, folder: string) => {
    const { filename } = splitPath(files[index].path);
    update(files.map((f, i) => (i === index ? { ...f, path: joinPath(folder, filename) } : f)));
  };

  const setFilename = (index: number, filename: string) => {
    const { folder } = splitPath(files[index].path);
    update(files.map((f, i) => (i === index ? { ...f, path: joinPath(folder, filename) } : f)));
  };

  /**
   * Choose a filename from the catalog: sets the path and, when the content is
   * still empty, autopopulates the editor with the file's starter template (or
   * a commented header derived from its description).
   */
  const chooseCatalogFile = (index: number, filename: string) => {
    const { folder } = splitPath(files[index].path);
    const entry = catalogForFolder(folder).find((e) => e.value === filename);
    const seed =
      entry?.template ??
      (entry ? `# ${filename}${entry.description ? ` — ${entry.description}` : ''}\n` : undefined);
    update(
      files.map((f, i) => {
        if (i !== index) return f;
        const path = joinPath(folder, filename);
        const shouldSeed = seed !== undefined && (f.content ?? '').trim() === '';
        return { ...f, path, content: shouldSeed ? seed : f.content };
      }),
    );
  };

  const setContent = (index: number, content: string) => {
    update(files.map((f, i) => (i === index ? { ...f, content } : f)));
  };

  return (
    <div className={className}>
      <div className="space-y-3">
        {files.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 dark:border-gray-600 px-4 py-6 text-center">
            <FolderTree className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {field.placeholder || 'No files yet — add configuration files, scripts, or assets for the app/TA folder structure.'}
            </p>
          </div>
        )}

        {files.map((file, index) => {
          const { folder, filename } = splitPath(file.path);
          const folderCatalog = catalogForFolder(folder);
          const selectedEntry = folderCatalog.find((e) => e.value === filename);
          const confEditable = isConfFile(folder, filename);
          const formView = confEditable && formModes.has(index);
          const rowDisabled = disabled || Boolean(file.imported);
          return (
            <div
              key={index}
              className={`rounded-md border bg-white dark:bg-gray-800 ${
                file.imported ? 'border-indigo-300 dark:border-indigo-700' : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              {file.imported && (
                <div className="flex items-center justify-between gap-2 border-b border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1 text-xs text-indigo-700 dark:text-indigo-300">
                  <span className="inline-flex items-center gap-1">
                    <Download className="h-3 w-3" aria-hidden="true" />
                    Imported{file.source ? ` from “${file.source}”` : ''} — read-only
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 p-2">
                <select
                  aria-label="Folder"
                  value={folders.some((o) => o.value === folder) ? folder : ''}
                  disabled={rowDisabled}
                  onChange={(e) => setFolder(index, e.target.value)}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100 disabled:opacity-60"
                >
                  {!folders.some((o) => o.value === folder) && <option value="">{folder || 'folder'}/</option>}
                  {folders.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {folderCatalog.length > 0 ? (
                  <CatalogCombobox
                    value={filename}
                    entries={folderCatalog}
                    disabled={rowDisabled}
                    onChange={(name) => chooseCatalogFile(index, name)}
                  />
                ) : (
                  <input
                    type="text"
                    aria-label="Filename"
                    value={filename}
                    disabled={rowDisabled}
                    onChange={(e) => setFilename(index, e.target.value)}
                    placeholder="e.g. inputs.conf"
                    className="flex-1 min-w-[120px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 font-mono text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  />
                )}
                {confEditable && (
                  <button
                    type="button"
                    onClick={() => toggleFormMode(index)}
                    aria-pressed={formView}
                    title={formView ? 'View as text' : 'View as form'}
                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    {formView ? (
                      <>
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        Text
                      </>
                    ) : (
                      <>
                        <LayoutList className="h-3.5 w-3.5" aria-hidden="true" />
                        Form
                      </>
                    )}
                  </button>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label={`Remove ${file.path || 'file'}`}
                    className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              {selectedEntry?.description && (
                <p className="border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {selectedEntry.label || selectedEntry.value}: {selectedEntry.description}
                </p>
              )}
              {formView ? (
                <ConfStanzaEditor
                  content={file.content}
                  disabled={rowDisabled}
                  onChange={(text) => setContent(index, text)}
                />
              ) : (
                <textarea
                  aria-label={`Content of ${file.path || 'file'}`}
                  value={file.content}
                  disabled={rowDisabled}
                  onChange={(e) => setContent(index, e.target.value)}
                  spellCheck={false}
                  rows={6}
                  placeholder="File contents…"
                  className="block w-full resize-y rounded-b-md border-0 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 disabled:opacity-60"
                />
              )}
            </div>
          );
        })}
      </div>

      {!disabled && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addFile}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add file
          </button>

          {canImport && (
            <div className="relative">
              <button
                type="button"
                onClick={() => (importOpen ? setImportOpen(false) : openImport())}
                aria-expanded={importOpen}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Import from saved config
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${importOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {importOpen && (
                <div className="absolute z-20 mt-1 max-h-72 w-80 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                  {importList === null && (
                    <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
                  )}
                  {importError && (
                    <p className="px-3 py-2 text-sm text-red-600 dark:text-red-400">{importError}</p>
                  )}
                  {importList !== null && importList.length === 0 && !importError && (
                    <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No saved configurations to import.</p>
                  )}
                  {(importList ?? []).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => importFrom(item)}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
                      {item.description && (
                        <span className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">{item.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};

export default FilesField;
