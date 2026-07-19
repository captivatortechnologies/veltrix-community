import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import { AxiosError } from 'axios';

// Types
interface Tool {
  id: string;
  name: string;
  description: string;
  vendor: string;
  logoUrl?: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateToolDto {
  name: string;
  description: string;
  vendor: string;
  category: string;
  logoUrl?: string;
}

// Query keys
export const toolKeys = {
  all: ['tools'] as const,
  lists: () => [...toolKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>) => [...toolKeys.lists(), filters] as const,
  details: () => [...toolKeys.all, 'detail'] as const,
  detail: (id: string) => [...toolKeys.details(), id] as const,
  vendors: () => [...toolKeys.all, 'vendors'] as const,
  categories: () => [...toolKeys.all, 'categories'] as const,
};

// Hooks

/**
 * Fetch all tools with optional filters
 */
export function useTools(filters?: Record<string, any>, options?: UseQueryOptions<Tool[], AxiosError>) {
  return useQuery<Tool[], AxiosError>({
    queryKey: toolKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams(filters).toString();
      const response = await api.get<Tool[]>(`/tools${params ? `?${params}` : ''}`);
      return response.data;
    },
    ...options,
  });
}

/**
 * Fetch a single tool by ID
 */
export function useTool(id: string, options?: UseQueryOptions<Tool, AxiosError>) {
  return useQuery<Tool, AxiosError>({
    queryKey: toolKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<Tool>(`/tools/${id}`);
      return response.data;
    },
    enabled: !!id,
    ...options,
  });
}

/**
 * Fetch vendors
 */
export function useVendors(options?: UseQueryOptions<string[], AxiosError>) {
  return useQuery<string[], AxiosError>({
    queryKey: toolKeys.vendors(),
    queryFn: async () => {
      const response = await api.get<string[]>('/tools/vendors');
      return response.data;
    },
    ...options,
  });
}

/**
 * Fetch categories
 */
export function useCategories(options?: UseQueryOptions<string[], AxiosError>) {
  return useQuery<string[], AxiosError>({
    queryKey: toolKeys.categories(),
    queryFn: async () => {
      const response = await api.get<string[]>('/tools/categories');
      return response.data;
    },
    ...options,
  });
}

/**
 * Create a new tool
 */
export function useCreateTool(options?: UseMutationOptions<Tool, AxiosError, CreateToolDto>) {
  const queryClient = useQueryClient();

  return useMutation<Tool, AxiosError, CreateToolDto>({
    mutationFn: async (data: CreateToolDto) => {
      const response = await api.post<Tool>('/tools', data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch tools list
      queryClient.invalidateQueries({ queryKey: toolKeys.lists() });
    },
    ...options,
  });
}

/**
 * Update a tool
 */
export function useUpdateTool(options?: UseMutationOptions<Tool, AxiosError, { id: string; data: Partial<CreateToolDto> }>) {
  const queryClient = useQueryClient();

  return useMutation<Tool, AxiosError, { id: string; data: Partial<CreateToolDto> }>({
    mutationFn: async ({ id, data }) => {
      const response = await api.put<Tool>(`/tools/${id}`, data);
      return response.data;
    },
    onSuccess: (_data, variables) => {
      // Update cache
      queryClient.invalidateQueries({ queryKey: toolKeys.lists() });
      queryClient.invalidateQueries({ queryKey: toolKeys.detail(variables.id) });
    },
    ...options,
  });
}

/**
 * Delete a tool
 */
export function useDeleteTool(options?: UseMutationOptions<void, AxiosError, string>) {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, string>({
    mutationFn: async (id: string) => {
      await api.delete(`/tools/${id}`);
    },
    onSuccess: () => {
      // Invalidate tools list
      queryClient.invalidateQueries({ queryKey: toolKeys.lists() });
    },
    ...options,
  });
}
