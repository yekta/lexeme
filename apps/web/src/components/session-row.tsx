import { formatLocation, formatReadingTime } from "@lexeme/shared";
import { format } from "date-fns";
import { ArrowRightIcon } from "lucide-react";

import { Dot } from "@/components/dot";
import { usePositionUnit, type TReadingSession } from "@/hooks/data/use-reading";
import { formatSessionDay } from "@/lib/relative-day";

/** One sitting: when it was, how long, how many pages or locations, and from which book when that isn't obvious. */
export function SessionRow({ session, bookTitle }: { session: TReadingSession; bookTitle?: string }) {
  const { unit } = usePositionUnit();
  const amount =
    unit === "location" && session.locations != null
      ? `${formatLocation(session.locations)} loc`
      : `${session.pages} ${session.pages === 1 ? "page" : "pages"}`;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="font-medium">
          {formatSessionDay(session.started_at)} <Dot className="text-muted-foreground" />{" "}
          {format(session.started_at, "HH:mm")}
          {" "}<ArrowRightIcon aria-hidden className="inline size-[1em] align-[-0.125em] text-muted-foreground" />{" "}
          {format(session.ended_at, "HH:mm")}
        </span>
        {bookTitle && <span className="text-xs text-muted-foreground truncate">{bookTitle}</span>}
      </div>
      <span className="text-sm text-muted-foreground tabular-nums shrink-0">
        {formatReadingTime(session.seconds)} <Dot /> {amount}
      </span>
    </div>
  );
}
