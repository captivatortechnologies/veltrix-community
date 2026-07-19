/**
 * Splunk .conf File Parser
 *
 * Parses INI-style Splunk configuration files into structured data
 */

import { ConfigSection, ConfigField, ParsedConfFile, ConfStanza } from '../types';
import { generateId } from './canvasUtils';

/**
 * Parse a Splunk .conf file content into structured data
 */
export const parseConfFile = (content: string): ParsedConfFile => {
  const lines = content.split('\n');
  const result: ParsedConfFile = {
    stanzas: [],
    defaultSettings: {},
  };

  let currentStanza: ConfStanza | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      continue;
    }

    // Skip comments (lines starting with # or ;)
    if (trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    // Check for stanza header [stanzaName]
    const stanzaMatch = trimmed.match(/^\[(.+)\]$/);
    if (stanzaMatch) {
      // Save previous stanza if exists
      if (currentStanza) {
        result.stanzas.push(currentStanza);
      }
      currentStanza = {
        name: stanzaMatch[1],
        settings: {},
      };
      continue;
    }

    // Parse key = value (with support for multiline values using \)
    const settingMatch = trimmed.match(/^([^=]+)\s*=\s*(.*)$/);
    if (settingMatch) {
      const key = settingMatch[1].trim();
      let value = settingMatch[2].trim();

      // Handle multiline values (lines ending with \)
      while (value.endsWith('\\') && i + 1 < lines.length) {
        value = value.slice(0, -1); // Remove trailing backslash
        i++;
        value += lines[i].trim();
      }

      if (currentStanza) {
        currentStanza.settings[key] = value;
      } else {
        // Settings before any stanza go to defaults
        result.defaultSettings[key] = value;
      }
    }
  }

  // Don't forget the last stanza
  if (currentStanza) {
    result.stanzas.push(currentStanza);
  }

  return result;
};

/**
 * Convert parsed .conf file to ConfigSections for the canvas
 */
export const confToSections = (
  parsed: ParsedConfFile,
  defaultSectionIcon?: string
): ConfigSection[] => {
  const sections: ConfigSection[] = [];

  // Add default settings as a section if present
  if (Object.keys(parsed.defaultSettings).length > 0) {
    sections.push({
      id: generateId(),
      name: 'default',
      icon: defaultSectionIcon || 'Settings',
      collapsed: false,
      fields: Object.entries(parsed.defaultSettings).map(
        ([key, value], index) => ({
          id: generateId(),
          key,
          label: formatKeyAsLabel(key),
          type: inferFieldType(key, value),
          value: parseConfValue(value),
          order: index,
        })
      ),
      order: 0,
      description: 'Default settings (apply to all stanzas)',
    });
  }

  // Convert each stanza to a section
  parsed.stanzas.forEach((stanza, stanzaIndex) => {
    sections.push({
      id: generateId(),
      name: stanza.name,
      icon: defaultSectionIcon || 'Database',
      collapsed: false,
      fields: Object.entries(stanza.settings).map(([key, value], index) => ({
        id: generateId(),
        key,
        label: formatKeyAsLabel(key),
        type: inferFieldType(key, value),
        value: parseConfValue(value),
        order: index,
      })),
      order: stanzaIndex + 1,
    });
  });

  return sections;
};

/**
 * Convert a key name to a human-readable label
 * e.g., "maxDataSize" -> "Max Data Size"
 */
export const formatKeyAsLabel = (key: string): string => {
  return key
    // Insert space before uppercase letters
    .replace(/([A-Z])/g, ' $1')
    // Insert space before numbers
    .replace(/([0-9]+)/g, ' $1')
    // Replace underscores and hyphens with spaces
    .replace(/[_-]/g, ' ')
    // Capitalize first letter
    .replace(/^./, (str) => str.toUpperCase())
    // Trim and collapse multiple spaces
    .trim()
    .replace(/\s+/g, ' ');
};

/**
 * Infer the field type based on key name and value
 */
export const inferFieldType = (
  key: string,
  value: string
): ConfigField['type'] => {
  const lowerKey = key.toLowerCase();
  const lowerValue = value.toLowerCase();

  // Boolean patterns
  if (
    lowerValue === 'true' ||
    lowerValue === 'false' ||
    lowerValue === '0' ||
    lowerValue === '1' ||
    lowerKey.startsWith('enable') ||
    lowerKey.startsWith('disable') ||
    lowerKey.startsWith('is') ||
    lowerKey.startsWith('has') ||
    lowerKey.startsWith('allow') ||
    lowerKey.startsWith('use')
  ) {
    return 'checkbox';
  }

  // Path patterns
  if (
    lowerKey.includes('path') ||
    lowerKey.includes('dir') ||
    lowerKey.includes('folder') ||
    value.startsWith('$') ||
    value.startsWith('/')
  ) {
    return 'path';
  }

  // Number patterns
  if (
    !isNaN(Number(value)) ||
    lowerKey.includes('size') ||
    lowerKey.includes('count') ||
    lowerKey.includes('max') ||
    lowerKey.includes('min') ||
    lowerKey.includes('limit') ||
    lowerKey.includes('timeout') ||
    lowerKey.includes('period') ||
    lowerKey.includes('interval') ||
    lowerKey.endsWith('mb') ||
    lowerKey.endsWith('gb') ||
    lowerKey.endsWith('kb') ||
    lowerKey.endsWith('secs') ||
    lowerKey.endsWith('days')
  ) {
    return 'number';
  }

  // Tags/list patterns (comma-separated values)
  if (value.includes(',')) {
    return 'tags';
  }

  // Password patterns
  if (
    lowerKey.includes('password') ||
    lowerKey.includes('secret') ||
    lowerKey.includes('token') ||
    lowerKey.includes('key') ||
    lowerKey.includes('credential')
  ) {
    return 'password';
  }

  // Multi-line patterns
  if (value.includes('\n') || value.length > 200) {
    return 'textarea';
  }

  // Default to text
  return 'text';
};

/**
 * Parse a .conf value into the appropriate JavaScript type
 */
export const parseConfValue = (value: string): unknown => {
  const trimmed = value.trim();

  // Boolean
  if (trimmed.toLowerCase() === 'true' || trimmed === '1') {
    return true;
  }
  if (trimmed.toLowerCase() === 'false' || trimmed === '0') {
    return false;
  }

  // Number
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') {
    return num;
  }

  // Comma-separated list
  if (trimmed.includes(',')) {
    return trimmed.split(',').map((s) => s.trim());
  }

  // String
  return trimmed;
};

/**
 * Convert ConfigSections back to .conf format
 */
export const sectionsToConf = (sections: ConfigSection[]): string => {
  const lines: string[] = [];

  for (const section of sections) {
    // Stanza header
    lines.push(`[${section.name}]`);

    // Fields
    for (const field of section.fields) {
      if (field.value !== undefined && field.value !== null && field.value !== '') {
        const formattedValue = formatConfValue(field.value);
        lines.push(`${field.key} = ${formattedValue}`);
      }
    }

    // Empty line between stanzas
    lines.push('');
  }

  return lines.join('\n');
};

/**
 * Format a JavaScript value for .conf file output
 */
const formatConfValue = (value: unknown): string => {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
};

/**
 * Validate a .conf file content (basic syntax check)
 */
export const validateConfSyntax = (
  content: string
): { valid: boolean; errors: string[] } => {
  const lines = content.split('\n');
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    // Check stanza header
    if (trimmed.startsWith('[')) {
      if (!trimmed.endsWith(']')) {
        errors.push(`Line ${lineNum}: Unclosed stanza bracket`);
      }
      continue;
    }

    // Check key = value format
    if (!trimmed.includes('=')) {
      errors.push(
        `Line ${lineNum}: Invalid syntax (expected key = value format)`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
