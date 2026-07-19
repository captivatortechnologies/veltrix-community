/**
 * Tests for Splunk .conf file parser
 */

import {
  parseConfFile,
  formatKeyAsLabel,
  inferFieldType,
  parseConfValue,
  sectionsToConf,
  validateConfSyntax,
} from '../utils/confParser';
import { ConfigSection } from '../types';

describe('confParser', () => {
  describe('parseConfFile', () => {
    it('should parse a simple .conf file', () => {
      const content = `
[myindex]
homePath = $SPLUNK_DB/myindex/db
coldPath = $SPLUNK_DB/myindex/colddb
maxDataSize = auto
`;
      const result = parseConfFile(content);

      expect(result.stanzas).toHaveLength(1);
      expect(result.stanzas[0].name).toBe('myindex');
      expect(result.stanzas[0].settings).toEqual({
        homePath: '$SPLUNK_DB/myindex/db',
        coldPath: '$SPLUNK_DB/myindex/colddb',
        maxDataSize: 'auto',
      });
    });

    it('should parse multiple stanzas', () => {
      const content = `
[index1]
key1 = value1

[index2]
key2 = value2
`;
      const result = parseConfFile(content);

      expect(result.stanzas).toHaveLength(2);
      expect(result.stanzas[0].name).toBe('index1');
      expect(result.stanzas[1].name).toBe('index2');
    });

    it('should handle default settings before any stanza', () => {
      const content = `
defaultKey = defaultValue

[myindex]
key1 = value1
`;
      const result = parseConfFile(content);

      expect(result.defaultSettings).toEqual({ defaultKey: 'defaultValue' });
      expect(result.stanzas).toHaveLength(1);
    });

    it('should skip comment lines starting with #', () => {
      const content = `
# This is a comment
[myindex]
# Another comment
key1 = value1
`;
      const result = parseConfFile(content);

      expect(result.stanzas).toHaveLength(1);
      expect(Object.keys(result.stanzas[0].settings)).toHaveLength(1);
    });

    it('should skip comment lines starting with ;', () => {
      const content = `
; This is a comment
[myindex]
; Another comment
key1 = value1
`;
      const result = parseConfFile(content);

      expect(result.stanzas).toHaveLength(1);
      expect(Object.keys(result.stanzas[0].settings)).toHaveLength(1);
    });

    it('should handle multiline values with backslash', () => {
      const content = `
[myindex]
longValue = line1 \\
line2 \\
line3
`;
      const result = parseConfFile(content);

      expect(result.stanzas[0].settings.longValue).toBe('line1 line2 line3');
    });

    it('should handle empty values', () => {
      const content = `
[myindex]
emptyKey =
`;
      const result = parseConfFile(content);

      expect(result.stanzas[0].settings.emptyKey).toBe('');
    });

    it('should handle values with equals sign', () => {
      const content = `
[myindex]
formula = 1+1=2
`;
      const result = parseConfFile(content);

      expect(result.stanzas[0].settings.formula).toBe('1+1=2');
    });

    it('should trim whitespace from keys and values', () => {
      const content = `
[myindex]
  spacedKey   =   spaced value
`;
      const result = parseConfFile(content);

      expect(result.stanzas[0].settings.spacedKey).toBe('spaced value');
    });
  });

  describe('formatKeyAsLabel', () => {
    it('should convert camelCase to Title Case', () => {
      expect(formatKeyAsLabel('maxDataSize')).toBe('Max Data Size');
      expect(formatKeyAsLabel('homePath')).toBe('Home Path');
    });

    it('should handle underscores', () => {
      expect(formatKeyAsLabel('max_data_size')).toBe('Max data size');
    });

    it('should handle hyphens', () => {
      expect(formatKeyAsLabel('max-data-size')).toBe('Max data size');
    });

    it('should handle numbers', () => {
      expect(formatKeyAsLabel('option1')).toBe('Option 1');
      expect(formatKeyAsLabel('v2Config')).toBe('V 2 Config');
    });

    it('should handle already formatted strings', () => {
      expect(formatKeyAsLabel('Already Formatted')).toBe('Already Formatted');
    });
  });

  describe('inferFieldType', () => {
    it('should infer checkbox for boolean-like values', () => {
      expect(inferFieldType('enabled', 'true')).toBe('checkbox');
      expect(inferFieldType('disabled', 'false')).toBe('checkbox');
      expect(inferFieldType('flag', '0')).toBe('checkbox');
      expect(inferFieldType('flag', '1')).toBe('checkbox');
    });

    it('should infer checkbox for boolean-like keys', () => {
      expect(inferFieldType('isEnabled', 'yes')).toBe('checkbox');
      expect(inferFieldType('hasFeature', 'no')).toBe('checkbox');
      expect(inferFieldType('allowAccess', 'on')).toBe('checkbox');
      expect(inferFieldType('useSSL', 'off')).toBe('checkbox');
    });

    it('should infer path for path-like keys or values', () => {
      expect(inferFieldType('homePath', '/var/lib/splunk')).toBe('path');
      expect(inferFieldType('logDir', '/var/log')).toBe('path');
      expect(inferFieldType('dataFolder', '/data')).toBe('path');
      expect(inferFieldType('anyKey', '$SPLUNK_DB/index/db')).toBe('path');
    });

    it('should infer number for numeric values', () => {
      expect(inferFieldType('port', '8080')).toBe('number');
      expect(inferFieldType('count', '100')).toBe('number');
    });

    it('should infer number for numeric-like keys', () => {
      expect(inferFieldType('maxSize', 'auto')).toBe('number');
      expect(inferFieldType('minCount', 'default')).toBe('number');
      expect(inferFieldType('connectionLimit', '')).toBe('number');
      expect(inferFieldType('timeoutSecs', '')).toBe('number');
    });

    it('should infer tags for comma-separated values', () => {
      expect(inferFieldType('roles', 'admin, user, guest')).toBe('tags');
    });

    it('should infer password for sensitive keys', () => {
      expect(inferFieldType('password', 'secret')).toBe('password');
      expect(inferFieldType('apiSecret', 'mysecret')).toBe('password');
      expect(inferFieldType('authToken', 'abc123def')).toBe('password');
      expect(inferFieldType('sslKey', 'keydata')).toBe('password');
    });

    it('should infer textarea for long values', () => {
      const longValue = 'a'.repeat(250);
      expect(inferFieldType('description', longValue)).toBe('textarea');
    });

    it('should default to text for other cases', () => {
      expect(inferFieldType('name', 'myindex')).toBe('text');
      expect(inferFieldType('description', 'A short description')).toBe('text');
    });
  });

  describe('parseConfValue', () => {
    it('should parse boolean true', () => {
      expect(parseConfValue('true')).toBe(true);
      expect(parseConfValue('TRUE')).toBe(true);
      expect(parseConfValue('1')).toBe(true);
    });

    it('should parse boolean false', () => {
      expect(parseConfValue('false')).toBe(false);
      expect(parseConfValue('FALSE')).toBe(false);
      expect(parseConfValue('0')).toBe(false);
    });

    it('should parse numbers', () => {
      expect(parseConfValue('42')).toBe(42);
      expect(parseConfValue('3.14')).toBe(3.14);
      expect(parseConfValue('-100')).toBe(-100);
    });

    it('should parse comma-separated lists', () => {
      expect(parseConfValue('a, b, c')).toEqual(['a', 'b', 'c']);
      expect(parseConfValue('item1,item2,item3')).toEqual(['item1', 'item2', 'item3']);
    });

    it('should return string for plain text', () => {
      expect(parseConfValue('hello world')).toBe('hello world');
      expect(parseConfValue('$SPLUNK_DB/myindex')).toBe('$SPLUNK_DB/myindex');
    });

    it('should trim whitespace', () => {
      expect(parseConfValue('  trimmed  ')).toBe('trimmed');
    });
  });

  describe('sectionsToConf', () => {
    it('should convert sections to .conf format', () => {
      const sections: ConfigSection[] = [
        {
          id: 's1',
          name: 'myindex',
          fields: [
            { id: 'f1', key: 'homePath', label: 'Home Path', type: 'path', value: '$SPLUNK_DB/myindex/db', order: 0 },
            { id: 'f2', key: 'maxDataSize', label: 'Max Data Size', type: 'text', value: 'auto', order: 1 },
          ],
          order: 0,
        },
      ];

      const result = sectionsToConf(sections);

      expect(result).toContain('[myindex]');
      expect(result).toContain('homePath = $SPLUNK_DB/myindex/db');
      expect(result).toContain('maxDataSize = auto');
    });

    it('should handle boolean values', () => {
      const sections: ConfigSection[] = [
        {
          id: 's1',
          name: 'test',
          fields: [
            { id: 'f1', key: 'enabled', label: 'Enabled', type: 'checkbox', value: true, order: 0 },
            { id: 'f2', key: 'disabled', label: 'Disabled', type: 'checkbox', value: false, order: 1 },
          ],
          order: 0,
        },
      ];

      const result = sectionsToConf(sections);

      expect(result).toContain('enabled = true');
      expect(result).toContain('disabled = false');
    });

    it('should handle array values', () => {
      const sections: ConfigSection[] = [
        {
          id: 's1',
          name: 'test',
          fields: [
            { id: 'f1', key: 'roles', label: 'Roles', type: 'tags', value: ['admin', 'user'], order: 0 },
          ],
          order: 0,
        },
      ];

      const result = sectionsToConf(sections);

      expect(result).toContain('roles = admin, user');
    });

    it('should skip empty values', () => {
      const sections: ConfigSection[] = [
        {
          id: 's1',
          name: 'test',
          fields: [
            { id: 'f1', key: 'filled', label: 'Filled', type: 'text', value: 'value', order: 0 },
            { id: 'f2', key: 'empty', label: 'Empty', type: 'text', value: '', order: 1 },
            { id: 'f3', key: 'nullVal', label: 'Null', type: 'text', value: null, order: 2 },
          ],
          order: 0,
        },
      ];

      const result = sectionsToConf(sections);

      expect(result).toContain('filled = value');
      expect(result).not.toContain('empty =');
      expect(result).not.toContain('nullVal =');
    });
  });

  describe('validateConfSyntax', () => {
    it('should validate correct syntax', () => {
      const content = `
[stanza]
key = value
`;
      const result = validateConfSyntax(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect unclosed stanza bracket', () => {
      const content = `
[unclosed
key = value
`;
      const result = validateConfSyntax(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Unclosed stanza bracket'))).toBe(true);
    });

    it('should detect missing equals sign', () => {
      const content = `
[stanza]
invalid line
`;
      const result = validateConfSyntax(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid syntax'))).toBe(true);
    });

    it('should ignore comments and empty lines', () => {
      const content = `
# Comment
; Another comment

[stanza]
key = value
`;
      const result = validateConfSyntax(content);

      expect(result.valid).toBe(true);
    });
  });
});
