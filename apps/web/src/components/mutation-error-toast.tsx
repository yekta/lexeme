import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * The toast an optimistic write puts up when it turns out not to have worked.
 *
 * Sticky and dismissed by hand, because by the time it appears the change has
 * already been rolled back on screen and whatever the user was looking at has
 * usually moved on — a notice that fades after four seconds is one they can
 * miss entirely and never learn their edit is gone.
 */
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
