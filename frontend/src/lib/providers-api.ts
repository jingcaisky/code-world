/**
 * API client for user-scoped AI provider configurations.
 */

import { apiClient } from "./api-client";

export interface ProviderRecord {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  is_enabled: boolean;
  is_preset: boolean;
  created_at: string;
  updated_at: string | null;
}

interface ProviderList {
  items: ProviderRecord[];
  total: number;
}

const ROOT = "/me/providers";

export async function listProviders(): Promise<ProviderRecord[]> {
  const data = await apiClient.get<ProviderList>(ROOT);
  return data.items;
}

export async function createProvider(input: {
  name: string;
  base_url: string;
  api_key?: string;
  is_enabled?: boolean;
}): Promise<ProviderRecord> {
  return apiClient.post<ProviderRecord>(ROOT, input);
}

export async function updateProvider(
  id: string,
  patch: {
    name?: string;
    base_url?: string;
    api_key?: string;
    is_enabled?: boolean;
  },
): Promise<ProviderRecord> {
  return apiClient.patch<ProviderRecord>(`${ROOT}/${id}`, patch);
}

export async function deleteProvider(id: string): Promise<void> {
  await apiClient.delete(`${ROOT}/${id}`);
}
