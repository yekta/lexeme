import { formatReadingTime, type TReadingDay } from "@lexeme/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { BookOpenIcon } from "lucide-react";
import { useMemo } from "react";

import {
  EmptyList,
  EmptyListContent,
  EmptyListDescription,
  EmptyListHeader,
  EmptyListIcon,
  EmptyListTitle,
} from "@/components/empty-list";
import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { SessionRow } from "@/components/session-row";
import { RequireIdentity } from "@/components/require-identity";
import { SettlingSkeleton } from "@/components/settling-skeleton";
import { Progress } from "@/components/ui/progress";
import { WordRow } from "@/components/word-row";
import { useReading, useReadingSummary, type TBook } from "@/hooks/data/use-reading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reading/")({
  component: ReadingRoute,
});

function ReadingRoute() {
  return (
    <RequireIdentity
      fallback={
        <SettlingSkeleton>
          <Navbar />
        </SettlingSkeleton>
      }
    >
      <ReadingPage />
    </RequireIdentity>
  );
}

function ReadingPage() {
  const reading = useReading();
  const summary = useReadingSummary(reading.books, reading.days);
  const booksByRecent = useMemo(
    () => [...reading.books].sort((a, b) => (b.last_read_at ?? 0) - (a.last_read_at ?? 0)),
    [reading.books],
  );
  const current = booksByRecent.filter(isReadingNow);
  const finished = booksByRecent
    .filter((book) => book.status === "finished")
    .sort((a, b) => (b.finished_at ?? 0) - (a.finished_at ?? 0));
  const recentWords = useMemo(
    () => [...reading.lookups].sort((a, b) => b.looked_up_at - a.looked_up_at).slice(0, 30),
    [reading.lookups],
  );
  const recentSessions = useMemo(
    () => reading.sessions.slice(0, 10),
    [reading.sessions],
  );
  const titles = useMemo(() => new Map(reading.books.map((book) => [book.id, book.title])), [reading.books]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Reading" backHref="/" />
      <main className="w-full max-w-5xl mx-auto px-5 pt-6 pb-16 flex-1 flex flex-col gap-8">
        {reading.isError ? (
          <LoadError error={reading.error} onRetry={reading.refetch} />
        ) : !reading.isPending && reading.books.length === 0 ? (
          <NoBooks />
        ) : (
          <>
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Today" value={formatReadingTime(summary.todaySeconds)} />
              <StatTile label="This week" value={formatReadingTime(summary.weekSeconds)} />
              <StatTile label="Streak" value={`${summary.streak} ${summary.streak === 1 ? "day" : "days"}`} />
              <StatTile label={`Finished in ${new Date().getFullYear()}`} value={String(summary.finishedThisYear)} />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Reading time, last 30 days</h2>
              <DailyBars days={summary.lastDays} />
            </section>

            {recentSessions.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-semibold">Recent sessions</h2>
                <div className="rounded-xl border divide-y">
                  {recentSessions.map((session) => (
                    <SessionRow
                      key={`${session.book_id}-${session.started_at}`}
                      session={session}
                      bookTitle={titles.get(session.book_id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {current.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-semibold">Reading now</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {current.map((book) => (
                    <BookRow key={book.id} book={book} />
                  ))}
                </div>
              </section>
            )}

            {recentWords.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-semibold">Words</h2>
                <div className="rounded-xl border divide-y">
                  {recentWords.map((lookup) => (
                    <WordRow key={lookup.id} lookup={lookup} bookTitle={lookup.book_id ? titles.get(lookup.book_id) : undefined} />
                  ))}
                </div>
              </section>
            )}

            {finished.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-semibold">Finished</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {finished.map((book) => (
                    <BookRow key={book.id} book={book} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const READING_NOW_DAYS = 90;

/** In progress and touched lately; a book opened once years ago isn't being read. */
function isReadingNow(book: TBook) {
  if (book.status !== "reading") return false;
  const recent = (book.last_read_at ?? 0) > Date.now() - READING_NOW_DAYS * 24 * 60 * 60 * 1000;
  return recent || (book.progress ?? 0) > 0;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** One bar per day; the tallest day sets the scale. */
function DailyBars({ days }: { days: TReadingDay[] }) {
  const max = Math.max(...days.map((d) => d.seconds), 1);
  const peak = days.reduce((best, d) => (d.seconds > best.seconds ? d : best), days[0]);
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between text-xs text-muted-foreground">
        <span>{peak && peak.seconds > 0 ? `Most: ${formatReadingTime(peak.seconds)}` : "No reading yet"}</span>
      </div>
      <div className="h-36 flex items-end gap-0.5 border-b border-border" role="img" aria-label="Minutes read per day">
        {days.map((day) => (
          <div key={day.day} className="group relative flex-1 h-full flex items-end">
            <div
              className={cn("w-full rounded-t-[4px] bg-primary", day.seconds === 0 && "bg-transparent")}
              style={{ height: `${(day.seconds / max) * 100}%` }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md z-10">
              {format(parseISO(day.day), "EEE d MMM")}: {formatReadingTime(day.seconds)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{format(parseISO(days[0].day), "d MMM")}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function BookRow({ book }: { book: TBook }) {
  const percent = Math.round((book.progress ?? 0) * 100);
  return (
    <Link
      to="/reading/$id"
      params={{ id: book.id }}
      className="rounded-xl border bg-card p-4 flex flex-col gap-2 hover:border-foreground/30 transition-colors"
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-medium truncate">{book.title}</span>
        {book.authors && <span className="text-sm text-muted-foreground truncate">{book.authors}</span>}
      </div>
      {book.status === "finished" ? (
        <span className="text-xs text-muted-foreground">
          Finished{book.finished_at ? ` ${format(book.finished_at, "d MMM yyyy")}` : ""}
        </span>
      ) : (
        <div className="flex items-center gap-3">
          <Progress value={percent} className="flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">{percent}%</span>
        </div>
      )}
      {book.status !== "finished" && book.last_read_at && (
        <span className="text-xs text-muted-foreground">
          Read {formatDistanceToNowStrict(book.last_read_at, { addSuffix: true })}
        </span>
      )}
    </Link>
  );
}

function NoBooks() {
  return (
    <EmptyList className="flex-1">
      <EmptyListHeader>
        <EmptyListIcon>
          <BookOpenIcon />
        </EmptyListIcon>
        <EmptyListContent>
          <EmptyListTitle>Nothing read yet</EmptyListTitle>
          <EmptyListDescription>
            Connect your Kindle under Settings → Integrations → Lexeme. Your books, reading time, highlights and the
            words you add will show up here.
          </EmptyListDescription>
        </EmptyListContent>
      </EmptyListHeader>
    </EmptyList>
  );
}
