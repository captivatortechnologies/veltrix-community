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
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
};
