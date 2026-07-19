import React, { useState, useRef, useEffect } from 'react';
import {
  Save,
  Download,
  Upload,
  Undo2,
  Redo2,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  FileJson,
  FileText,
  FileCode,
  Pencil,
} from 'lucide-react';
import { CanvasToolbarProps, ExportFormat } from '../types';

/**
 * CanvasToolbar - Top toolbar for the configuration canvas
 *
 * Layout: two rows.
 *   Row 1 — the configuration-type title, full width at the top.
 *   Row 2 — the editable configuration name + validation status on the left,
 *           and the action buttons (Upload / Export / Cancel / Save) on the
 *           right, all on a single line.
 *
 * Keeping the title on its own row stops it (and the name) from being squeezed
 * into narrow, letter-wrapped columns when the action buttons compete for space.
 */
export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  title,
  configName,
  onConfigNameChange,
  onSave,
  onCancel,
  onExport,
  onUpload,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isSaving = false,
  isDirty = false,
  validationResult,
  className = '',
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(configName || '');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync edited name when configName prop changes
  useEffect(() => {
    if (!isEditingName) {
      setEditedName(configName || '');
    }
  }, [configName, isEditingName]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameSubmit = () => {
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== configName) {
      onConfigNameChange?.(trimmedName);
    } else {
      setEditedName(configName || '');
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setEditedName(configName || '');
      setIsEditingName(false);
    }
  };

  const exportOptions: { format: ExportFormat; label: string; icon: React.ReactNode }[] = [
    { format: 'json', label: 'JSON', icon: <FileJson className="w-4 h-4" /> },
    { format: 'yaml', label: 'YAML', icon: <FileText className="w-4 h-4" /> },
    { format: 'conf', label: '.conf (Splunk)', icon: <FileCode className="w-4 h-4" /> },
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const hasErrors = validationResult && !validationResult.isValid;
  const errorCount = validationResult?.errors.length ?? 0;

  // The editable configuration name reads the same as the title for a brand-new
  // configuration, so only show it as a separate line once it diverges (or is
  // being edited) — otherwise it reads as a duplicated title.
  const showConfigName =
    !!onConfigNameChange &&
    (isEditingName || (!!configName && configName.trim() !== (title ?? '').trim()));

  return (
    <div
      className={`
        flex flex-col gap-3
        px-4 py-3
        bg-white dark:bg-gray-800
        border-b border-gray-200 dark:border-gray-700
        ${className}
      `}
    >
      {/* Row 1 - Title, full width at the top */}
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        {title}
      </h2>

      {/* Row 2 - Name + status (left) and actions (right), on one line */}
      <div className="flex items-center justify-between gap-4 flex-wrap gap-y-2">
        {/* Left side - editable configuration name and status */}
        <div className="flex items-center gap-3 min-w-0">
          {showConfigName &&
            (isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={handleNameKeyDown}
                className="
                  px-2 py-1
                  text-sm font-medium
                  text-gray-900 dark:text-white
                  bg-white dark:bg-gray-700
                  border border-blue-500
                  rounded-md
                  focus:ring-2 focus:ring-blue-500 focus:outline-none
                  min-w-[150px] max-w-[300px]
                "
                placeholder="Enter configuration name"
              />
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="
                  flex items-center gap-1.5 min-w-0
                  px-2 py-1
                  text-sm font-medium text-gray-700 dark:text-gray-300
                  hover:bg-gray-100 dark:hover:bg-gray-700
                  rounded-md
                  transition-colors
                  group
                "
                title="Click to rename"
              >
                <span className="text-gray-900 dark:text-white truncate">
                  {configName || 'Untitled'}
                </span>
                <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))}

          {/* A rename affordance even when the name still matches the title */}
          {!showConfigName && !!onConfigNameChange && (
            <button
              onClick={() => setIsEditingName(true)}
              className="
                flex items-center gap-1.5
                px-2 py-1
                text-sm font-medium text-gray-500 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-700
                rounded-md transition-colors
              "
              title="Rename this configuration"
            >
              <Pencil className="w-3.5 h-3.5" />
              Rename
            </button>
          )}

          {/* Dirty indicator */}
          {isDirty && (
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              Unsaved changes
            </span>
          )}

          {/* Validation status */}
          {validationResult && (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              {hasErrors ? (
                <>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {errorCount} {errorCount === 1 ? 'error' : 'errors'}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-green-600 dark:text-green-400">Valid</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Undo/Redo */}
          {(onUndo || onRedo) && (
            <div className="flex items-center gap-1 mr-2">
              {onUndo && (
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Undo"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
              )}
              {onRedo && (
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Redo"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Upload button */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.yaml,.yml,.conf,.ini"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="
              flex items-center gap-2 px-3 py-2
              text-sm font-medium text-gray-700 dark:text-gray-300
              bg-white dark:bg-gray-700
              border border-gray-300 dark:border-gray-600
              rounded-md
              hover:bg-gray-50 dark:hover:bg-gray-600
              transition-colors
            "
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="
                flex items-center gap-2 px-3 py-2
                text-sm font-medium text-gray-700 dark:text-gray-300
                bg-white dark:bg-gray-700
                border border-gray-300 dark:border-gray-600
                rounded-md
                hover:bg-gray-50 dark:hover:bg-gray-600
                transition-colors
              "
            >
              <Download className="w-4 h-4" />
              Export
              <ChevronDown className="w-3 h-3" />
            </button>

            {showExportMenu && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                {/* Menu */}
                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-20">
                  {exportOptions.map((option) => (
                    <button
                      key={option.format}
                      onClick={() => {
                        onExport(option.format);
                        setShowExportMenu(false);
                      }}
                      className="
                        flex items-center gap-2 w-full px-4 py-2
                        text-sm text-gray-700 dark:text-gray-300
                        hover:bg-gray-100 dark:hover:bg-gray-700
                        first:rounded-t-md last:rounded-b-md
                      "
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />

          {/* Cancel button */}
          <button
            onClick={onCancel}
            className="
              flex items-center gap-2 px-4 py-2
              text-sm font-medium text-gray-700 dark:text-gray-300
              bg-white dark:bg-gray-700
              border border-gray-300 dark:border-gray-600
              rounded-md
              hover:bg-gray-50 dark:hover:bg-gray-600
              transition-colors
            "
          >
            Cancel
          </button>

          {/* Save button */}
          <button
            onClick={onSave}
            disabled={isSaving || hasErrors}
            className="
              flex items-center gap-2 px-4 py-2
              text-sm font-medium text-white
              bg-orange-500 hover:bg-orange-600
              disabled:bg-orange-300 disabled:cursor-not-allowed
              rounded-md
              transition-colors
            "
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CanvasToolbar;
