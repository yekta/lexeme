import { toastOnMutationError } from "@/db/toast-on-error";
import { trackMutation } from "@/db/pending-mutations";

/**
 * Run a Convex mutation promise while (a) tracking it in the per-entity pending
 * counter that drives the optimistic indicator, and (b) toasting if it fails.
 * Returns the same promise so callers can await the server result.
 */
export function runMutation<T>(
  entity: string,
  promise: Promise<T>,
  errorMessage: string,
): Promise<T> {
  trackMutation(entity, promise);
  toastOnMutationError(promise, errorMessage);
  return promise;
}
