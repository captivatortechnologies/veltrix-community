// ========================================================================
// ReleaseNotes — a small, dependency-free markdown renderer for app release
// notes shown in the upgrade modal.
//
// The platform ships no markdown library, and release notes are authored by us
// (the catalog), so a focused renderer for the practical subset we use is
// cleaner than pulling in a dependency. It is XSS-safe by construction: it emits
// React elements only (never `dangerouslySetInnerHTML`), and link hrefs are
// restricted to http(s)/mailto.
//
// Supported: `#`/`##`/`###` headings, `-`/`*` bullet lists, `>` blockquotes,
// blank-line-separated paragraphs, and inline `**bold**`, `` `code` `` and
// `[text](url)` links. Anything else renders as plain text.
// ========================================================================

import React from 'react'

/** Inline formatting: **bold**, `code`, [text](url). Returns React nodes. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Group 2: bold body, group 4: code body, group 6/7: link text/href.
  const regex = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let token = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    if (match[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${token}`}>{match[2]}</strong>)
    } else if (match[4] !== undefined) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${token}`}
          className="rounded bg-surface-hover px-1 py-0.5 font-mono text-[0.85em] text-content-primary"
        >
          {match[4]}
        </code>,
      )
    } else if (match[6] !== undefined) {
      const href = match[7]
      const safe = /^(https?:|mailto:)/i.test(href)
      nodes.push(
        safe ? (
          <a
            key={`${keyPrefix}-l${token}`}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-primary hover:underline"
          >
            {match[6]}
          </a>
        ) : (
          match[6]
        ),
      )
    }
    lastIndex = regex.lastIndex
    token++
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

const HEADING_CLASSES: Record<number, string> = {
  1: 'text-lg font-semibold text-content-primary mt-4 first:mt-0',
  2: 'text-base font-semibold text-content-primary mt-4 first:mt-0',
  3: 'text-sm font-semibold uppercase tracking-wide text-content-secondary mt-3 first:mt-0',
}

export interface ReleaseNotesProps {
  /** Raw markdown; when blank, a neutral fallback is rendered. */
  markdown?: string | null
  className?: string
}

/**
 * Render release-notes markdown as a styled, scroll-friendly block. Falls back
 * to a neutral message when no notes are provided so the upgrade modal always
 * has a body.
 */
export const ReleaseNotes: React.FC<ReleaseNotesProps> = ({ markdown, className = '' }) => {
  const content = (markdown ?? '').trim()
  if (!content) {
    return (
      <p className={`text-sm text-content-secondary ${className}`}>
        No release notes were provided for this version.
      </p>
    )
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let paragraph: string[] = []
  let listItems: string[] = []
  let quote: string[] = []
  let key = 0

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push(
      <p key={`p${key++}`} className="text-sm leading-relaxed text-content-secondary">
        {renderInline(paragraph.join(' '), `p${key}`)}
      </p>,
    )
    paragraph = []
  }
  const flushList = () => {
    if (listItems.length === 0) return
    blocks.push(
      <ul key={`ul${key++}`} className="ml-5 list-disc space-y-1 text-sm text-content-secondary">
        {listItems.map((item, idx) => (
          <li key={idx}>{renderInline(item, `li${key}-${idx}`)}</li>
        ))}
      </ul>,
    )
    listItems = []
  }
  const flushQuote = () => {
    if (quote.length === 0) return
    blocks.push(
      <blockquote
        key={`q${key++}`}
        className="border-l-2 border-border pl-3 text-sm italic text-content-secondary"
      >
        {renderInline(quote.join(' '), `q${key}`)}
      </blockquote>,
    )
    quote = []
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const blockquote = /^>\s?(.*)$/.exec(line)

    if (line.trim() === '') {
      flushAll()
      continue
    }
    if (heading) {
      flushAll()
      const level = heading[1].length
      blocks.push(
        <p key={`h${key++}`} className={HEADING_CLASSES[level]}>
          {renderInline(heading[2], `h${key}`)}
        </p>,
      )
      continue
    }
    if (bullet) {
      flushParagraph()
      flushQuote()
      listItems.push(bullet[1])
      continue
    }
    if (blockquote) {
      flushParagraph()
      flushList()
      quote.push(blockquote[1])
      continue
    }
    // Plain text line — accumulate into the current paragraph.
    flushList()
    flushQuote()
    paragraph.push(line.trim())
  }
  flushAll()

  return <div className={`space-y-2 ${className}`}>{blocks}</div>
}

export default ReleaseNotes
