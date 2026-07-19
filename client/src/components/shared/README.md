# Shared Component Library

This directory contains reusable UI components used throughout the Veltrix application.

## Design tokens

All color comes from CSS custom properties defined in `src/styles/tokens.css` and mapped
onto Tailwind color families in `src/styles/tailwind-preset.cjs` (consumed by
`tailwind.config.js` via `presets: [...]`). Components should never hardcode a hex value or
a raw Tailwind palette class (`bg-blue-600`, `dark:bg-gray-800`, …) — use the semantic
classes instead:

| Tailwind class family | Use for |
|---|---|
| `primary`, `success`, `warning`, `danger`, `info` (each with `DEFAULT`/`hover`/`active`/`foreground`/`subtle`/`subtle-foreground`) | Brand + status color |
| `surface` (`DEFAULT`/`raised`/`overlay`/`hover`/`sunken`) | Backgrounds |
| `border` (`DEFAULT`/`strong`) | Borders |
| `content` (`primary`/`secondary`/`tertiary`/`disabled`/`inverse`) | Text — named `content` (not `text`) to avoid the `text-text-primary` stutter |
| `tooltip`, `scrim` | Floating/overlay chrome that intentionally stays constant across themes |

Most tokens flip between light and dark automatically (via `.dark` / `[data-theme="dark"]`
in `tokens.css`), so components generally do **not** need `dark:` prefixes for these
classes — that's the point of the system. See the docblock at the top of `tokens.css` for
the full rationale.

Brand: **primary = blue** (`#2563eb`), matching the `/login` sign-in button, the shield
logo, and the sidebar's active-state highlight.

## Quick Reference

### Available Components

| Component | Path | Purpose |
|-----------|------|---------|
| **Button** | `./Button` | Standardized buttons with variants, sizes, loading states |
| **Input** | `./Input` | Form inputs with labels, errors, and icons |
| **Select** | `./Select` | Accessible, keyboard-navigable dropdown — use instead of native `<select>` |
| **Tooltip** | `./Tooltip` | Hover/focus tooltip, linked via `aria-describedby` |
| **Card** | `./Card` | Container with header, body, and footer sections |
| **Badge** | `./Badge` | Status indicators and labels |
| **EmptyState** | `./EmptyState` | Consistent empty state messaging |
| **Skeleton** | `./Skeleton` | Loading placeholders for better UX |
| **Toast** | `./Toast` | Notification system (never `alert()`) |
| **ConfirmationDialog** | `./ConfirmationDialog` | Confirmation dialogs (never `window.confirm()`) |
| **DataTable** | `./DataTable` | Typed table with server-driven sort/pagination, row actions, loading + empty states |
| **StatsCard** | `./StatsCard` | Dashboard metric tile with icon, delta indicator, and loading state |
| **FormDialog** | `./FormDialog` | Modal `<form>` wrapper (title, error banner, submit/cancel) — sibling of ConfirmationDialog |
| **ConfigurationCanvas** | `./ConfigurationCanvas` | Complex configuration UI (app-specific — see note below) |
| **VersionControl** | `./VersionControl` | Version control and approval workflow UI (app-specific) |
| **Pipeline** | `./Pipeline` | Pipeline status and deployment UI (app-specific) |

All primitives (everything above the `ConfigurationCanvas` row) are also re-exported from
the top-level barrel, `@/components/shared`, which is the intended extraction point for a
future standalone `@veltrix/ui` package (see `packages/ui` in the monorepo layout) — they
have zero imports from outside this directory (no app services, contexts, or routing).
`ConfigurationCanvas`, `VersionControl`,
and `Pipeline` are larger, data-fetching feature modules that still import `@/services/api`
/ `@/config`, so they are **not** extraction-ready; they're re-exported from the top-level
barrel under a namespace (`ConfigurationCanvasModule`, etc.) instead of flattened, partly
to avoid name collisions (e.g. both `ConfigurationCanvas` and `Pipeline` export a
`ValidationResult` type) and partly to keep that app-specific coupling visible.

### Quick Start

```tsx
// Import components
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Select } from '@/components/shared/Select';
import { Tooltip } from '@/components/shared/Tooltip';
import { Card, CardHeader, CardBody, CardFooter } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/shared/Toast';

// Use in your component
function MyComponent() {
  const toast = useToast();

  return (
    <Card>
      <CardHeader>
        <h2>My Form</h2>
        <Badge variant="success">Active</Badge>
      </CardHeader>
      <CardBody>
        <Input label="Email" type="email" />
        <Input label="Password" type="password" />
      </CardBody>
      <CardFooter>
        <Button variant="primary" onClick={() => toast.success('Saved!')}>
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}
```

## Component Guidelines

### DO ✅

- **Always use shared components** instead of creating custom styled elements
- **Use semantic variants** (primary, danger, success, etc.)
- **Provide helpful error messages** and empty states
- **Include loading states** for async operations
- **Support dark mode** in custom components
- **Follow accessibility guidelines** (ARIA labels, keyboard nav)

### DON'T ❌

- **Don't use window.alert()** - Use Toast system
- **Don't use window.confirm()** - Use ConfirmationDialog
- **Don't inline button styles** - Use Button component
- **Don't create duplicate components** - Check shared library first
- **Don't forget dark mode** - All components must support dark mode
- **Don't skip accessibility** - Add ARIA labels and keyboard support

## Examples

### Button

```tsx
// Primary action
<Button variant="primary">Save Changes</Button>

// Danger action
<Button variant="danger" leftIcon={<Trash2 />}>Delete</Button>

// Loading state
<Button isLoading loadingText="Saving...">Save</Button>
```

### Input

```tsx
// Basic input
<Input label="Email" type="email" placeholder="you@example.com" />

// With error
<Input label="Password" error="Password is required" />

// With icon
<Input leftIcon={<Search />} placeholder="Search..." />
```

### Select

```tsx
// Replaces a native <select> — same onChange ergonomics as Input's onChange, but
// receives the value directly rather than an event.
<Select
  label="Vendor"
  value={vendorFilter}
  onChange={setVendorFilter}
  placeholder="All Vendors"
  options={vendors.map((v) => ({ value: v, label: v }))}
/>
```

### Tooltip

```tsx
// Wraps a single trigger; shows on hover AND keyboard focus.
<Tooltip content="Sandboxes" placement="right">
  <button aria-label="Sandboxes"><FlaskConical size={18} /></button>
</Tooltip>
```

### Empty State

```tsx
<EmptyState
  icon={<Users size={48} />}
  title="No users found"
  description="Get started by adding your first user"
  action={<Button onClick={handleAdd}>Add User</Button>}
/>
```

## Getting Help

- Review each component's own `__tests__` for usage examples
- Check existing usage in `pages/` and `features/` across the codebase
- Refer to `docs/` at the repo root for architecture and contribution guides

---

**Last Updated:** 2026-07-10
