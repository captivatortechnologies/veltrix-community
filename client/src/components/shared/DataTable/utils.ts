import type { DataTableAlign } from './types';

/** Text-alignment utility classes shared by header and body cells. */
export const ALIGN_CLASS: Record<DataTableAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/**
 * A `width` value is treated as a Tailwind class (applied via `className`) when it looks
 * like one (`'w-48'`, `'w-1/3'`, `'min-w-[10rem]'`, …); anything else (`'12rem'`, `'240px'`)
 * is treated as a raw CSS width and applied via `style`.
 */
export function resolveColumnWidth(width?: string): { widthClassName: string; widthStyle?: string } {
  if (!width) return { widthClassName: '' };
  const isUtilityClass = /^(w-|min-w-|max-w-)/.test(width);
  return isUtilityClass ? { widthClassName: width } : { widthClassName: '', widthStyle: width };
}
