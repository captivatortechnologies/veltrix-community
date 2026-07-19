import { z } from 'zod';
import { ConfigCanvasStatus } from '@prisma/client';

// Field schema
export const ConfigurationCanvasFieldSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1, 'Key is required'),
  label: z.string().min(1, 'Label is required'),
  fieldType: z.enum(['text', 'number', 'select', 'multiselect', 'checkbox', 'textarea', 'tags', 'password', 'path']),
  value: z.unknown().optional(),
  defaultValue: z.unknown().optional(),
  required: z.boolean().optional().default(false),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
    description: z.string().optional(),
  })).optional(),
  validation: z.object({
    required: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
    patternMessage: z.string().optional(),
  }).optional(),
  group: z.string().optional(),
  order: z.number().int().min(0).optional().default(0),
  disabled: z.boolean().optional().default(false),
});

// Section schema
export const ConfigurationCanvasSectionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Section name is required'),
  icon: z.string().optional(),
  description: z.string().optional(),
  collapsed: z.boolean().optional().default(false),
  order: z.number().int().min(0).optional().default(0),
  fields: z.array(ConfigurationCanvasFieldSchema),
});

// Create canvas request schema
export const CreateConfigurationCanvasSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
  toolType: z.string().min(1, 'Tool type is required'),
  entityType: z.string().min(1, 'Entity type is required'),
  sections: z.array(ConfigurationCanvasSectionSchema).optional().default([]),
  tagIds: z.array(z.string().uuid()).optional().default([]), // Environment/Tag IDs
});

// Update canvas request schema
export const UpdateConfigurationCanvasSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(ConfigCanvasStatus).optional(),
  sections: z.array(ConfigurationCanvasSectionSchema).optional(),
  tagIds: z.array(z.string().uuid()).optional(), // Environment/Tag IDs
});

// Canvas response schema
export const ConfigurationCanvasResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  toolType: z.string(),
  entityType: z.string(),
  status: z.nativeEnum(ConfigCanvasStatus),
  version: z.number(),
  customerId: z.string().uuid(),
  createdById: z.string().uuid(),
  updatedById: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  sections: z.array(ConfigurationCanvasSectionSchema),
});

// Query parameters schema
export const ListConfigurationCanvasQuerySchema = z.object({
  toolType: z.string().optional(),
  entityType: z.string().optional(),
  status: z.nativeEnum(ConfigCanvasStatus).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'status']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Export types
export type ConfigurationCanvasFieldType = z.infer<typeof ConfigurationCanvasFieldSchema>;
export type ConfigurationCanvasSectionType = z.infer<typeof ConfigurationCanvasSectionSchema>;
export type CreateConfigurationCanvasType = z.infer<typeof CreateConfigurationCanvasSchema>;
export type UpdateConfigurationCanvasType = z.infer<typeof UpdateConfigurationCanvasSchema>;
export type ConfigurationCanvasResponseType = z.infer<typeof ConfigurationCanvasResponseSchema>;
export type ListConfigurationCanvasQueryType = z.infer<typeof ListConfigurationCanvasQuerySchema>;
