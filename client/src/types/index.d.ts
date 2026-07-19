// This file provides type declarations to fix common TypeScript errors

// Fix for 'components/ui/Tabs' import error
declare module 'components/ui/Tabs' {
  import React from 'react';
  export interface TabProps {
    label: string;
    children: React.ReactNode;
  }
  export const Tab: React.FC<TabProps>;
  
  export interface TabsProps {
    children: React.ReactNode;
    defaultTab?: string;
  }
  export default function Tabs(props: TabsProps): JSX.Element;
}

// Fix for component props missing fields
interface GeneralInfoTabProps {
  // Add all required props to prevent TypeScript errors
  tags: Array<{ id: string | number; name: string; [key: string]: unknown }>;
  newTag: string;
  setNewTag: React.Dispatch<React.SetStateAction<string>>;
  handleAddTag: () => Promise<void>;
  confirmDeleteTag: (id: string | number) => void;
  getTagNames: (tagIds: (string | number)[]) => string;
  components?: Array<Record<string, unknown>>;
  [key: string]: unknown; // Allow any additional props
}

// Fix for DeleteConfirmationModalProps
interface DeleteConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  message: string;
}

// Fix for various API types
declare namespace API {
  interface Credential {
    id: string;
    name: string;
    username: string;
    password: string;
    apiToken?: string;
    certificate?: string;
    type?: string;
    toolId: string;
    tagIds: string[];
    tags?: Array<{ id: string | number }>;
  }
  
  interface Component {
    id: string;
    name: string;
    tagIds: string[];
    tags?: Array<{ id: string | number }>;
    [key: string]: unknown;
  }
  
  interface Tag {
    id: string | number;
    name: string;
    [key: string]: unknown;
  }
}

// Allow null values in form data
interface OrganizationFormData {
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  industry: string | null;
  description: string | null;
  [key: string]: string | null | undefined;
}

// Override React input props to allow null values
declare namespace React {
  interface InputHTMLAttributes<T = HTMLInputElement> {
    value?: string | number | readonly string[] | null | undefined;
  }

  interface TextareaHTMLAttributes<T = HTMLTextAreaElement> {
    value?: string | number | readonly string[] | null | undefined;
  }

  interface AnchorHTMLAttributes<T = HTMLAnchorElement> {
    href?: string | null | undefined;
  }
}
