/**
 * useValidation Hook
 *
 * Provides real-time validation for the Configuration Canvas
 */

import { useState, useCallback } from 'react';
import {
  ConfigField,
  ConfigSection,
  ValidationError,
  ValidationResult,
  UseValidationReturn,
} from '../types';
import {
  validateField as validateFieldUtil,
  validateSection as validateSectionUtil,
  validateSections,
} from '../utils/validationUtils';

/**
 * Hook for managing validation state and operations
 */
export const useValidation = (): UseValidationReturn => {
  const [errors, setErrors] = useState<ValidationError[]>([]);

  /**
   * Validate a single field and return the error message
   */
  const validateField = useCallback(
    (sectionId: string, field: ConfigField): string | null => {
      const error = validateFieldUtil(field);

      // Update errors state
      setErrors((prevErrors) => {
        // Remove existing error for this field
        const filtered = prevErrors.filter(
          (e) => !(e.sectionId === sectionId && e.fieldId === field.id)
        );

        // Add new error if exists
        if (error) {
          return [
            ...filtered,
            { sectionId, fieldId: field.id, message: error },
          ];
        }

        return filtered;
      });

      return error;
    },
    []
  );

  /**
   * Validate all fields in a section
   */
  const validateSection = useCallback(
    (section: ConfigSection): ValidationError[] => {
      const sectionErrors = validateSectionUtil(section);

      // Update errors state - replace all errors for this section
      setErrors((prevErrors) => {
        const filtered = prevErrors.filter(
          (e) => e.sectionId !== section.id
        );
        return [...filtered, ...sectionErrors];
      });

      return sectionErrors;
    },
    []
  );

  /**
   * Validate all sections
   */
  const validateAll = useCallback(
    (sections: ConfigSection[]): ValidationResult => {
      const result = validateSections(sections);
      setErrors(result.errors);
      return result;
    },
    []
  );

  /**
   * Clear all validation errors
   */
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return {
    errors,
    validateField,
    validateSection,
    validateAll,
    clearErrors,
  };
};

export default useValidation;
