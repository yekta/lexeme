import { formatLocation, formatReadingTime, readingSpeed, type TPositionUnit } from "@lexeme/shared";
import { createFileRoute } from "@tanstack/react-router";
import { ClockIcon, HighlighterIcon, LanguagesIcon } from "lucide-react";

import { BookCover } from "@/components/book-card";
import { HighlightItem } from "@/components/highlight-item";
import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { Page } from "@/components/page";
import { SessionRow } from "@/components/session-row";
import { RequireIdentity } from "@/components/require-identity";
import { SectionEmpty } from "@/components/section-empty";
import { SeeAllRow } from "@/components/see-all-row";
import { SectionTitle } from "@/components/section-title";
import { SettlingSkeleton } from "@/components/settling-skeleton";
import { Progress } from "@/components/ui/progress";
import { WordRow } from "@/components/word-row";
import {
  useBookReading,
  useIsCard,
  usePositionUnit,
  type TBook,
  type TReadingSession,
} from "@/hooks/data/use-reading";
import { formatRelativeDay } from "@/lib/relative-day";

export const Route = createFileRoute("/reading/$id/")({
  component: BookRoute,
});

function BookRoute() {
  return (
    <RequireIdentity
      fallback={
        <SettlingSkeleton>
          <Navbar />
        </SettlingSkeleton>
      }
    >
      <BookPage />
    </RequireIdentity>
  );
}

function BookPage() {
  const { id } = Route.useParams();
  const reading = useBookReading(id);
  const isCard = useIsCard();
  const { book, days, sessions, highlights, words } = reading;
  const totalSeconds = days.reduce((sum, d) => sum + d.seconds, 0);

  return (
    <Page title={book?.title ?? "Book"} backHref="/reading" className="gap-10">
      {reading.isError ? (
        <LoadError error={reading.error} onRetry={reading.refetch} />
      ) : !book ? (
        !reading.isPending && <p className="text-muted-foreground">This book isn't in your reading data.</p>
      ) : (
        <>
          <BookHeader book={book} totalSeconds={totalSeconds} daysRead={days.length} sessions={sessions} />

          <section className="flex flex-col gap-3">
            <SectionTitle title="Sessions" count={sessions.length} />
            {sessions.length > 0 ? (
              <div className="rounded-xl border divide-y overflow-hidden">
                {sessions.slice(0, RECENT_SESSIONS).map((session) => (
                  <SessionRow key={session.started_at} session={session} />
                ))}
                {sessions.length > RECENT_SESSIONS && (
                  <SeeAllRow href={`/reading/${id}/sessions`} />
                )}
              </div>
            ) : (
              <SectionEmpty icon={<ClockIcon />} title="No sessions yet" description="Time you spend reading on your Kindle shows up here." />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Highlights" count={highlights.length} />
            {highlights.length > 0 ? (
              <div className="rounded-xl border divide-y overflow-hidden">
                {highlights.slice(0, RECENT_HIGHLIGHTS).map((highlight) => (
                  <HighlightItem key={highlight.id} highlight={highlight} />
                ))}
                {highlights.length > RECENT_HIGHLIGHTS && (
                  <SeeAllRow href={`/reading/${id}/highlights`} />
                )}
              </div>
            ) : (
              <SectionEmpty icon={<HighlighterIcon />} title="No highlights yet" description="Passages you highlight on your Kindle show up here, with your notes." />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Words" count={words.length} />
            {words.length > 0 ? (
              <div className="rounded-xl border divide-y overflow-hidden">
                {words.slice(0, RECENT_WORDS).map((lookup) => (
                  <WordRow key={lookup.id} lookup={lookup} isCard={isCard(lookup)} />
                ))}
                {words.length > RECENT_WORDS && (
                  <SeeAllRow href={`/reading/${id}/words`} />
                )}
              </div>
            ) : (
              <SectionEmpty icon={<LanguagesIcon />} title="No words yet" description="Words you look up while reading show up here." />
            )}
          </section>
        </>
      )}
    </Page>
  );
}

function BookHeader({
  book,
  totalSeconds,
  daysRead,
  sessions,
}: {
  book: TBook;
  totalSeconds: number;
  daysRead: number;
  sessions: readonly TReadingSession[];
}) {
  const { unit } = usePositionUnit();
  const speed = formatSpeed(sessions, unit);
  const percent = Math.round((book.progress ?? 0) * 100);
  const finished = book.status === "finished";
  const description = book.description ? plainText(book.description) : null;
  const facts = [
    finished && book.finished_at && { label: "Finished", value: formatRelativeDay(book.finished_at) },
    !finished && book.last_read_at && { label: "Last read", value: formatRelativeDay(book.last_read_at) },
    totalSeconds > 0 && { label: "Time read", value: formatReadingTime(totalSeconds) },
    daysRead > 0 && { label: daysRead === 1 ? "Day" : "Days", value: String(daysRead) },
    unit === "location" && book.locations
      ? { label: "Locations", value: formatLocation(book.locations) }
      : book.pages && { label: "Pages", value: String(book.pages) },
    speed && { label: "Speed", value: speed },
  ].filter((fact) => !!fact);

  return (
    <section className="flex items-start gap-5 md:gap-8">
      <BookCover book={book} className="w-28 md:w-44 shrink-0" />
      <div className="min-w-0 flex-1 flex flex-col gap-5 md:pt-1">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-balance wrap-break-word">{book.title}</h1>
          {book.authors && <p className="text-muted-foreground md:text-lg">{book.authors}</p>}
          {book.series && <p className="text-sm text-muted-foreground">{book.series}</p>}
        </div>
        {!finished && (
          <div className="flex items-center gap-3 max-w-sm">
            <Progress value={percent} className="flex-1" />
            <span className="text-sm text-muted-foreground tabular-nums">{percent}%</span>
          </div>
        )}
        {facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:flex md:flex-wrap md:gap-x-8">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0 flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="font-semibold tabular-nums wrap-break-word">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {description && (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground whitespace-pre-line line-clamp-6">
            {description}
          </p>
        )}
      </div>
    </section>
  );
}

function formatSpeed(sessions: readonly TReadingSession[], unit: TPositionUnit) {
  const locationsPerHour = unit === "location" ? readingSpeed(sessions, "location") : null;
  if (locationsPerHour != null) return `${formatLocation(locationsPerHour)} loc/h`;
  const pagesPerHour = readingSpeed(sessions, "page");
  if (pagesPerHour == null) return null;
  return `${pagesPerHour} page/h`;
}

/** Book descriptions come as HTML from the book's metadata. */
function plainText(html: string) {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n");
  const text = new DOMParser().parseFromString(withBreaks, "text/html").body.textContent ?? "";
  return text.replace(/\n{3,}/g, "\n\n").trim() || null;
}

const RECENT_SESSIONS = 3;
const RECENT_HIGHLIGHTS = 3;
const RECENT_WORDS = 3;
