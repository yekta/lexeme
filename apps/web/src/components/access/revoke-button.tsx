import { Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function RevokeButton({
  title,
  description,
  onRevoke,
}: {
  title: string;
  description: string;
  onRevoke: () => Promise<unknown>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string>();

  const revoke = async () => {
    setIsPending(true);
    setError(undefined);
    try {
      await onRevoke();
      setIsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't revoke. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Revoke"
        className="shrink-0 text-muted-foreground"
        onClick={() => setIsOpen(true)}
      >
        <Trash2Icon className="size-4" />
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" isPending={isPending} onClick={revoke}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
