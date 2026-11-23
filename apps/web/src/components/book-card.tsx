import { Link } from "@tanstack/react-router";
import { format } from "date-fns";

import { Progress } from "@/components/ui/progress";
import type { TBook } from "@/hooks/data/use-reading";

/** A hue picked from the title, so each book keeps its own colour. */
function hueOf(title: string) {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return hash;
}

/** A book drawn as a cover: title and author on a coloured board with a spine, progress underneath. */
export function BookCard({ book }: { book: TBook }) {
  const percent = Math.round((book.progress ?? 0) * 100);
  const finished = book.status === "finished";
  const hue = hueOf(book.title);
  return (
    <Link to="/reading/$id" params={{ id: book.id }} className="group/book min-w-0 flex flex-col gap-2.5">
      <div
        className="@container relative aspect-[2/3] overflow-hidden rounded-l-sm rounded-r-md shadow-md shadow-shadow/shadow transition-transform group-hover/book:-translate-y-1"
        style={{ backgroundColor: `oklch(0.42 0.06 ${hue})`, color: `oklch(0.96 0.025 ${hue})` }}
      >
        <div aria-hidden className="absolute inset-y-0 left-0 w-[8%] bg-linear-to-r from-black/35 to-black/5" />
        <div aria-hidden className="absolute inset-y-0 left-[8%] w-px bg-white/15" />
        <div className="absolute inset-0 flex flex-col justify-between gap-2 py-[13%] pr-[10%] pl-[16%]">
          <p
            lang={book.language ?? undefined}
            className="line-clamp-5 font-semibold leading-tight hyphens-auto wrap-break-word text-[length:clamp(0.75rem,10cqw,1.125rem)]"
          >
            {book.title}
          </p>
          {book.authors && (
            <p className="line-clamp-2 leading-tight opacity-75 text-[length:clamp(0.625rem,7.5cqw,0.875rem)]">
              {book.authors}
            </p>
          )}
        </div>
      </div>
      {finished ? (
        <span className="text-xs text-muted-foreground truncate">
          {book.finished_at ? format(book.finished_at, "d MMM yyyy") : "Finished"}
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <Progress value={percent} className="flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>
        </div>
      )}
    </Link>
  );
}

/** Covers per row; the grids below and the virtualized list must agree. */
export const BOOK_GRID = "grid grid-cols-3 md:grid-cols-6 gap-x-4 gap-y-6";
export function bookColumns(isMobile: boolean) {
  return isMobile ? 3 : 6;
}

/** Finished books, most recently finished first. */
export function finishedBooks(books: readonly TBook[]) {
  return books
    .filter((book) => book.status === "finished")
    .sort((a, b) => (b.finished_at ?? 0) - (a.finished_at ?? 0));
}
