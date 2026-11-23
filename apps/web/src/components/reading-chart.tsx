import { formatReadingTime, secondsByHour, type TPageRead, type TReadingDay } from "@lexeme/shared";
import { format, parseISO } from "date-fns";
import { ArrowLeftIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Reading time per day; a day's bar opens that day hour by hour. */
export function ReadingChart({ days, pageReads }: { days: TReadingDay[]; pageReads: readonly TPageRead[] }) {
  const [day, setDay] = useState<string | null>(null);
  if (day) return <DayChart day={day} pageReads={pageReads} onBack={() => setDay(null)} />;
  return <DaysChart days={days} onSelect={setDay} />;
}

function DaysChart({ days, onSelect }: { days: TReadingDay[]; onSelect: (day: string) => void }) {
  const peak = days.reduce((best, d) => (d.seconds > best.seconds ? d : best), days[0]);
  return (
    <ChartFrame
      caption={peak && peak.seconds > 0 ? `Most: ${formatReadingTime(peak.seconds)}` : "No reading yet"}
      label="Minutes read per day"
      bars={days.map((d) => ({
        key: d.day,
        seconds: d.seconds,
        tip: `${format(parseISO(d.day), "EEE d MMM")}: ${formatReadingTime(d.seconds)}`,
        onClick: d.seconds > 0 ? () => onSelect(d.day) : undefined,
      }))}
      axis={[format(parseISO(days[0].day), "d MMM"), "Today"]}
    />
  );
}

function DayChart({ day, pageReads, onBack }: { day: string; pageReads: readonly TPageRead[]; onBack: () => void }) {
  const hours = useMemo(() => secondsByHour(pageReads, day), [pageReads, day]);
  const total = hours.reduce((sum, seconds) => sum + seconds, 0);
  const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  return (
    <ChartFrame
      caption={`${format(parseISO(day), "EEEE d MMMM")} · ${formatReadingTime(total)}`}
      action={
        <Button variant="ghost" size="xs" onClick={onBack} className="-mt-2 -mr-2.5">
          <ArrowLeftIcon className="size-3.5" />
          30 days
        </Button>
      }
      label={`Minutes read per hour on ${format(parseISO(day), "d MMMM")}`}
      bars={hours.map((seconds, hour) => ({
        key: String(hour),
        seconds,
        tip: `${hourLabel(hour)}–${hourLabel(hour + 1)}: ${formatReadingTime(seconds)}`,
      }))}
      axis={[0, 6, 12, 18, 24].map(hourLabel)}
    />
  );
}

type TBar = { key: string; seconds: number; tip: string; onClick?: () => void };

function ChartFrame({
  caption,
  action,
  label,
  bars,
  axis,
}: {
  caption: string;
  action?: ReactNode;
  label: string;
  bars: TBar[];
  axis: string[];
}) {
  const max = Math.max(...bars.map((bar) => bar.seconds), 1);
  return (
    <div className="rounded-xl border bg-card px-4 pt-3.5 pb-4 flex flex-col gap-2">
      <div className="h-4 mb-2 flex items-start justify-between gap-4 text-xs text-muted-foreground">
        <span>{caption}</span>
        {action}
      </div>
      <div className="h-36 flex items-end gap-0.5 border-b border-border" role="img" aria-label={label}>
        {bars.map((bar) => (
          <button
            key={bar.key}
            type="button"
            disabled={!bar.onClick}
            onClick={bar.onClick}
            aria-label={bar.tip}
            className="group relative flex-1 h-full flex items-end enabled:cursor-pointer outline-none"
          >
            <div
              className={cn("w-full rounded-t-[4px] bg-primary group-enabled:group-hover:opacity-80 group-enabled:group-active:opacity-80 group-focus-visible:ring-3 group-focus-visible:ring-ring/50", bar.seconds === 0 && "bg-transparent")}
              style={{ height: `${(bar.seconds / max) * 100}%` }}
            />
            {bar.seconds > 0 && (
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block group-active:block group-focus-visible:block whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md z-10">
                {bar.tip}
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        {axis.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  );
}
