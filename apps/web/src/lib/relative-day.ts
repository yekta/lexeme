import { differenceInCalendarDays, differenceInMonths, format } from "date-fns";

type TStyle = Intl.RelativeTimeFormatStyle;

export function formatRelativeDay(date: number, style: TStyle = "long") {
  const now = new Date();
  const days = differenceInCalendarDays(now, date);
  const months = differenceInMonths(now, date);
  if (months >= 12) return format(date, "d MMM yyyy");
  if (days < 7) return capitalize(new Intl.RelativeTimeFormat("en", { numeric: "auto", style }).format(-days, "day"));
  const relativeTime = new Intl.RelativeTimeFormat("en", { style });
  if (days < 30) return relativeTime.format(-Math.floor(days / 7), "week");
  return relativeTime.format(-Math.max(1, months), "month");
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
