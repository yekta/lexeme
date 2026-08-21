import {
  generateBackResponse,
  generateCardResponse,
  type TGenerateBackRequest,
  type TGenerateCardRequest,
} from "@lexeme/contracts";
import { useMutation } from "@tanstack/react-query";

import { apiPost } from "@/lib/api";

/**
 * The two model calls, as React Query mutations.
 *
 * They are the only things left in this app that are genuinely a network
 * request the user waits on — everything else reads or writes the local store —
 * so they are also the only place a retry policy and an in-flight flag are
 * worth having. `@lexeme/contracts` supplies both the request shape the server
 * validates and the response shape parsed here, which is what replaced tRPC's
 * inferred client.
 */

export function useGenerateCard() {
  return useMutation({
    mutationKey: ["cards", "generate-card"],
    mutationFn: (input: TGenerateCardRequest) =>
      apiPost("/api/cards/generate-card", generateCardResponse, input),
  });
}

export function useGenerateBack() {
  return useMutation({
    mutationKey: ["cards", "generate-back"],
    mutationFn: (input: TGenerateBackRequest) =>
      apiPost("/api/cards/generate-back", generateBackResponse, input),
  });
}
