/**
 * useFileParser Hook
 *
 * Provides file parsing functionality for the Configuration Canvas
 * Supports JSON, YAML, and .conf file formats
 */

import { useState, useCallback } from 'react';
import yaml from 'js-yaml';
import {
  ConfigSection,
  ExportFormat,
  UseFileParserReturn,
} from '../types';
import { parseConfFile, confToSections } from '../utils/confParser';
import { generateId } from '../utils/canvasUtils';

/**
 * Detect file format from extension
 */
const detectFormat = (filename: string): ExportFormat => {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'json':
      return 'json';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'conf':
    case 'ini':
      return 'conf';
    default:
      return 'json';
  }
};

/**
 * Hook for parsing configuration files
 */
export const useFileParser = (): UseFileParserReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Parse JSON content to ConfigSections
   */
  const parseJsonContent = (content: string): ConfigSection[] => {
    const data = JSON.parse(content);

    // Handle exported canvas format
    if (data.sections && Array.isArray(data.sections)) {
      return data.sections;
    }

    // Handle raw key-value object - convert to a single section
    if (typeof data === 'object' && !Array.isArray(data)) {
      return [
        {
          id: generateId(),
          name: 'Imported Configuration',
          collapsed: false,
          fields: Object.entries(data).map(([key, value], index) => ({
            id: generateId(),
            key,
            label: key,
            type: 'text' as const,
            value,
            order: index,
          })),
          order: 0,
        },
      ];
    }

    throw new Error('Invalid JSON format');
  };

  /**
   * Parse YAML content to ConfigSections
   */
  const parseYamlContent = (content: string): ConfigSection[] => {
    const data = yaml.load(content) as Record<string, unknown>;

    // Handle exported canvas format
    if (data.sections && Array.isArray(data.sections)) {
      return data.sections as ConfigSection[];
    }

    // Handle raw key-value object - convert to sections based on top-level keys
    if (typeof data === 'object' && !Array.isArray(data)) {
      const sections: ConfigSection[] = [];

      Object.entries(data).forEach(([sectionName, sectionData], sectionIndex) => {
        if (typeof sectionData === 'object' && sectionData !== null && !Array.isArray(sectionData)) {
          // Nested object becomes a section
          sections.push({
            id: generateId(),
            name: sectionName,
            collapsed: false,
            fields: Object.entries(sectionData as Record<string, unknown>).map(
              ([key, value], index) => ({
                id: generateId(),
                key,
                label: key,
                type: 'text' as const,
                value,
                order: index,
              })
            ),
            order: sectionIndex,
          });
        } else {
          // Scalar value - add to default section
          const defaultSection = sections.find((s) => s.name === 'default');
          if (defaultSection) {
            defaultSection.fields.push({
              id: generateId(),
              key: sectionName,
              label: sectionName,
              type: 'text',
              value: sectionData,
              order: defaultSection.fields.length,
            });
          } else {
            sections.unshift({
              id: generateId(),
              name: 'default',
              collapsed: false,
              fields: [
                {
                  id: generateId(),
                  key: sectionName,
                  label: sectionName,
                  type: 'text',
                  value: sectionData,
                  order: 0,
                },
              ],
              order: 0,
            });
          }
        }
      });

      return sections;
    }

    throw new Error('Invalid YAML format');
  };

  /**
   * Parse .conf content to ConfigSections
   */
  const parseConfContent = (content: string): ConfigSection[] => {
    const parsed = parseConfFile(content);
    return confToSections(parsed);
  };

  /**
   * Parse content based on format
   */
  const parseContent = useCallback(
    (content: string, format: ExportFormat): ConfigSection[] => {
      setError(null);

      try {
        switch (format) {
          case 'json':
            return parseJsonContent(content);
          case 'yaml':
            return parseYamlContent(content);
          case 'conf':
          case 'ini':
            return parseConfContent(content);
          default:
            throw new Error(`Unsupported format: ${format}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to parse content';
        setError(message);
        throw new Error(message);
      }
    },
    []
  );

  /**
   * Parse a file and return ConfigSections
   */
  const parseFile = useCallback(
    async (file: File): Promise<ConfigSection[]> => {
      setIsLoading(true);
      setError(null);

      try {
        const content = await file.text();
        const format = detectFormat(file.name);
        const sections = parseContent(content, format);
        return sections;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to parse file';
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [parseContent]
  );

  return {
    isLoading,
    error,
    parseFile,
    parseContent,
  };
};

export default useFileParser;
