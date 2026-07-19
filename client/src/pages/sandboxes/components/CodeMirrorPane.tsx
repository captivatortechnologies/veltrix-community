import React, { useMemo } from 'react'
import CodeMirror, { EditorView, type ReactCodeMirrorProps } from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { yaml } from '@codemirror/lang-yaml'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import type { FileKind } from '../editor.utils'

export interface CodeMirrorPaneProps {
  value: string
  onChange: (value: string) => void
  kind: FileKind
  /** Dark app theme -> CodeMirror's one-dark theme. Never derive this from raw color tokens —
   * bg-content-primary/text-content-inverse both resolve near-white in dark mode, so the
   * editor's own theme extension is the only reliable signal here. */
  dark: boolean
  readOnly?: boolean
  /** Cmd/Ctrl-S — handled via a wrapping keydown listener rather than a CodeMirror keymap
   * extension, since native keydown on the editor's contenteditable region still bubbles to
   * this DOM ancestor and CM6's default keymap does not bind Mod-s. */
  onSave?: () => void
  ariaLabel?: string
  autoFocus?: boolean
  height?: string
}

function getLanguageExtension(kind: FileKind) {
  switch (kind) {
    case 'javascript':
      return javascript({ jsx: false, typescript: false })
    case 'jsx':
      return javascript({ jsx: true, typescript: false })
    case 'typescript':
      return javascript({ jsx: false, typescript: true })
    case 'tsx':
      return javascript({ jsx: true, typescript: true })
    case 'yaml':
      return yaml()
    case 'json':
      return json()
    case 'plain':
    default:
      return null
  }
}

/**
 * The actual CodeMirror 6 surface — split out from SandboxEditorCard so it can be
 * React.lazy-loaded and never bloat the main bundle chunk (CodeMirror + language
 * packages are only fetched once a developer opens a file to edit).
 */
const CodeMirrorPane: React.FC<CodeMirrorPaneProps> = ({
  value,
  onChange,
  kind,
  dark,
  readOnly = false,
  onSave,
  ariaLabel,
  autoFocus = false,
  height = '480px',
}) => {
  const extensions = useMemo(() => {
    const lang = getLanguageExtension(kind)
    return [EditorView.lineWrapping, ...(lang ? [lang] : [])]
  }, [kind])

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    const isSaveChord = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's'
    if (isSaveChord && onSave) {
      event.preventDefault()
      onSave()
    }
    // Esc leaves the editor surface entirely (WCAG 2.1.2 no-keyboard-trap) rather than
    // being swallowed by CodeMirror's own default keymap.
    if (event.key === 'Escape') {
      ;(event.currentTarget.querySelector('.cm-content') as HTMLElement | null)?.blur()
    }
  }

  const themeProp: ReactCodeMirrorProps['theme'] = dark ? oneDark : 'light'

  return (
    <div
      onKeyDown={handleKeyDown}
      className="rounded-md border border-border overflow-hidden"
      role="group"
      aria-label={ariaLabel}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={themeProp}
        extensions={extensions}
        editable={!readOnly}
        readOnly={readOnly}
        autoFocus={autoFocus}
        height={height}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
        }}
      />
    </div>
  )
}

export default CodeMirrorPane
