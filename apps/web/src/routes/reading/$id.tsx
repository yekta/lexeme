import { formatReadingTime } from "@lexeme/shared";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { useMemo } from "react";

import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { SessionRow } from "@/components/session-row";
import { RequireIdentity } from "@/components/require-identity";
import { SettlingSkeleton } from "@/components/settling-skeleton";
import { Progress } from "@/components/ui/progress";
import { WordRow } from "@/components/word-row";
import { useReading } from "@/hooks/data/use-reading";

export const Route = createFileRoute("/reading/$id")({
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
  const reading = useReading();
  const book = reading.books.find((b) => b.id === id);
  const days = useMemo(
    () => reading.days.filter((d) => d.book_id === id).sort((a, b) => b.day.localeCompare(a.day)),
    [reading.days, id],
  );
  const highlights = useMemo(
    () => reading.highlights.filter((h) => h.book_id === id).sort((a, b) => a.highlighted_at - b.highlighted_at),
    [reading.highlights, id],
  );
  const sessions = useMemo(
    () => reading.sessions.filter((s) => s.book_id === id).sort((a, b) => b.started_at - a.started_at),
    [reading.sessions, id],
  );
  const words = useMemo(
    () => reading.lookups.filter((l) => l.book_id === id).sort((a, b) => b.looked_up_at - a.looked_up_at),
    [reading.lookups, id],
  );
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
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-balance">{book.title}</h1>
                {book.authors && <p className="text-muted-foreground">{book.authors}</p>}
              </div>
              <div className="flex items-center gap-3">
                <Progress value={percent} className="flex-1" />
                <span className="text-sm text-muted-foreground tabular-nums">{percent}%</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
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
                <h2 className="font-semibold">Sessions</h2>
                <div className="rounded-xl border divide-y">
                  {sessions.map((session) => (
                    <SessionRow key={session.id} session={session} />
                  ))}
                </div>
              </section>
            )}

            {highlights.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-semibold">Highlights</h2>
                <div className="flex flex-col gap-3">
                  {highlights.map((highlight) => (
                    <figure key={highlight.id} className="border-l-4 border-foreground pl-4 flex flex-col gap-1">
                      <blockquote className="text-sm leading-relaxed">{highlight.text}</blockquote>
                      {highlight.note && <p className="text-sm italic text-muted-foreground">{highlight.note}</p>}
                      <figcaption className="text-xs text-muted-foreground">
                        {[highlight.chapter, highlight.page && `Page ${highlight.page}`].filter(Boolean).join(" · ")}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {words.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-semibold">Words</h2>
                <div className="rounded-xl border divide-y">
                  {words.map((lookup) => (
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
