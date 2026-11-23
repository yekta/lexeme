import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { TBook } from "@/hooks/data/use-reading";

export function BookCard({ book }: { book: TBook }) {
  const percent = Math.round((book.progress ?? 0) * 100);
  const finished = book.status === "finished";
  const status = finished
    ? `Finished${book.finished_at ? ` ${format(book.finished_at, "d MMM yyyy")}` : ""}`
    : book.last_read_at
      ? `Read ${formatDistanceToNowStrict(book.last_read_at, { addSuffix: true })}`
      : null;
  return (
    <Link to="/reading/$id" params={{ id: book.id }} className="min-w-0 rounded-xl">
      <Card className="h-full gap-3 py-3 hover:border-foreground/30 transition-colors">
        <CardHeader>
          <CardTitle className="truncate">{book.title}</CardTitle>
          {book.authors && <CardDescription className="truncate">{book.authors}</CardDescription>}
          {status && <CardDescription className="truncate">{status}</CardDescription>}
        </CardHeader>
        {!finished && (
          <CardContent className="flex-1 flex flex-col justify-end">
            <div className="flex items-center gap-3">
              <Progress value={percent} className="flex-1" />
              <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">{percent}%</span>
            </div>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}

/** Finished books, most recently finished first. */
export function finishedBooks(books: readonly TBook[]) {
  return books
    .filter((book) => book.status === "finished")
    .sort((a, b) => (b.finished_at ?? 0) - (a.finished_at ?? 0));
}
