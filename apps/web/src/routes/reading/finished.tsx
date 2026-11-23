import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { BOOK_GRID, BookCard, bookColumns, finishedBooks } from "@/components/book-card";
import { ReadingListPage, ReadingRoute } from "@/components/reading-list-page";
import { WindowVirtualGrid } from "@/components/window-virtual-grid";
import { useReading } from "@/hooks/data/use-reading";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/reading/finished")({
  component: () => (
    <ReadingRoute>
      <FinishedPage />
    </ReadingRoute>
  ),
});

function FinishedPage() {
  const reading = useReading();
  const isMobile = useIsMobile();
  const books = useMemo(() => finishedBooks(reading.books), [reading.books]);

  return (
    <ReadingListPage
      navTitle="Finished"
      title="Finished"
      count={books.length}
      backHref="/reading"
      isError={reading.isError}
      error={reading.error}
      onRetry={reading.refetch}
    >
      <WindowVirtualGrid
        items={books}
        columns={bookColumns(isMobile)}
        estimateRowHeight={260}
        gap={24}
        getKey={(book) => book.id}
        rowClassName={BOOK_GRID}
        renderItem={(book) => <BookCard book={book} />}
      />
    </ReadingListPage>
  );
}
