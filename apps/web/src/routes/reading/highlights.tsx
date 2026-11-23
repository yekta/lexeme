import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { HighlightItem } from "@/components/highlight-item";
import { ReadingListPage, ReadingRoute } from "@/components/reading-list-page";
import { WindowVirtualGrid } from "@/components/window-virtual-grid";
import { useReading } from "@/hooks/data/use-reading";

export const Route = createFileRoute("/reading/highlights")({
  component: () => (
    <ReadingRoute>
      <HighlightsPage />
    </ReadingRoute>
  ),
});

function HighlightsPage() {
  const reading = useReading();
  const highlights = useMemo(
    () => [...reading.highlights].sort((a, b) => b.highlighted_at - a.highlighted_at),
    [reading.highlights],
  );
  const titles = useMemo(() => new Map(reading.books.map((book) => [book.id, book.title])), [reading.books]);

  return (
    <ReadingListPage
      navTitle="Highlights"
      title="Highlights"
      count={highlights.length}
      backHref="/reading"
      isError={reading.isError}
      error={reading.error}
      onRetry={reading.refetch}
    >
      <WindowVirtualGrid
        items={highlights}
        columns={1}
        estimateRowHeight={80}
        gap={12}
        getKey={(highlight) => highlight.id}
        renderItem={(highlight) => <HighlightItem highlight={highlight} bookTitle={titles.get(highlight.book_id)} />}
      />
    </ReadingListPage>
  );
}
