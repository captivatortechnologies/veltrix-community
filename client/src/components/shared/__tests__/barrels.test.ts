import { describe, it, expect } from 'vitest';

/**
 * Regression guard for a real bug found in this codebase: several shared barrels used to
 * write `export { X } from './X'; export default X;` — the second line references a local
 * binding `X` that the first line never actually creates (it's a re-export, not an import),
 * which throws `ReferenceError: X is not defined` the instant the module is evaluated. That
 * crashed every page importing the barrel (e.g. Badge/Card/EmptyState/Skeleton took down
 * `/sandboxes` with a hard error-boundary crash).
 *
 * The fix is always the same shape: `import { X } from './X'; export { X }; export default X;`.
 * Each case below dynamically imports a barrel (so one broken barrel can't abort the whole
 * suite via a top-level import) and asserts both the named and default export resolve to the
 * same defined value — exactly what a fixed barrel produces and a broken one cannot.
 */
describe('shared component barrels', () => {
  it.each([
    ['Badge', () => import('../Badge'), 'Badge'],
    ['Button', () => import('../Button'), 'Button'],
    ['Card', () => import('../Card'), 'Card'],
    ['EmptyState', () => import('../EmptyState'), 'EmptyState'],
    ['Input', () => import('../Input'), 'Input'],
    ['Textarea', () => import('../Textarea'), 'Textarea'],
    ['Checkbox', () => import('../Checkbox'), 'Checkbox'],
    ['Select', () => import('../Select'), 'Select'],
    ['SearchBox', () => import('../SearchBox'), 'SearchBox'],
    ['Pagination', () => import('../Pagination'), 'Pagination'],
    ['FilterBar', () => import('../FilterBar'), 'FilterBar'],
    ['SortSelect', () => import('../SortSelect'), 'SortSelect'],
    ['Skeleton', () => import('../Skeleton'), 'Skeleton'],
    ['Spinner', () => import('../Spinner'), 'Spinner'],
    ['Tooltip', () => import('../Tooltip'), 'Tooltip'],
    ['Tabs', () => import('../Tabs'), 'Tabs'],
    ['FormField', () => import('../FormField'), 'FormField'],
  ] as const)('%s barrel default export matches its named export and is defined', async (_label, load, exportName) => {
    const mod = await load();
    const named = (mod as Record<string, unknown>)[exportName];

    expect(named).toBeDefined();
    expect(mod.default).toBeDefined();
    expect(mod.default).toBe(named);
  }, 15000); // Cold dynamic imports can be slow when the whole shared/ suite runs in parallel.

  it('ConfirmationDialog barrel resolves its provider, hook, and component', async () => {
    const mod = await import('../ConfirmationDialog');
    expect(mod.ConfirmationDialogProvider).toBeDefined();
    expect(mod.useConfirmDialog).toBeDefined();
    expect(mod.ConfirmationDialog).toBeDefined();
  });

  it('Toast barrel resolves its provider, hook, and components', async () => {
    const mod = await import('../Toast');
    expect(mod.ToastProvider).toBeDefined();
    expect(mod.useToast).toBeDefined();
    expect(mod.Toast).toBeDefined();
    expect(mod.ToastContainer).toBeDefined();
  });

  it('the top-level components/shared barrel re-exports every primitive', async () => {
    const mod = await import('../index');

    expect(mod.Button).toBeDefined();
    expect(mod.Input).toBeDefined();
    expect(mod.Textarea).toBeDefined();
    expect(mod.Checkbox).toBeDefined();
    expect(mod.Select).toBeDefined();
    expect(mod.SearchBox).toBeDefined();
    expect(mod.Pagination).toBeDefined();
    expect(mod.FilterBar).toBeDefined();
    expect(mod.SortSelect).toBeDefined();
    expect(mod.Spinner).toBeDefined();
    expect(mod.Tooltip).toBeDefined();
    expect(mod.Card).toBeDefined();
    expect(mod.CardHeader).toBeDefined();
    expect(mod.CardBody).toBeDefined();
    expect(mod.CardFooter).toBeDefined();
    expect(mod.Badge).toBeDefined();
    expect(mod.Tabs).toBeDefined();
    expect(mod.FormField).toBeDefined();
    expect(mod.EmptyState).toBeDefined();
    expect(mod.Skeleton).toBeDefined();
    expect(mod.SkeletonText).toBeDefined();
    expect(mod.SkeletonCard).toBeDefined();
    expect(mod.ToastProvider).toBeDefined();
    expect(mod.useToast).toBeDefined();
    expect(mod.ConfirmationDialogProvider).toBeDefined();
    expect(mod.useConfirmDialog).toBeDefined();
  }, 15000); // Imports the composite feature modules too (Pipeline/VersionControl/ConfigurationCanvas).
});
