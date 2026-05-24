"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type Tx = { isPersisted: { promise: Promise<unknown> } };

/**
 * Show an error toast if an optimistic mutation fails to persist. Pair with
 * every `collection.insert/update/delete` (and any `createTransaction`) so the
 * user sees what went wrong when TanStack DB rolls a row back.
 */
export function toastOnPersistError(tx: Tx, message: string): void {
  void tx.isPersisted.promise.catch((error: unknown) => {
    const description =
      error instanceof Error ? error.message : "Please try again.";
    toastErrorOnOptimisticOperation({ message, description });
  });
}

export function toastErrorOnOptimisticOperation({
  message,
  description,
}: {
  message: string;
  description?: string;
}) {
  const id: string | number = toast.error(message, {
    description,
    position: "top-center",
    duration: Infinity,
    closeButton: false,
    action: (
      <Button className="ml-auto" size="xs" onClick={() => toast.dismiss(id)}>
        Okay
      </Button>
    ),
  });
  return id;
}
