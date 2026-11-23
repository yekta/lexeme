import { formatReadingTime, secondsByHour, type TPageRead, type TReadingDay } from "@lexeme/shared";
import { format, parseISO } from "date-fns";
import { ArrowLeftIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, XAxis, type XAxisTickContentProps } from "recharts";

import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const CONFIG = { seconds: { label: "Read", color: "var(--primary)" } } satisfies ChartConfig;

type TBar = { key: string; tick: string; tip: string; seconds: number };

/** Reading time per day; a day's bar opens that day hour by hour. */
export function ReadingChart({ days, pageReads }: { days: TReadingDay[]; pageReads: readonly TPageRead[] }) {
  const [day, setDay] = useState<string | null>(null);
  if (day) return <DayChart day={day} pageReads={pageReads} onBack={() => setDay(null)} />;
  return <DaysChart days={days} onSelect={setDay} />;
}

function DaysChart({ days, onSelect }: { days: TReadingDay[]; onSelect: (day: string) => void }) {
  const peak = days.reduce((best, d) => (d.seconds > best.seconds ? d : best), days[0]);
  const bars = days.map((d, i) => ({
    key: d.day,
    tick: i === days.length - 1 ? "Today" : format(parseISO(d.day), "d MMM"),
    tip: format(parseISO(d.day), "EEE d MMM"),
    seconds: d.seconds,
  }));
  return (
    <ChartFrame
      caption={peak && peak.seconds > 0 ? `Most: ${formatReadingTime(peak.seconds)}` : "No reading yet"}
      bars={bars}
      ticks={[bars[0].key, bars[bars.length - 1].key]}
      onSelect={(bar) => bar.seconds > 0 && onSelect(bar.key)}
    />
  );
}

function DayChart({ day, pageReads, onBack }: { day: string; pageReads: readonly TPageRead[]; onBack: () => void }) {
  const hours = useMemo(() => secondsByHour(pageReads, day), [pageReads, day]);
  const total = hours.reduce((sum, seconds) => sum + seconds, 0);
  const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  const bars = hours.map((seconds, hour) => ({
    key: String(hour),
    tick: hourLabel(hour),
    tip: `${hourLabel(hour)}–${hourLabel(hour + 1)}`,
    seconds,
  }));
  return (
    <ChartFrame
      caption={`${format(parseISO(day), "EEEE d MMMM")} · ${formatReadingTime(total)}`}
      action={
        <Button variant="ghost" size="xs" onClick={onBack} className="-mt-2 -mr-2.5">
          <ArrowLeftIcon className="size-3.5 -ml-0.75" />
          30 days
        </Button>
      }
      bars={bars}
      ticks={["0", "6", "12", "18"]}
    />
  );
}

function ChartFrame({
  caption,
  action,
  bars,
  ticks,
  onSelect,
}: {
  caption: string;
  action?: ReactNode;
  bars: TBar[];
  ticks: string[];
  onSelect?: (bar: TBar) => void;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5 flex flex-col gap-2">
      <div className="h-4 mb-2 flex items-start justify-between gap-4 text-xs text-muted-foreground">
        <span>{caption}</span>
        {action}
      </div>
      <ChartContainer config={CONFIG} className="aspect-auto h-44 w-full [&_*:focus]:outline-hidden">
        <BarChart
          accessibilityLayer
          data={bars}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          barCategoryGap={2}
          className={onSelect ? "cursor-pointer" : undefined}
          onClick={(state) => {
            const bar = bars.find((b) => b.key === String(state.activeLabel));
            if (bar) onSelect?.(bar);
          }}
        >
          <XAxis
            dataKey="key"
            ticks={ticks}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={(props: XAxisTickContentProps) => <EdgeTick {...props} bars={bars} />}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            isAnimationActive={false}
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_, payload) => (payload[0]?.payload as TBar | undefined)?.tip}
                formatter={(value) => (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">Read</span>
                    <span className="font-medium tabular-nums text-foreground">{formatReadingTime(Number(value))}</span>
                  </div>
                )}
              />
            }
          />
          <Bar
            dataKey="seconds"
            fill="var(--color-seconds)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/** Axis labels inside the chart's edges: the first starts at the left, the last ends at the right. */
function EdgeTick({ x, y, width, payload, bars }: XAxisTickContentProps & { bars: TBar[] }) {
  const index = bars.findIndex((bar) => bar.key === String(payload.value));
  if (index < 0) return null;
  const band = Number(width ?? 0) / bars.length;
  const first = index === 0;
  const last = index === bars.length - 1;
  return (
    <text
      x={Number(x) + (first ? -band / 2 : last ? band / 2 : 0)}
      y={Number(y) + 12}
      textAnchor={first ? "start" : last ? "end" : "middle"}
      className="fill-muted-foreground text-xs"
    >
      {bars[index].tick}
    </text>
  );
}
