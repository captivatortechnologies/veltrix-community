import React from 'react';
import { FieldInputProps, FieldType } from '../../types';
import { TextField } from './TextField';
import { NumberField } from './NumberField';
import { SelectField } from './SelectField';
import { CheckboxField } from './CheckboxField';
import { TextareaField } from './TextareaField';
import { TagsField } from './TagsField';
import { PathField } from './PathField';
import { FilesField } from './FilesField';
import { KeyValueField } from './KeyValueField';

/**
 * The concrete value type each field type's input component works with.
 * The registry annotation below indexes into this map, so adding a new
 * `FieldType` member without an entry here fails to compile.
 */
interface FieldValueTypeMap {
  text: string;
  number: number;
  select: string | string[];
  multiselect: string | string[];
  checkbox: boolean;
  textarea: string;
  tags: string[];
  password: string;
  path: string;
  files: import('../../types').FileEntry[];
  keyvalue: import('../../types').KeyValueEntry[];
}

/**
 * Field input component registry.
 *
 * Each entry is checked against the concrete value type its component
 * renders. `FieldInputProps<T>` is invariant in `T` (it appears covariantly
 * in `value` and contravariantly in `onChange`), so these components cannot
 * be stored as a common `ComponentType<FieldInputProps<unknown>>` — instead,
 * each field type maps to a component for its own concrete value type.
 */
const fieldComponents: {
  [K in FieldType]: React.ComponentType<FieldInputProps<FieldValueTypeMap[K]>>;
} = {
  text: TextField,
  number: NumberField,
  select: SelectField,
  multiselect: SelectField, // Uses same component with isMulti prop
  checkbox: CheckboxField,
  textarea: TextareaField,
  tags: TagsField,
  password: TextField, // Uses TextField with type="password"
  path: PathField,
  files: FilesField,
  keyvalue: KeyValueField,
};

/**
 * FieldInput - Main component that renders the appropriate field type
 */
export const FieldInput: React.FC<FieldInputProps> = (props) => {
  const { field } = props;

  // Single narrowing boundary: the canvas hands us the value as `unknown`,
  // while the registry stores components typed for their concrete value
  // types. The registry guarantees the component selected for `field.type`
  // matches the value shape that field type stores, so widening the
  // component once here is safe. The optional `inputType`/`isMulti` props
  // cover the password (TextField) and multiselect (SelectField) entries.
  const Component = (fieldComponents[field.type] || TextField) as React.ComponentType<
    FieldInputProps & {
      inputType?: 'text' | 'password' | 'email' | 'url';
      isMulti?: boolean;
      lockKeys?: boolean;
    }
  >;

  // Handle password type specially (registry maps it to TextField)
  if (field.type === 'password') {
    return <Component {...props} inputType="password" />;
  }

  // Handle multiselect specially (registry maps it to SelectField)
  if (field.type === 'multiselect') {
    return <Component {...props} isMulti />;
  }

  // A keyvalue field may lock its keys (read-only labels, edit values only) when
  // the template declares `lockKeys` — the keys are seeded from its defaultValue.
  if (field.type === 'keyvalue') {
    return <Component {...props} lockKeys={field.lockKeys} />;
  }

  return <Component {...props} />;
};

export { TextField } from './TextField';
export { NumberField } from './NumberField';
export { SelectField } from './SelectField';
export { CheckboxField } from './CheckboxField';
export { TextareaField } from './TextareaField';
export { TagsField } from './TagsField';
export { PathField } from './PathField';
