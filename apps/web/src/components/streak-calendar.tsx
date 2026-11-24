import { formatReadingTime, type TReadingDay } from "@lexeme/shared";
import { format, parseISO } from "date-fns";
import { useLayoutEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

type TCell = TReadingDay & { reached: boolean };

/** Weeks as columns, Monday first, padded before the first day so every column is a whole week. */
function weekColumns(days: readonly TReadingDay[], goalSeconds: number) {
  const first = days[0];
  if (!first) return [];
  const lead = (parseISO(first.day).getDay() + 6) % 7;
  const cells: (TCell | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...days.map((d) => ({ ...d, reached: d.seconds >= goalSeconds })),
  ];
  const weeks: (TCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** A month's short name over the first week it starts in. */
function monthLabel(week: (TCell | null)[], previous: (TCell | null)[] | undefined) {
  const day = week.find((cell) => cell !== null);
  if (!day) return "";
  const month = format(parseISO(day.day), "MMM");
  const before = previous?.find((cell) => cell !== null);
  return before && format(parseISO(before.day), "MMM") === month ? "" : month;
}

/** The last year as a GitHub-style grid: a day is filled once it reached the goal. */
export function StreakCalendar({
  days,
  goalMinutes,
  isPlaceholder,
}: {
  days: TReadingDay[];
  goalMinutes: number;
  isPlaceholder?: boolean;
}) {
  const weeks = useMemo(() => weekColumns(days, goalMinutes * 60), [days, goalMinutes]);
  const reached = weeks.flat().filter((cell) => cell?.reached).length;
  const scroller = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [weeks.length, isPlaceholder]);

  return (
    <div className="rounded-xl border bg-card px-4 py-3.5 flex flex-col gap-2">
      <div className="h-4 mb-1 flex items-start text-xs text-muted-foreground">
        <span className="group-data-placeholder:text-transparent group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
          {reached} {reached === 1 ? "day" : "days"} of {goalMinutes} min or more in the last year
        </span>
      </div>
      <div ref={scroller} className="overflow-x-auto -mx-4 px-4 pb-1">
        <div className="grid grid-flow-col auto-cols-[minmax(0.6875rem,1fr)] gap-0.75 min-w-max sm:min-w-0">
          {weeks.map((week, i) => (
            <div key={i} className="flex flex-col gap-0.75">
              <span className="h-4 text-[10px] leading-none text-muted-foreground whitespace-nowrap overflow-visible group-data-placeholder:text-transparent">
                {monthLabel(week, weeks[i - 1])}
              </span>
              {Array.from({ length: 7 }, (_, d) => {
                const cell = week[d];
                if (!cell) return <div key={d} className="aspect-square" />;
                return (
                  <div
                    key={d}
                    title={`${format(parseISO(cell.day), "EEE d MMM yyyy")}: ${formatReadingTime(cell.seconds)}`}
                    className={cn(
                      "aspect-square rounded-[3px] border",
                      cell.reached ? "bg-primary border-primary" : "bg-muted-foreground/8 border-border",
                      "group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:border-transparent group-data-placeholder:animate-pulse",
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
