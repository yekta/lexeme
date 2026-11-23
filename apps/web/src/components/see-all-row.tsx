import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/** The last row of a shortened list: how many more there are, linking to all of them. */
export function SeeAllRow({
  href,
  more,
  standalone,
  className,
}: {
  href: string;
  more: number;
  standalone?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={href}
      className={cn(
        "flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 active:text-foreground active:bg-muted/50",
        standalone
          ? "rounded-xl border focus-visible:border-ring"
          : "rounded-b-[calc(var(--radius-xl)-1px)] focus-visible:ring-inset",
        className,
      )}
    >
      <span className="tabular-nums">+{more.toLocaleString()}</span>
      <span aria-hidden>•</span>
      <span>See all</span>
    </Link>
  );
}
