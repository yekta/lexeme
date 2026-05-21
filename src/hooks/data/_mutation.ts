/**
 * Thin adapter that gives optimistic, local-first writes the small
 * `{ mutate, mutateAsync, isPending }` surface the forms already expect.
 *
 * Writes apply to the local collections synchronously (instant UI); the server
 * sync happens in the background. `mutateAsync` therefore resolves immediately
 * — the dialog can close without waiting for a network round-trip.
 */
export type Mutation<TVars, TResult = void> = {
  isPending: boolean;
  mutate: (vars: TVars, opts?: { onSuccess?: (result: TResult) => void }) => void;
  mutateAsync: (vars: TVars) => Promise<TResult>;
};

export function asMutation<TVars, TResult = void>(
  run: (vars: TVars) => TResult,
): Mutation<TVars, TResult> {
  return {
    isPending: false,
    mutateAsync: async (vars) => run(vars),
    mutate: (vars, opts) => {
      const result = run(vars);
      opts?.onSuccess?.(result);
    },
  };
}
