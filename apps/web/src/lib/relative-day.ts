import { differenceInCalendarDays, differenceInMonths, format } from "date-fns";

const relativeDay = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const relativeTime = new Intl.RelativeTimeFormat("en");

export function formatRelativeDay(date: number) {
  const now = new Date();
  const days = differenceInCalendarDays(now, date);
  const months = differenceInMonths(now, date);
  if (months >= 12) return format(date, "d MMM yyyy");
  if (days < 7) return capitalize(relativeDay.format(-days, "day"));
  if (days < 30) return relativeTime.format(-Math.floor(days / 7), "week");
  return relativeTime.format(-Math.max(1, months), "month");
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
