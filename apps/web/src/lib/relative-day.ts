import { differenceInCalendarDays, differenceInMonths, format } from "date-fns";

type TStyle = Intl.RelativeTimeFormatStyle;

export function formatRelativeDay(date: number, style: TStyle = "long") {
  const now = new Date();
  const days = differenceInCalendarDays(now, date);
  const months = differenceInMonths(now, date);
  if (months >= 12) return formatAbsoluteDay(date);
  if (days < 7) return formatDaysAgo(days, style);
  const relativeTime = new Intl.RelativeTimeFormat("en", { style });
  if (days < 30) return relativeTime.format(-Math.floor(days / 7), "week");
  return relativeTime.format(-Math.max(1, months), "month");
}

/** Counts in days only, so sessions weeks or months back stay distinguishable from each other. */
export function formatSessionDay(date: number) {
  const now = new Date();
  if (differenceInMonths(now, date) >= 12) return formatAbsoluteDay(date);
  return formatDaysAgo(differenceInCalendarDays(now, date), "narrow");
}

function formatDaysAgo(days: number, style: TStyle) {
  return capitalize(new Intl.RelativeTimeFormat("en", { numeric: "auto", style }).format(-days, "day"));
}

function formatAbsoluteDay(date: number) {
  return format(date, "d MMM yyyy");
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const SPAN_UNITS = [
  ["y", 365 * DAY],
  ["mo", 30 * DAY],
  ["d", DAY],
  ["h", 60 * MINUTE],
  ["m", MINUTE],
] as const;

/** A length of time in its largest whole unit: "14h", "3d", "2mo", "<1m". */
export function formatSpan(ms: number) {
  const unit = SPAN_UNITS.find(([, size]) => Math.abs(ms) >= size);
  if (!unit) return "<1m";
  const [label, size] = unit;
  return `${Math.floor(Math.abs(ms) / size)}${label}`;
}

/** "14h ago", "3d ago", "<1m ago". */
export function formatAgo(date: Date | number | string) {
  return `${formatSpan(Date.now() - new Date(date).getTime())} ago`;
}
