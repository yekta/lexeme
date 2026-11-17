import {
  createApiKeyResponse,
  listApiKeysResponse,
  okResponse,
  type TCreateApiKeyRequest,
} from "@lexeme/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiDelete, apiGet, apiPost } from "@/lib/api";

const API_KEYS_KEY = ["api-keys"];

export function useApiKeys() {
  return useQuery({
    queryKey: API_KEYS_KEY,
    queryFn: () => apiGet("/api/api-keys", listApiKeysResponse),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TCreateApiKeyRequest) =>
      apiPost("/api/api-keys", createApiKeyResponse, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_KEY }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/api-keys/${id}`, okResponse),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_KEY }),
  });
}
