/**
 * Export Utility Functions
 *
 * Convert canvas configuration to various formats:
 * - JSON
 * - YAML
 * - .conf (Splunk INI-style)
 */

import yaml from 'js-yaml';
import {
  ConfigSection,
  CanvasExportData,
  ExportFormat,
} from '../types';

interface ExportOptions {
  name: string;
  description?: string;
  toolType: string;
  entityType: string;
}

/**
 * Extract configuration data from sections as key-value pairs
 */
export const extractConfigData = (
  sections: ConfigSection[]
): Record<string, unknown> => {
  const configData: Record<string, unknown> = {};

  for (const section of sections) {
    const sectionData: Record<string, unknown> = {};

    for (const field of section.fields) {
      if (field.value !== undefined && field.value !== null && field.value !== '') {
        sectionData[field.key] = field.value;
      }
    }

    // Use section name as the key (like Splunk stanzas)
    if (Object.keys(sectionData).length > 0) {
      configData[section.name] = sectionData;
    }
  }

  return configData;
};

/**
 * Export sections to JSON format
 */
export const exportToJson = (
  sections: ConfigSection[],
  options: ExportOptions
): CanvasExportData => {
  return {
    name: options.name,
    description: options.description,
    toolType: options.toolType,
    entityType: options.entityType,
    sections,
    configData: extractConfigData(sections),
    format: 'json',
    exportedAt: new Date().toISOString(),
  };
};

/**
 * Export sections to YAML format
 */
export const exportToYaml = (
  sections: ConfigSection[],
  options: ExportOptions
): string => {
  const configData = extractConfigData(sections);

  const yamlContent = yaml.dump(configData, {
    indent: 2,
    lineWidth: -1, // Disable line wrapping
    noRefs: true,
    sortKeys: false,
  });

  return `# ${options.name}\n# Generated at ${new Date().toISOString()}\n# Tool: ${options.toolType}\n# Entity: ${options.entityType}\n\n${yamlContent}`;
};

/**
 * Export sections to .conf format (Splunk INI-style)
 */
export const exportToConf = (
  sections: ConfigSection[],
  options: ExportOptions
): string => {
  const lines: string[] = [
    `# ${options.name}`,
    `# Generated at ${new Date().toISOString()}`,
    `# Tool: ${options.toolType}`,
    `# Entity: ${options.entityType}`,
    '',
  ];

  for (const section of sections) {
    // Section header (stanza)
    lines.push(`[${section.name}]`);

    // Fields as key = value
    for (const field of section.fields) {
      if (field.value !== undefined && field.value !== null && field.value !== '') {
        const value = formatConfValue(field.value);
        lines.push(`${field.key} = ${value}`);
      }
    }

    // Empty line between sections
    lines.push('');
  }

  return lines.join('\n');
};

/**
 * Format a value for .conf file output
 */
const formatConfValue = (value: unknown): string => {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.join(',');
  }
  return String(value);
};

/**
 * Export to specified format
 */
export const exportToFormat = (
  sections: ConfigSection[],
  format: ExportFormat,
  options: ExportOptions
): CanvasExportData => {
  const baseExport = exportToJson(sections, options);

  switch (format) {
    case 'yaml':
      return {
        ...baseExport,
        format: 'yaml',
      };
    case 'conf':
    case 'ini':
      return {
        ...baseExport,
        format: 'conf',
      };
    case 'json':
    default:
      return baseExport;
  }
};

/**
 * Get the raw content string for a format
 */
export const getExportContent = (
  sections: ConfigSection[],
  format: ExportFormat,
  options: ExportOptions
): string => {
  switch (format) {
    case 'yaml':
      return exportToYaml(sections, options);
    case 'conf':
    case 'ini':
      return exportToConf(sections, options);
    case 'json':
    default:
      return JSON.stringify(exportToJson(sections, options), null, 2);
  }
};

/**
 * Get MIME type for export format
 */
export const getMimeType = (format: ExportFormat): string => {
  switch (format) {
    case 'yaml':
      return 'application/x-yaml';
    case 'conf':
    case 'ini':
      return 'text/plain';
    case 'json':
    default:
      return 'application/json';
  }
};

/**
 * Get file extension for export format
 */
export const getFileExtension = (format: ExportFormat): string => {
  switch (format) {
    case 'yaml':
      return 'yaml';
    case 'conf':
      return 'conf';
    case 'ini':
      return 'ini';
    case 'json':
    default:
      return 'json';
  }
};

/**
 * Download configuration as a file
 */
export const downloadConfig = (
  sections: ConfigSection[],
  format: ExportFormat,
  options: ExportOptions
): void => {
  const content = getExportContent(sections, format, options);
  const mimeType = getMimeType(format);
  const extension = getFileExtension(format);
  const filename = `${options.name.toLowerCase().replace(/\s+/g, '-')}.${extension}`;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
