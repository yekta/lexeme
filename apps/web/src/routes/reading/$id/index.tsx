import { formatReadingTime } from "@lexeme/shared";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";

import { BookCover } from "@/components/book-card";
import { HighlightItem } from "@/components/highlight-item";
import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { SessionRow } from "@/components/session-row";
import { RequireIdentity } from "@/components/require-identity";
import { SeeAllRow } from "@/components/see-all-row";
import { SectionTitle } from "@/components/section-title";
import { SettlingSkeleton } from "@/components/settling-skeleton";
import { Progress } from "@/components/ui/progress";
import { WordRow } from "@/components/word-row";
import { useBookReading, type TBook } from "@/hooks/data/use-reading";

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
  const { book, days, sessions, highlights, words } = reading;
  const totalSeconds = days.reduce((sum, d) => sum + d.seconds, 0);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={book?.title ?? "Book"} backHref="/reading" />
      <main className="w-full max-w-5xl mx-auto px-5 pt-6 pb-16 flex-1 flex flex-col gap-10">
        {reading.isError ? (
          <LoadError error={reading.error} onRetry={reading.refetch} />
        ) : !book ? (
          !reading.isPending && <p className="text-muted-foreground">This book isn't in your reading data.</p>
        ) : (
          <>
            <BookHeader book={book} totalSeconds={totalSeconds} daysRead={days.length} />

            {sessions.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle title="Sessions" count={sessions.length} />
                <div className="rounded-xl border divide-y overflow-hidden">
                  {sessions.slice(0, RECENT_SESSIONS).map((session) => (
                    <SessionRow key={session.started_at} session={session} />
                  ))}
                  {sessions.length > RECENT_SESSIONS && (
                    <SeeAllRow href={`/reading/${id}/sessions`} more={sessions.length - RECENT_SESSIONS} />
                  )}
                </div>
              </section>
            )}

            {highlights.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle title="Highlights" count={highlights.length} />
                <div className="flex flex-col gap-3">
                  {highlights.slice(0, RECENT_HIGHLIGHTS).map((highlight) => (
                    <HighlightItem key={highlight.id} highlight={highlight} />
                  ))}
                  {highlights.length > RECENT_HIGHLIGHTS && (
                    <SeeAllRow
                      href={`/reading/${id}/highlights`}
                      more={highlights.length - RECENT_HIGHLIGHTS}
                      standalone
                    />
                  )}
                </div>
              </section>
            )}

            {words.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle title="Words" count={words.length} />
                <div className="rounded-xl border divide-y overflow-hidden">
                  {words.slice(0, RECENT_WORDS).map((lookup) => (
                    <WordRow key={lookup.id} lookup={lookup} />
                  ))}
                  {words.length > RECENT_WORDS && (
                    <SeeAllRow href={`/reading/${id}/words`} more={words.length - RECENT_WORDS} />
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

function BookHeader({ book, totalSeconds, daysRead }: { book: TBook; totalSeconds: number; daysRead: number }) {
  const percent = Math.round((book.progress ?? 0) * 100);
  const finished = book.status === "finished";
  const description = book.description ? plainText(book.description) : null;
  const facts = [
    finished && book.finished_at && { label: "Finished", value: format(book.finished_at, "d MMM yyyy") },
    !finished && book.last_read_at && { label: "Last read", value: format(book.last_read_at, "d MMM yyyy") },
    totalSeconds > 0 && { label: "Time read", value: formatReadingTime(totalSeconds) },
    daysRead > 0 && { label: daysRead === 1 ? "Day" : "Days", value: String(daysRead) },
    book.pages && { label: "Pages", value: String(book.pages) },
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
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="font-semibold tabular-nums">{fact.value}</dd>
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

/** Book descriptions come as HTML from the book's metadata. */
function plainText(html: string) {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n");
  const text = new DOMParser().parseFromString(withBreaks, "text/html").body.textContent ?? "";
  return text.replace(/\n{3,}/g, "\n\n").trim() || null;
}

const RECENT_SESSIONS = 3;
const RECENT_HIGHLIGHTS = 3;
const RECENT_WORDS = 3;
