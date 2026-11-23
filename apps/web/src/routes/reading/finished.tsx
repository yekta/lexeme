import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { BookCard, finishedBooks } from "@/components/book-card";
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
        columns={isMobile ? 1 : 2}
        estimateRowHeight={110}
        gap={16}
        getKey={(book) => book.id}
        rowClassName="grid grid-cols-1 md:grid-cols-2 gap-4"
        renderItem={(book) => <BookCard book={book} />}
      />
    </ReadingListPage>
  );
}
