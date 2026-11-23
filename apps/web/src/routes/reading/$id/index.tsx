import { formatReadingTime } from "@lexeme/shared";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";

import { HighlightItem } from "@/components/highlight-item";
import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { SessionRow } from "@/components/session-row";
import { RequireIdentity } from "@/components/require-identity";
import { SectionTitle } from "@/components/section-title";
import { SettlingSkeleton } from "@/components/settling-skeleton";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { WordRow } from "@/components/word-row";
import { useBookReading } from "@/hooks/data/use-reading";

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
  const percent = Math.round((book?.progress ?? 0) * 100);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={book?.title ?? "Book"} backHref="/reading" />
      <main className="w-full max-w-3xl mx-auto px-5 pt-6 pb-16 flex-1 flex flex-col gap-8">
        {reading.isError ? (
          <LoadError error={reading.error} onRetry={reading.refetch} />
        ) : !book ? (
          !reading.isPending && <p className="text-muted-foreground">This book isn't in your reading data.</p>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <div className="mx-1 flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-balance wrap-break-word">{book.title}</h1>
                {book.authors && <p className="text-muted-foreground">{book.authors}</p>}
              </div>
              <div className="flex items-center gap-3">
                <Progress value={percent} className="flex-1" />
                <span className="text-sm text-muted-foreground tabular-nums">{percent}%</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Fact label="Time read" value={formatReadingTime(totalSeconds)} />
                <Fact label="Days read" value={String(days.length)} />
                <Fact
                  label={book.status === "finished" ? "Finished" : "Last read"}
                  value={
                    book.status === "finished" && book.finished_at
                      ? format(book.finished_at, "d MMM yyyy")
                      : book.last_read_at
                        ? format(book.last_read_at, "d MMM yyyy")
                        : "—"
                  }
                />
              </div>
            </section>

            {sessions.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle
                  title="Sessions"
                  count={sessions.length}
                  seeAllHref={sessions.length > RECENT_SESSIONS ? `/reading/${id}/sessions` : undefined}
                />
                <div className="rounded-xl border divide-y">
                  {sessions.slice(0, RECENT_SESSIONS).map((session) => (
                    <SessionRow key={session.started_at} session={session} />
                  ))}
                </div>
              </section>
            )}

            {highlights.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle
                  title="Highlights"
                  count={highlights.length}
                  seeAllHref={highlights.length > RECENT_HIGHLIGHTS ? `/reading/${id}/highlights` : undefined}
                />
                <div className="flex flex-col gap-3">
                  {highlights.slice(0, RECENT_HIGHLIGHTS).map((highlight) => (
                    <HighlightItem key={highlight.id} highlight={highlight} />
                  ))}
                </div>
              </section>
            )}

            {words.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle
                  title="Words"
                  count={words.length}
                  seeAllHref={words.length > RECENT_WORDS ? `/reading/${id}/words` : undefined}
                />
                <div className="rounded-xl border divide-y">
                  {words.slice(0, RECENT_WORDS).map((lookup) => (
                    <WordRow key={lookup.id} lookup={lookup} />
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

const RECENT_SESSIONS = 10;
const RECENT_HIGHLIGHTS = 6;
const RECENT_WORDS = 6;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-w-0 py-3">
      <CardHeader>
        <CardDescription className="truncate">{label}</CardDescription>
        <span className="text-lg font-semibold tabular-nums truncate">{value}</span>
      </CardHeader>
    </Card>
  );
}
