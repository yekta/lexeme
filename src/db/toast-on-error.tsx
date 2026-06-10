"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Show an error toast if an optimistic mutation fails. Pair with every Convex
 * mutation so the user sees what went wrong when its optimistic update rolls
 * back.
 */
export function toastOnMutationError(
  promise: Promise<unknown>,
  message: string,
): void {
  void promise.catch((error: unknown) => {
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
      <div className="ml-auto pl-4">
        <Button size="xs" onClick={() => toast.dismiss(id)}>
          Okay
        </Button>
      </div>
    ),
  });
  return id;
}
