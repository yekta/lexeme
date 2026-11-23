import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/** The last row of a shortened list: how many more there are, linking to all of them. */
export function SeeAllRow({ href, more, standalone }: { href: string; more: number; standalone?: boolean }) {
  return (
    <Link
      to={href}
      className={cn(
        "flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors",
        standalone && "rounded-xl border",
      )}
    >
      <span className="tabular-nums">+{more.toLocaleString()}</span>
      <span aria-hidden>•</span>
      <span>See all</span>
    </Link>
  );
}
