import {
  listConnectedAppsResponse,
  oauthConsentResponse,
  oauthRedirectResponse,
  okResponse,
  type TOAuthAuthorizeParams,
} from "@lexeme/contracts";
import type { TAccessRole } from "@lexeme/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiDelete, apiGet, apiPost } from "@/lib/api";

const CONNECTED_APPS_KEY = ["connected-apps"];

export function useConnectedApps() {
  return useQuery({
    queryKey: CONNECTED_APPS_KEY,
    queryFn: () => apiGet("/api/connected-apps", listConnectedAppsResponse),
  });
}

export function useRevokeConnectedApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/connected-apps/${id}`, okResponse),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONNECTED_APPS_KEY }),
  });
}

function toQuery(params: TOAuthAuthorizeParams): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return new URLSearchParams(entries).toString();
}

export function useOAuthConsent(params: TOAuthAuthorizeParams | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["oauth-consent", params],
    queryFn: () =>
      apiGet(`/api/oauth/consent?${toQuery(params!)}`, oauthConsentResponse),
    enabled: enabled && !!params,
    staleTime: Infinity,
  });
}

export function useOAuthDecision() {
  return useMutation({
    mutationFn: (
      input:
        | { approve: true; params: TOAuthAuthorizeParams; role: TAccessRole }
        | { approve: false; params: TOAuthAuthorizeParams },
    ) =>
      input.approve
        ? apiPost("/api/oauth/consent/approve", oauthRedirectResponse, {
            params: input.params,
            role: input.role,
          })
        : apiPost("/api/oauth/consent/deny", oauthRedirectResponse, { params: input.params }),
    onSuccess: ({ redirect_url }) => window.location.assign(redirect_url),
  });
}
