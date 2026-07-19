/**
 * Veltrix Tailwind preset
 * ------------------------
 * Maps the semantic design tokens defined in `tokens.css` (in this same directory) onto
 * Tailwind color families and shared typography. This file is intentionally:
 *
 *  - CommonJS (`.cjs`) — loadable via `require()` regardless of the consumer's own
 *    "type" field, so it works the same whether imported from an ESM `tailwind.config.js`
 *    (this app) or a CJS one (a community app).
 *  - Zero imports, zero app-specific values — every color resolves through a CSS custom
 *    property (`var(--color-*)`), never a literal hex. Nothing here assumes Veltrix's own
 *    routing, services, or React tree.
 *
 * This is the extraction seam for `@veltrix/ui`: publish this file + tokens.css
 * together, and any Tailwind project can do:
 *
 *   // tailwind.config.js
 *   const veltrixPreset = require('@veltrix/ui/tailwind-preset');
 *   module.exports = { presets: [veltrixPreset], content: [...] };
 *
 *   // main.css
 *   @import '@veltrix/ui/tokens.css';
 *
 * Dark mode: tokens.css defines both `.dark` and `[data-theme="dark"]` variants, so this
 * preset's `darkMode: 'class'` works with Veltrix's existing class-toggle ThemeContext,
 * and a `data-theme` based consumer can override `darkMode: ['selector', '[data-theme="dark"]']`
 * in their own config without touching this preset.
 */

/** Builds `rgb(var(--color-x) / <alpha-value>)` so Tailwind opacity modifiers keep working. */
const withOpacity = (cssVar) => `rgb(var(${cssVar}) / <alpha-value>)`;

/** Standard shape for a semantic color family: solid base/hover/active + soft "subtle" tint. */
const semanticColor = (name) => ({
  DEFAULT: withOpacity(`--color-${name}`),
  hover: withOpacity(`--color-${name}-hover`),
  active: withOpacity(`--color-${name}-active`),
  foreground: withOpacity(`--color-${name}-foreground`),
  subtle: withOpacity(`--color-${name}-subtle`),
  'subtle-foreground': withOpacity(`--color-${name}-subtle-foreground`),
});

const systemSans = [
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
  '"Segoe UI Symbol"',
];

const systemMono = [
  'ui-monospace',
  'SFMono-Regular',
  '"SF Mono"',
  'Menlo',
  'Consolas',
  '"Liberation Mono"',
  'monospace',
];

/** @type {import('tailwindcss').Config} */
const veltrixPreset = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: semanticColor('primary'),
        success: semanticColor('success'),
        warning: semanticColor('warning'),
        danger: semanticColor('danger'),
        info: semanticColor('info'),
        surface: {
          DEFAULT: withOpacity('--color-surface'),
          raised: withOpacity('--color-surface-raised'),
          overlay: withOpacity('--color-surface-overlay'),
          hover: withOpacity('--color-surface-hover'),
          sunken: withOpacity('--color-surface-sunken'),
        },
        border: {
          DEFAULT: withOpacity('--color-border'),
          strong: withOpacity('--color-border-strong'),
        },
        // Inverse/overlay surface for floating chrome (tooltips, etc.) that should stay
        // legible over both light and dark app backgrounds — see tokens.css for why this
        // one is intentionally constant across themes.
        tooltip: {
          DEFAULT: withOpacity('--color-tooltip'),
          foreground: withOpacity('--color-tooltip-foreground'),
        },
        scrim: withOpacity('--color-scrim'),
        // Named "content" (not "text") to avoid the text-text-primary Tailwind stutter.
        content: {
          primary: withOpacity('--color-content-primary'),
          secondary: withOpacity('--color-content-secondary'),
          tertiary: withOpacity('--color-content-tertiary'),
          disabled: withOpacity('--color-content-disabled'),
          inverse: withOpacity('--color-content-inverse'),
        },
      },
      fontFamily: {
        sans: systemSans,
        mono: systemMono,
      },
    },
  },
};

module.exports = veltrixPreset;
