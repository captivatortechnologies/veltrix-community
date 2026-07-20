/**
 * Validation Utility Functions
 */

import {
  ConfigField,
  ConfigSection,
  FieldValidation,
  ValidationError,
  ValidationResult,
} from '../types';
import { isFieldVisible, fieldValueMap } from './visibility';

/**
 * Validate a single field against its validation rules
 * @returns Error message or null if valid
 */
export const validateField = (field: ConfigField): string | null => {
  const { value, validation, required, label } = field;

  // Check required
  if (required || validation?.required) {
    if (value === undefined || value === null || value === '') {
      return `${label} is required`;
    }
    if (Array.isArray(value) && value.length === 0) {
      return `${label} is required`;
    }
  }

  // Skip other validations if value is empty and not required
  if (value === undefined || value === null || value === '') {
    return null;
  }

  // String validations
  if (typeof value === 'string') {
    if (validation?.minLength !== undefined && value.length < validation.minLength) {
      return `${label} must be at least ${validation.minLength} characters`;
    }
    if (validation?.maxLength !== undefined && value.length > validation.maxLength) {
      return `${label} must be at most ${validation.maxLength} characters`;
    }
    if (validation?.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return validation.patternMessage || `${label} format is invalid`;
      }
    }
  }

  // Number validations
  if (typeof value === 'number') {
    if (validation?.min !== undefined && value < validation.min) {
      return `${label} must be at least ${validation.min}`;
    }
    if (validation?.max !== undefined && value > validation.max) {
      return `${label} must be at most ${validation.max}`;
    }
  }

  // Array validations (for multiselect/tags)
  if (Array.isArray(value)) {
    if (validation?.min !== undefined && value.length < validation.min) {
      return `${label} must have at least ${validation.min} items`;
    }
    if (validation?.max !== undefined && value.length > validation.max) {
      return `${label} must have at most ${validation.max} items`;
    }
  }

  // Custom validation
  if (validation?.custom) {
    const customError = validation.custom(value);
    if (customError) {
      return customError;
    }
  }

  return null;
};

/**
 * Validate all fields in a section
 */
export const validateSection = (section: ConfigSection): ValidationError[] => {
  const errors: ValidationError[] = [];
  // A field hidden by its `visibleWhen` condition is not validated — otherwise a
  // hidden-but-required field (e.g. the JSON input while "guided" mode is active)
  // would block the whole item.
  const values = fieldValueMap(section.fields);

  for (const field of section.fields) {
    if (!isFieldVisible(field, values)) continue;
    const error = validateField(field);
    if (error) {
      errors.push({
        sectionId: section.id,
        fieldId: field.id,
        message: error,
      });
    }
  }

  return errors;
};

/**
 * Validate all sections
 */
export const validateSections = (sections: ConfigSection[]): ValidationResult => {
  const errors: ValidationError[] = [];

  for (const section of sections) {
    errors.push(...validateSection(section));
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Check if a field has an error
 */
export const hasFieldError = (
  errors: ValidationError[],
  sectionId: string,
  fieldId: string
): boolean => {
  return errors.some(
    (e) => e.sectionId === sectionId && e.fieldId === fieldId
  );
};

/**
 * Get the error message for a specific field
 */
export const getFieldError = (
  errors: ValidationError[],
  sectionId: string,
  fieldId: string
): string | undefined => {
  const error = errors.find(
    (e) => e.sectionId === sectionId && e.fieldId === fieldId
  );
  return error?.message;
};

/**
 * Count errors in a section
 */
export const countSectionErrors = (
  errors: ValidationError[],
  sectionId: string
): number => {
  return errors.filter((e) => e.sectionId === sectionId).length;
};

/**
 * Create a validation rule for required fields
 */
export const requiredRule = (message?: string): FieldValidation => ({
  required: true,
  patternMessage: message,
});

/**
 * Create a validation rule for minimum length
 */
export const minLengthRule = (min: number, message?: string): FieldValidation => ({
  minLength: min,
  patternMessage: message,
});

/**
 * Create a validation rule for maximum length
 */
export const maxLengthRule = (max: number, message?: string): FieldValidation => ({
  maxLength: max,
  patternMessage: message,
});

/**
 * Create a validation rule for number range
 */
export const rangeRule = (
  min: number,
  max: number,
  message?: string
): FieldValidation => ({
  min,
  max,
  patternMessage: message,
});

/**
 * Create a validation rule for pattern matching
 */
export const patternRule = (
  pattern: string,
  message: string
): FieldValidation => ({
  pattern,
  patternMessage: message,
});

/**
 * Common validation patterns
 */
export const VALIDATION_PATTERNS = {
  EMAIL: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
  URL: '^https?:\\/\\/[^\\s/$.?#].[^\\s]*$',
  ALPHANUMERIC: '^[a-zA-Z0-9]+$',
  ALPHANUMERIC_UNDERSCORE: '^[a-zA-Z0-9_]+$',
  ALPHANUMERIC_HYPHEN: '^[a-zA-Z0-9-]+$',
  SPLUNK_INDEX_NAME: '^[a-zA-Z0-9_-]+$',
  PATH: '^(\\/|\\$[A-Z_]+)[\\w\\-\\/$.]+$',
  IP_ADDRESS: '^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$',
  PORT: '^([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$',
};

/**
 * Pre-built validators for common use cases
 */
export const COMMON_VALIDATORS = {
  splunkIndexName: patternRule(
    VALIDATION_PATTERNS.SPLUNK_INDEX_NAME,
    'Index name can only contain letters, numbers, underscores, and hyphens'
  ),
  splunkPath: patternRule(
    VALIDATION_PATTERNS.PATH,
    'Path must be a valid Splunk path (e.g., $SPLUNK_DB/myindex/db)'
  ),
  ipAddress: patternRule(
    VALIDATION_PATTERNS.IP_ADDRESS,
    'Must be a valid IP address'
  ),
  port: patternRule(
    VALIDATION_PATTERNS.PORT,
    'Must be a valid port number (0-65535)'
  ),
  email: patternRule(
    VALIDATION_PATTERNS.EMAIL,
    'Must be a valid email address'
  ),
  url: patternRule(
    VALIDATION_PATTERNS.URL,
    'Must be a valid URL'
  ),
};
