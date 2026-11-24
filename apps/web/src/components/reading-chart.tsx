import { formatReadingTime, type TReadingDay } from "@lexeme/shared";
import { format, parseISO } from "date-fns";
import { Bar, BarChart, XAxis, type XAxisTickContentProps } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const CONFIG = { seconds: { label: "Read", color: "var(--muted-foreground)" } } satisfies ChartConfig;

type TBar = { key: string; tick: string; tip: string; seconds: number };

/** Reading time per day, oldest first, ending today. */
export function ReadingChart({ days, isPlaceholder }: { days: TReadingDay[]; isPlaceholder?: boolean }) {
  const peak = days.reduce((best, d) => (d.seconds > best.seconds ? d : best), days[0]);
  const bars = days.map((d, i) => ({
    key: d.day,
    tick: i === days.length - 1 ? "Today" : format(parseISO(d.day), "d MMM"),
    tip: format(parseISO(d.day), "EEE d MMM"),
    seconds: d.seconds,
  }));
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5 flex flex-col gap-2">
      <div className="h-4 mb-2 flex items-start text-xs text-muted-foreground">
        <span className="group-data-placeholder:text-transparent group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
          {isPlaceholder ? "Most: 0 min" : peak && peak.seconds > 0 ? `Most: ${formatReadingTime(peak.seconds)}` : "No reading yet"}
        </span>
      </div>
      {isPlaceholder ? (
        <div className="h-44 w-full rounded-md bg-muted-foreground/20 animate-pulse" />
      ) : (
        <ChartContainer config={CONFIG} className="aspect-auto h-44 w-full [&_*:focus]:outline-hidden">
          <BarChart accessibilityLayer data={bars} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap={1}>
            <XAxis
              dataKey="key"
              ticks={[bars[0].key, bars[bars.length - 1].key]}
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={(props: XAxisTickContentProps) => <EdgeTick {...props} bars={bars} />}
            />
            <ChartTooltip
              cursor={{ fill: "var(--border)" }}
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
            <Bar dataKey="seconds" fill="var(--color-seconds)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      )}
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
