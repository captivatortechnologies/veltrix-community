// This file provides type declarations for the Tabs component

declare module 'components/ui/Tabs' {
  import React from 'react';
  
  export interface Tab {
    id: string;
    label: string;
    content: React.ReactNode;
  }
  
  export interface TabProps {
    label: string;
    children: React.ReactNode;
  }
  
  export const Tab: React.FC<TabProps> & { id?: string; label?: string; content?: React.ReactNode };
  
  export interface TabsProps {
    children: React.ReactNode;
    defaultTab?: string;
    tabs?: Tab[];
  }
  
  export default function Tabs(props: TabsProps): JSX.Element;
}
