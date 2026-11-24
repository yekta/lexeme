import { formatReadingTime } from "@lexeme/shared";
import { format } from "date-fns";

import { Dot } from "@/components/dot";
import type { TReadingSession } from "@/hooks/data/use-reading";
import { formatRelativeDay } from "@/lib/relative-day";

/** One sitting: when it was, how long, how many pages, and from which book when that isn't obvious. */
export function SessionRow({ session, bookTitle }: { session: TReadingSession; bookTitle?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="font-medium">
          {formatRelativeDay(session.started_at, "short")} <Dot className="text-muted-foreground" />{" "}
          {format(session.started_at, "HH:mm")}
          {" "}<span className="text-muted-foreground">-</span>{" "}
          {format(session.ended_at, "HH:mm")}
        </span>
        {bookTitle && <span className="text-xs text-muted-foreground truncate">{bookTitle}</span>}
      </div>
      <span className="text-sm text-muted-foreground tabular-nums shrink-0">
        {formatReadingTime(session.seconds)} <Dot /> {session.pages} {session.pages === 1 ? "page" : "pages"}
      </span>
    </div>
  );
}
