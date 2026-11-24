import { cn } from "@/lib/utils";

/** A "·" between inline items, dimmer than the muted text it usually sits in. */
export function Dot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("text-muted-most-foreground", className)}>
      ·
    </span>
  );
}
