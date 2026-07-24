import { describe, it, expect, beforeEach } from 'vitest'
import { applyBrandChrome, DEFAULT_BRAND } from '../brand'

describe('applyBrandChrome', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('points the favicon <link> and theme-color meta at the brand color', () => {
    applyBrandChrome('#0055ff')

    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')!
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!

    expect(icon).toBeTruthy()
    expect(icon.type).toBe('image/svg+xml')
    expect(icon.href.startsWith('data:image/svg+xml,')).toBe(true)
    // the color is encoded into the inline SVG
    expect(decodeURIComponent(icon.href)).toContain('stroke="#0055ff"')
    expect(meta.content).toBe('#0055ff')
  })

  it('reuses the existing icon link rather than appending duplicates', () => {
    const existing = document.createElement('link')
    existing.rel = 'icon'
    existing.href = '/favicon.svg'
    document.head.appendChild(existing)

    applyBrandChrome('#f59e0b')

    expect(document.querySelectorAll('link[rel~="icon"]').length).toBe(1)
    expect(document.querySelector<HTMLLinkElement>('link[rel~="icon"]')!.href).toContain('data:image/svg+xml')
  })

  it('falls back to the default marigold for an unsafe/garbage color (no SVG injection)', () => {
    applyBrandChrome('"/><script>alert(1)</script>')

    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')!
    const decoded = decodeURIComponent(icon.href)
    expect(decoded).not.toContain('<script>')
    expect(decoded).toContain('stroke="#f59e0b"')
  })

  it('accepts a bare CSS color keyword', () => {
    applyBrandChrome('rebeccapurple')
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!
    expect(meta.content).toBe('rebeccapurple')
  })

  it('ships marigold as the Community Edition default', () => {
    expect(DEFAULT_BRAND.color).toBe('#f59e0b')
  })
})
