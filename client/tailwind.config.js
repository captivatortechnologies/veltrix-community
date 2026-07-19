import veltrixPreset from './src/styles/tailwind-preset.cjs';

/**
 * App-level Tailwind config. The design system itself (semantic color tokens, shared
 * typography) lives in `./src/styles/tailwind-preset.cjs`, a self-contained preset paired
 * with `./src/styles/tokens.css` — that pairing is the extraction seam for the future
 * `@veltrix/ui` package (see `packages/ui` in the monorepo layout). This file should
 * only hold Veltrix-app-specific concerns
 * (content globs, plugins, anything not meant to ship in the shared package).
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  presets: [veltrixPreset],
  // Test files are deliberately excluded: Tailwind's content scanner is a
  // naive regex extractor that reads every matched file's raw text looking
  // for class-like tokens — it does not parse JS/TS syntax, so it doesn't
  // know a `:`-containing sequence is inside a regex literal, string, or
  // comment rather than a className. `Button.test.tsx` has
  // `/(?<!-visible:)focus:ring-2/` (a negative-lookbehind regex assertion in
  // a test expectation), and the `-visible:` fragment inside it crashes the
  // v3 JIT engine (`resolveMatches`/`generateRules`, "Cannot read properties
  // of undefined (reading 'raws')") — confirmed by bisection during the
  // Community Edition extraction build-verify pass. Test files never render
  // into the shipped app, so excluding them is correct regardless of this
  // specific crash, and it also shrinks the class-candidate scan.
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '!./src/**/*.test.{js,ts,jsx,tsx}',
    '!./src/**/*.spec.{js,ts,jsx,tsx}',
    '!./src/**/__tests__/**',
    '!./src/tests/**',
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
};
