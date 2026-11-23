import { okResponse, pairingResponse } from "@lexeme/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost } from "@/lib/api";

function pairingKey(code: string | undefined) {
  return ["device-pairing", code];
}

/** The device waiting for this code: its name, and whether it's still waiting. */
export function usePairing(code: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: pairingKey(code),
    queryFn: () => apiGet(`/api/devices/pair/${encodeURIComponent(code ?? "")}`, pairingResponse),
    enabled: enabled && !!code,
    retry: false,
  });
}

export function useApprovePairing(code: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/api/devices/pair/${encodeURIComponent(code ?? "")}/approve`, okResponse, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pairingKey(code) }),
  });
}
