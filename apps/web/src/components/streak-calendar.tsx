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

/** The last year as a GitHub-style grid: a day is filled once it reached the goal. Scrolls on phones, ending on today. */
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
    const toToday = () => {
      const element = scroller.current;
      if (element) element.scrollLeft = element.scrollWidth;
    };
    toToday();
    const frame = requestAnimationFrame(toToday);
    return () => cancelAnimationFrame(frame);
  }, [weeks.length, isPlaceholder]);

  return (
    <div className="rounded-xl border bg-card px-4 pt-3.5 flex flex-col gap-2 overflow-hidden">
      <div className="h-4 mb-1 flex items-start text-xs text-muted-foreground">
        <span className="group-data-placeholder:text-transparent group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
          {reached} {reached === 1 ? "day" : "days"} with {goalMinutes}m+ of reading
        </span>
      </div>
      <div ref={scroller} className="overflow-x-auto -mx-4 pr-4 pb-3.5">
        <div className="flex min-w-max sm:min-w-0">
          <div className="sticky left-0 z-10 pl-4 pr-1.5 bg-card flex flex-col gap-0.5 sm:gap-0.75 text-[10px] leading-none text-muted-foreground">
            <span className="h-4" />
            {WEEKDAYS.map((day) => (
              <span key={day} className="flex-1 flex items-center">
                {day}
              </span>
            ))}
          </div>
          <div className="flex-1 grid grid-flow-col auto-cols-[0.75rem] sm:auto-cols-fr gap-0.5 sm:gap-0.75">
            {weeks.map((week, i) => (
              <div key={i} className="min-w-0 flex flex-col gap-0.5 sm:gap-0.75">
                <span className="h-4 text-[10px] leading-none text-muted-foreground whitespace-nowrap group-data-placeholder:text-transparent">
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
                        "aspect-square rounded-[2px] sm:rounded-[3px]",
                        cell.reached ? "bg-muted-foreground" : "bg-border",
                        "group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse",
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
