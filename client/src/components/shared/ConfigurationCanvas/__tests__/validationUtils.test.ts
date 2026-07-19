/**
 * Tests for validation utility functions
 */

import {
  validateField,
  validateSection,
  validateSections,
  hasFieldError,
  getFieldError,
  countSectionErrors,
  VALIDATION_PATTERNS,
} from '../utils/validationUtils';
import { ConfigField, ConfigSection } from '../types';

describe('validationUtils', () => {
  describe('validateField', () => {
    const createField = (overrides: Partial<ConfigField> = {}): ConfigField => ({
      id: 'test-field',
      key: 'testKey',
      label: 'Test Field',
      type: 'text',
      value: '',
      order: 0,
      ...overrides,
    });

    it('should return error for required field with empty value', () => {
      const field = createField({ required: true, value: '' });
      expect(validateField(field)).toBe('Test Field is required');
    });

    it('should return error for required field with null value', () => {
      const field = createField({ required: true, value: null });
      expect(validateField(field)).toBe('Test Field is required');
    });

    it('should return error for required field with undefined value', () => {
      const field = createField({ required: true, value: undefined });
      expect(validateField(field)).toBe('Test Field is required');
    });

    it('should return error for required field with empty array value', () => {
      const field = createField({ required: true, value: [], type: 'multiselect' });
      expect(validateField(field)).toBe('Test Field is required');
    });

    it('should return null for required field with valid value', () => {
      const field = createField({ required: true, value: 'test value' });
      expect(validateField(field)).toBeNull();
    });

    it('should return null for non-required empty field', () => {
      const field = createField({ required: false, value: '' });
      expect(validateField(field)).toBeNull();
    });

    it('should validate minLength', () => {
      const field = createField({
        value: 'ab',
        validation: { minLength: 5 },
      });
      expect(validateField(field)).toBe('Test Field must be at least 5 characters');
    });

    it('should validate maxLength', () => {
      const field = createField({
        value: 'this is a very long string',
        validation: { maxLength: 10 },
      });
      expect(validateField(field)).toBe('Test Field must be at most 10 characters');
    });

    it('should validate pattern', () => {
      const field = createField({
        value: 'invalid!@#',
        validation: {
          pattern: '^[a-zA-Z0-9]+$',
          patternMessage: 'Only alphanumeric characters allowed',
        },
      });
      expect(validateField(field)).toBe('Only alphanumeric characters allowed');
    });

    it('should use default pattern message when not provided', () => {
      const field = createField({
        value: 'invalid!@#',
        validation: { pattern: '^[a-zA-Z0-9]+$' },
      });
      expect(validateField(field)).toBe('Test Field format is invalid');
    });

    it('should validate number min', () => {
      const field = createField({
        type: 'number',
        value: 5,
        validation: { min: 10 },
      });
      expect(validateField(field)).toBe('Test Field must be at least 10');
    });

    it('should validate number max', () => {
      const field = createField({
        type: 'number',
        value: 100,
        validation: { max: 50 },
      });
      expect(validateField(field)).toBe('Test Field must be at most 50');
    });

    it('should validate array min items', () => {
      const field = createField({
        type: 'multiselect',
        value: ['item1'],
        validation: { min: 2 },
      });
      expect(validateField(field)).toBe('Test Field must have at least 2 items');
    });

    it('should validate array max items', () => {
      const field = createField({
        type: 'multiselect',
        value: ['item1', 'item2', 'item3'],
        validation: { max: 2 },
      });
      expect(validateField(field)).toBe('Test Field must have at most 2 items');
    });

    it('should validate with custom validator', () => {
      const customMessage = 'Value must be even';
      const field = createField({
        type: 'number',
        value: 3,
        validation: {
          custom: (val) => (typeof val === 'number' && val % 2 !== 0 ? customMessage : null),
        },
      });
      expect(validateField(field)).toBe(customMessage);
    });

    it('should pass custom validation when valid', () => {
      const field = createField({
        type: 'number',
        value: 4,
        validation: {
          custom: (val) => (typeof val === 'number' && val % 2 !== 0 ? 'Must be even' : null),
        },
      });
      expect(validateField(field)).toBeNull();
    });
  });

  describe('validateSection', () => {
    const createSection = (fields: ConfigField[]): ConfigSection => ({
      id: 'test-section',
      name: 'Test Section',
      fields,
      order: 0,
    });

    it('should return empty array for valid section', () => {
      const section = createSection([
        { id: 'f1', key: 'field1', label: 'Field 1', type: 'text', value: 'valid', order: 0 },
        { id: 'f2', key: 'field2', label: 'Field 2', type: 'text', value: 'also valid', order: 1 },
      ]);
      expect(validateSection(section)).toEqual([]);
    });

    it('should return errors for invalid fields', () => {
      const section = createSection([
        { id: 'f1', key: 'field1', label: 'Field 1', type: 'text', value: '', required: true, order: 0 },
        { id: 'f2', key: 'field2', label: 'Field 2', type: 'text', value: 'valid', order: 1 },
        { id: 'f3', key: 'field3', label: 'Field 3', type: 'text', value: '', required: true, order: 2 },
      ]);

      const errors = validateSection(section);
      expect(errors).toHaveLength(2);
      expect(errors[0]).toEqual({
        sectionId: 'test-section',
        fieldId: 'f1',
        message: 'Field 1 is required',
      });
      expect(errors[1]).toEqual({
        sectionId: 'test-section',
        fieldId: 'f3',
        message: 'Field 3 is required',
      });
    });
  });

  describe('validateSections', () => {
    it('should return isValid true for empty sections', () => {
      const result = validateSections([]);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return isValid true for valid sections', () => {
      const sections: ConfigSection[] = [
        {
          id: 's1',
          name: 'Section 1',
          fields: [
            { id: 'f1', key: 'field1', label: 'Field 1', type: 'text', value: 'valid', order: 0 },
          ],
          order: 0,
        },
      ];
      const result = validateSections(sections);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return isValid false with errors for invalid sections', () => {
      const sections: ConfigSection[] = [
        {
          id: 's1',
          name: 'Section 1',
          fields: [
            { id: 'f1', key: 'field1', label: 'Field 1', type: 'text', value: '', required: true, order: 0 },
          ],
          order: 0,
        },
        {
          id: 's2',
          name: 'Section 2',
          fields: [
            { id: 'f2', key: 'field2', label: 'Field 2', type: 'text', value: '', required: true, order: 0 },
          ],
          order: 1,
        },
      ];
      const result = validateSections(sections);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('hasFieldError', () => {
    const errors = [
      { sectionId: 's1', fieldId: 'f1', message: 'Error 1' },
      { sectionId: 's1', fieldId: 'f2', message: 'Error 2' },
      { sectionId: 's2', fieldId: 'f3', message: 'Error 3' },
    ];

    it('should return true when field has error', () => {
      expect(hasFieldError(errors, 's1', 'f1')).toBe(true);
    });

    it('should return false when field has no error', () => {
      expect(hasFieldError(errors, 's1', 'f3')).toBe(false);
    });

    it('should return false for non-existent section', () => {
      expect(hasFieldError(errors, 's3', 'f1')).toBe(false);
    });
  });

  describe('getFieldError', () => {
    const errors = [
      { sectionId: 's1', fieldId: 'f1', message: 'Error 1' },
      { sectionId: 's1', fieldId: 'f2', message: 'Error 2' },
    ];

    it('should return error message when field has error', () => {
      expect(getFieldError(errors, 's1', 'f1')).toBe('Error 1');
    });

    it('should return undefined when field has no error', () => {
      expect(getFieldError(errors, 's1', 'f3')).toBeUndefined();
    });
  });

  describe('countSectionErrors', () => {
    const errors = [
      { sectionId: 's1', fieldId: 'f1', message: 'Error 1' },
      { sectionId: 's1', fieldId: 'f2', message: 'Error 2' },
      { sectionId: 's2', fieldId: 'f3', message: 'Error 3' },
    ];

    it('should count errors for section', () => {
      expect(countSectionErrors(errors, 's1')).toBe(2);
      expect(countSectionErrors(errors, 's2')).toBe(1);
    });

    it('should return 0 for section with no errors', () => {
      expect(countSectionErrors(errors, 's3')).toBe(0);
    });
  });

  describe('VALIDATION_PATTERNS', () => {
    it('should validate email pattern', () => {
      const pattern = new RegExp(VALIDATION_PATTERNS.EMAIL);
      expect(pattern.test('test@example.com')).toBe(true);
      expect(pattern.test('invalid-email')).toBe(false);
    });

    it('should validate URL pattern', () => {
      const pattern = new RegExp(VALIDATION_PATTERNS.URL);
      expect(pattern.test('https://example.com')).toBe(true);
      expect(pattern.test('http://example.com/path')).toBe(true);
      expect(pattern.test('not-a-url')).toBe(false);
    });

    it('should validate alphanumeric pattern', () => {
      const pattern = new RegExp(VALIDATION_PATTERNS.ALPHANUMERIC);
      expect(pattern.test('test123')).toBe(true);
      expect(pattern.test('test-123')).toBe(false);
    });

    it('should validate Splunk index name pattern', () => {
      const pattern = new RegExp(VALIDATION_PATTERNS.SPLUNK_INDEX_NAME);
      expect(pattern.test('my_index')).toBe(true);
      expect(pattern.test('my-index-123')).toBe(true);
      expect(pattern.test('invalid index!')).toBe(false);
    });

    it('should validate IP address pattern', () => {
      const pattern = new RegExp(VALIDATION_PATTERNS.IP_ADDRESS);
      expect(pattern.test('192.168.1.1')).toBe(true);
      expect(pattern.test('10.0.0.1')).toBe(true);
      expect(pattern.test('invalid')).toBe(false);
    });

    it('should validate port pattern', () => {
      const pattern = new RegExp(VALIDATION_PATTERNS.PORT);
      expect(pattern.test('8080')).toBe(true);
      expect(pattern.test('443')).toBe(true);
      expect(pattern.test('65535')).toBe(true);
      expect(pattern.test('70000')).toBe(false);
    });
  });
});
