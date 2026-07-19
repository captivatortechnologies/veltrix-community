/**
 * Creates a URL-friendly slug from text, preserving dots for vendor/product names
 * @param text The text to convert to a slug
 * @returns A URL-friendly slug string
 */
export const createSlug = (text: string): string => {
  // Replace spaces and special characters (except dots) with hyphens
  return text.toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')  // Keep dots
    .replace(/(^-|-$)/g, '');      // Remove leading/trailing hyphens
};
