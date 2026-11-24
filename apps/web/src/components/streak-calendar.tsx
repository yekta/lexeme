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

const LABEL_COLUMNS = 3;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Each month's short name over the first week it starts in, left out where the next month's would touch it. */
function monthLabels(weeks: (TCell | null)[][]) {
  const months = weeks.map((week) => {
    const day = week.find((cell) => cell !== null);
    return day ? format(parseISO(day.day), "MMM") : "";
  });
  const labels = months.map((month, i) => (month !== months[i - 1] ? month : ""));
  return labels.map((label, i) => (labels.slice(i + 1, i + LABEL_COLUMNS).some(Boolean) ? "" : label));
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
  const labels = useMemo(() => monthLabels(weeks), [weeks]);
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
          {reached} {reached === 1 ? "day" : "days"} of {goalMinutes} min+
        </span>
      </div>
      <div className="flex gap-1.5">
        <div className="flex flex-col gap-0.75 pb-1 text-[10px] leading-none text-muted-foreground">
          <span className="h-4" />
          {WEEKDAYS.map((day) => (
            <span key={day} className="flex-1 flex items-center">
              {day}
            </span>
          ))}
        </div>
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto -mr-4 pr-4 pb-1">
          <div className="grid grid-flow-col auto-cols-[minmax(0.6875rem,1fr)] gap-0.75 min-w-max sm:min-w-0">
            {weeks.map((week, i) => (
              <div key={i} className="flex flex-col gap-0.75">
                <span className="h-4 text-[10px] leading-none text-muted-foreground whitespace-nowrap overflow-visible group-data-placeholder:text-transparent">
                  {labels[i]}
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
                        cell.reached ? "bg-muted-foreground border-muted-foreground" : "bg-muted-foreground/8 border-border",
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
    </div>
  );
}
