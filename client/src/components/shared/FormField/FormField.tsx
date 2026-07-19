import React, { useId } from 'react';

export interface FormFieldProps {
  /** Rendered as a `<label>`; pass `htmlFor` so it targets the control's id. */
  label?: string;
  /** The id of the control this label/description apply to. */
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  /** The field's control (an Input, Select, or any custom widget). */
  children: React.ReactNode;
}

/**
 * FormField Component
 *
 * A generic label + control + error/hint wrapper for form controls that don't already
 * bundle their own label handling (unlike `Input`/`Select`, which have `label`/`error`/
 * `helperText` built in). Use `FormField` to compose a labeled field around a custom
 * control — a checkbox group, a tag input, a third-party widget — while keeping the same
 * label/error/hint visual language as the rest of the design system.
 *
 * Colors come from design tokens (src/styles/tokens.css) — no `dark:` prefixes needed.
 *
 * @example
 * <FormField label="Allowed IP ranges" hint="One CIDR block per line" error={errors.cidrs}>
 *   <textarea className="..." value={cidrs} onChange={(e) => setCidrs(e.target.value)} />
 * </FormField>
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  className = '',
  children,
}) => {
  const generatedId = useId();
  const descriptionId = error || hint ? `formfield-${generatedId}` : undefined;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-content-primary mb-1">
          {label}
          {required && (
            <span className="text-danger ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {children}

      {error && (
        <p id={descriptionId} className="mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {hint && !error && (
        <p id={descriptionId} className="mt-1 text-sm text-content-secondary">
          {hint}
        </p>
      )}
    </div>
  );
};

FormField.displayName = 'FormField';

export default FormField;
