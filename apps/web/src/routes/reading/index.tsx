import { formatReadingTime } from "@lexeme/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookCheckIcon, BookOpenIcon, ClockIcon, HighlighterIcon, LanguagesIcon } from "lucide-react";
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
import { ReadingSettingsMenu } from "@/components/reading-settings-menu";
import { StreakCalendar } from "@/components/streak-calendar";
import { Navbar } from "@/components/navbar";
import { Page } from "@/components/page";
import { SessionRow } from "@/components/session-row";
import { RequireIdentity } from "@/components/require-identity";
import { SectionEmpty } from "@/components/section-empty";
import { SeeAllRow } from "@/components/see-all-row";
import { SectionTitle } from "@/components/section-title";
import { SettlingSkeleton } from "@/components/settling-skeleton";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { WordRow } from "@/components/word-row";
import { useIsCard, useReading, useReadingSummary, type TBook } from "@/hooks/data/use-reading";

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
  const isCard = useIsCard();
  const summary = useReadingSummary(reading.books, reading.days, reading.goal);
  const isPlaceholder = reading.isPending;
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
    <Page
      title="Reading"
      titleActions={!isPlaceholder && <ReadingSettingsMenu />}
      backHref="/"
      className="gap-8"
      isPlaceholder={isPlaceholder}
    >
      {reading.isError ? (
        <LoadError error={reading.error} onRetry={reading.refetch} />
      ) : !reading.isPending && reading.books.length === 0 ? (
        <NoBooks />
      ) : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            <StatTile label="Today" value={formatReadingTime(summary.todaySeconds)} />
            <StatTile label="This week" value={formatReadingTime(summary.weekSeconds)} />
            <StatTile label="Total" value={formatReadingTime(summary.totalSeconds)} />
            <StatTile label="Streak" value={count(summary.streak, "day", "days")} />
            <StatTile label="Finished (This Year)" value={count(summary.finishedThisYear, "book", "books")} />
            <StatTile label="Finished (All Time)" value={count(summary.finished, "book", "books")} />
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Streak" />
            <StreakCalendar days={summary.streakDays} goalMinutes={reading.goal.daily_minutes} isPlaceholder={isPlaceholder} />
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Reading Time" />
            <ReadingChart days={summary.chartDays} isPlaceholder={isPlaceholder} />
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Reading" count={current.length} />
            {current.length > 0 ? (
              <div className={BOOK_GRID}>
                {current.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            ) : (
              <SectionEmpty icon={<BookOpenIcon />} title="Nothing in progress" description="Books you're reading on your Kindle show up here." />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Words" count={reading.lookups.length} />
            {recentWords.length > 0 ? (
              <div className="rounded-xl border divide-y overflow-hidden">
                {recentWords.map((lookup) => (
                  <WordRow
                    key={lookup.id}
                    lookup={lookup}
                    isCard={isCard(lookup)}
                    bookTitle={lookup.book_id ? titles.get(lookup.book_id) : undefined}
                  />
                ))}
                {reading.lookups.length > RECENT_WORDS && (
                  <SeeAllRow href="/reading/words" />
                )}
              </div>
            ) : (
              <SectionEmpty icon={<LanguagesIcon />} title="No words yet" description="Words you look up while reading show up here." />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Highlights" count={highlights.length} />
            {highlights.length > 0 ? (
              <div className="rounded-xl border divide-y overflow-hidden">
                {highlights.slice(0, RECENT_HIGHLIGHTS).map((highlight) => (
                  <HighlightItem key={highlight.id} highlight={highlight} bookTitle={titles.get(highlight.book_id)} />
                ))}
                {highlights.length > RECENT_HIGHLIGHTS && (
                  <SeeAllRow href="/reading/highlights" />
                )}
              </div>
            ) : (
              <SectionEmpty icon={<HighlighterIcon />} title="No highlights yet" description="Passages you highlight on your Kindle show up here, with your notes." />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Sessions" count={reading.sessions.length} />
            {recentSessions.length > 0 ? (
              <div className="rounded-xl border divide-y overflow-hidden">
                {recentSessions.map((session) => (
                  <SessionRow
                    key={`${session.book_id}-${session.started_at}`}
                    session={session}
                    bookTitle={titles.get(session.book_id)}
                  />
                ))}
                {reading.sessions.length > RECENT_SESSIONS && (
                  <SeeAllRow href="/reading/sessions" />
                )}
              </div>
            ) : (
              <SectionEmpty icon={<ClockIcon />} title="No sessions yet" description="Time you spend reading on your Kindle shows up here." />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Finished" count={finished.length} />
            {finished.length > 0 ? (
              <div className={BOOK_GRID}>
                {finished.slice(0, RECENT_FINISHED).map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
                {finished.length > RECENT_FINISHED && (
                  <SeeAllRow
                    href="/reading/finished"
                    standalone
                    className="col-span-full"
                  />
                )}
              </div>
            ) : (
              <SectionEmpty icon={<BookCheckIcon />} title="Nothing finished yet" description="Books you finish on your Kindle show up here." />
            )}
          </section>
        </>
      )}
    </Page>
  );
}

const READING_NOW_DAYS = 90;
const RECENT_SESSIONS = 3;
const RECENT_WORDS = 3;
const RECENT_HIGHLIGHTS = 3;
const RECENT_FINISHED = 12;

/** In progress and touched lately; a book opened once years ago isn't being read. */
function isReadingNow(book: TBook) {
  if (book.status !== "reading") return false;
  const recent = (book.last_read_at ?? 0) > Date.now() - READING_NOW_DAYS * 24 * 60 * 60 * 1000;
  return recent || (book.progress ?? 0) > 0;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-w-0 py-3">
      <CardHeader>
        <CardDescription className="truncate">{label}</CardDescription>
        <span className="text-xl font-semibold tabular-nums truncate self-start group-data-placeholder:text-transparent group-data-placeholder:bg-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
          {value}
        </span>
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
