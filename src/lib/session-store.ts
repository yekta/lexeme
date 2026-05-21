/**
 * Tiny synchronous cache of the signed-in user's id.
 *
 * Optimistic writes (`onMutate`) need `user_id` synchronously to build a row
 * that matches what Electric will later sync back. `useAuth` keeps this in sync
 * with the Better Auth session.
 */
let currentUserId: string | null = null;

export function setCurrentUserId(id: string | null): void {
  currentUserId = id;
}

export function getCurrentUserId(): string {
  if (!currentUserId) {
    throw new Error("No authenticated user — write attempted before sign-in.");
  }
  return currentUserId;
}
