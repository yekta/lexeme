import { formatReadingTime } from "@lexeme/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpenIcon } from "lucide-react";
import { useMemo } from "react";

import { BOOK_GRID, BookCard, finishedBooks } from "@/components/book-card";
import {
  EmptyList,
  EmptyListContent,
  EmptyListDescription,
  EmptyListHeader,
  EmptyListIcon,
  EmptyListTitle,
} from "@/components/empty-list";
import { HighlightItem } from "@/components/highlight-item";
import { LoadError } from "@/components/load-error";
import { ReadingChart } from "@/components/reading-chart";
import { Navbar } from "@/components/navbar";
import { SessionRow } from "@/components/session-row";
import { RequireIdentity } from "@/components/require-identity";
import { SeeAllRow } from "@/components/see-all-row";
import { SectionTitle } from "@/components/section-title";
import { SettlingSkeleton } from "@/components/settling-skeleton";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { WordRow } from "@/components/word-row";
import { useReading, useReadingSummary, type TBook } from "@/hooks/data/use-reading";

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
  const finished = useMemo(() => finishedBooks(reading.books), [reading.books]);
  const recentWords = useMemo(
    () => [...reading.lookups].sort((a, b) => b.looked_up_at - a.looked_up_at).slice(0, RECENT_WORDS),
    [reading.lookups],
  );
  const highlights = useMemo(
    () => [...reading.highlights].sort((a, b) => b.highlighted_at - a.highlighted_at),
    [reading.highlights],
  );
  const recentSessions = useMemo(() => reading.sessions.slice(0, RECENT_SESSIONS), [reading.sessions]);
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
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatTile label="Today" value={formatReadingTime(summary.todaySeconds)} />
              <StatTile label="This week" value={formatReadingTime(summary.weekSeconds)} />
              <StatTile label="Streak" value={`${summary.streak} ${summary.streak === 1 ? "day" : "days"}`} />
              <StatTile label={`Finished in ${new Date().getFullYear()}`} value={String(summary.finishedThisYear)} />
            </section>

            <section className="flex flex-col gap-3">
              <SectionTitle title="Reading Time" />
              <ReadingChart days={summary.lastDays} pageReads={reading.pageReads} />
            </section>

            {current.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle title="Reading" count={current.length} />
                <div className={BOOK_GRID}>
                  {current.map((book) => (
                    <BookCard key={book.id} book={book} />
                  ))}
                </div>
              </section>
            )}

            {recentWords.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle title="Words" count={reading.lookups.length} />
                <div className="rounded-xl border divide-y overflow-hidden">
                  {recentWords.map((lookup) => (
                    <WordRow key={lookup.id} lookup={lookup} bookTitle={lookup.book_id ? titles.get(lookup.book_id) : undefined} />
                  ))}
                  {reading.lookups.length > RECENT_WORDS && (
                    <SeeAllRow href="/reading/words" more={reading.lookups.length - RECENT_WORDS} />
                  )}
                </div>
              </section>
            )}

            {highlights.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle title="Highlights" count={highlights.length} />
                <div className="flex flex-col gap-3">
                  {highlights.slice(0, RECENT_HIGHLIGHTS).map((highlight) => (
                    <HighlightItem key={highlight.id} highlight={highlight} bookTitle={titles.get(highlight.book_id)} />
                  ))}
                  {highlights.length > RECENT_HIGHLIGHTS && (
                    <SeeAllRow href="/reading/highlights" more={highlights.length - RECENT_HIGHLIGHTS} standalone />
                  )}
                </div>
              </section>
            )}

            {recentSessions.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle title="Sessions" count={reading.sessions.length} />
                <div className="rounded-xl border divide-y overflow-hidden">
                  {recentSessions.map((session) => (
                    <SessionRow
                      key={`${session.book_id}-${session.started_at}`}
                      session={session}
                      bookTitle={titles.get(session.book_id)}
                    />
                  ))}
                  {reading.sessions.length > RECENT_SESSIONS && (
                    <SeeAllRow href="/reading/sessions" more={reading.sessions.length - RECENT_SESSIONS} />
                  )}
                </div>
              </section>
            )}

            {finished.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle title="Finished" count={finished.length} />
                <div className={BOOK_GRID}>
                  {finished.slice(0, RECENT_FINISHED).map((book) => (
                    <BookCard key={book.id} book={book} />
                  ))}
                  {finished.length > RECENT_FINISHED && (
                    <SeeAllRow
                      href="/reading/finished"
                      more={finished.length - RECENT_FINISHED}
                      standalone
                      className="col-span-full"
                    />
                  )}
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
const RECENT_SESSIONS = 10;
const RECENT_WORDS = 6;
const RECENT_HIGHLIGHTS = 3;
const RECENT_FINISHED = 12;

/** In progress and touched lately; a book opened once years ago isn't being read. */
function isReadingNow(book: TBook) {
  if (book.status !== "reading") return false;
  const recent = (book.last_read_at ?? 0) > Date.now() - READING_NOW_DAYS * 24 * 60 * 60 * 1000;
  return recent || (book.progress ?? 0) > 0;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-w-0 py-3">
      <CardHeader>
        <CardDescription className="truncate">{label}</CardDescription>
        <span className="text-xl font-semibold tabular-nums truncate">{value}</span>
      </CardHeader>
    </Card>
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
