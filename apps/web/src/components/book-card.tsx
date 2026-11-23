import { Link } from "@tanstack/react-router";
import { format } from "date-fns";

import { Progress } from "@/components/ui/progress";
import type { TBook } from "@/hooks/data/use-reading";
import { cn } from "@/lib/utils";

/** A hue picked from the book's id, so a book keeps its colour everywhere and forever. */
function hueOf(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return hash;
}

/** The book drawn as a cover: title and author on a coloured board with a spine line. */
export function BookCover({ book, className }: { book: TBook; className?: string }) {
  const hue = hueOf(book.id);
  return (
    <div
      className={cn(
        "@container relative aspect-[2/3] overflow-hidden rounded-l-sm rounded-r-md shadow-md shadow-shadow/shadow",
        className,
      )}
      style={{ backgroundColor: `oklch(0.42 0.06 ${hue})`, color: `oklch(0.96 0.025 ${hue})` }}
    >
      <div aria-hidden className="absolute inset-y-0 left-[6%] w-px bg-white/15" />
      <div className="absolute inset-0 flex flex-col justify-between gap-2 py-[13%] pr-[10%] pl-[16%]">
        <p
          lang={book.language ?? undefined}
          className="line-clamp-5 font-semibold leading-tight hyphens-auto wrap-break-word text-[length:clamp(0.75rem,10cqw,1.375rem)]"
        >
          {book.title}
        </p>
        {book.authors && (
          <p className="line-clamp-2 leading-tight opacity-75 text-[length:clamp(0.625rem,7.5cqw,1rem)]">
            {book.authors}
          </p>
        )}
      </div>
    </div>
  );
}

/** A cover in a grid, with progress or the finish date underneath. */
export function BookCard({ book }: { book: TBook }) {
  const percent = Math.round((book.progress ?? 0) * 100);
  const finished = book.status === "finished";
  return (
    <Link to="/reading/$id" params={{ id: book.id }} className="group/book min-w-0 flex flex-col gap-2.5 outline-none">
      <BookCover
        book={book}
        className="transition-transform group-hover/book:-translate-y-1 group-active/book:-translate-y-1 group-focus-visible/book:ring-3 group-focus-visible/book:ring-ring/50"
      />
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
