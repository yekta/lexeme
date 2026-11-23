import { createFileRoute } from "@tanstack/react-router";

import { HighlightItem } from "@/components/highlight-item";
import { ReadingListPage, ReadingRoute } from "@/components/reading-list-page";
import { WindowVirtualGrid } from "@/components/window-virtual-grid";
import { useBookReading } from "@/hooks/data/use-reading";

export const Route = createFileRoute("/reading/$id/highlights")({
  component: () => (
    <ReadingRoute>
      <HighlightsPage />
    </ReadingRoute>
  ),
});

function HighlightsPage() {
  const { id } = Route.useParams();
  const reading = useBookReading(id);
  return (
    <ReadingListPage
      navTitle={reading.book?.title ?? "Book"}
      title="Highlights"
      count={reading.highlights.length}
      backHref={`/reading/${id}`}
      isError={reading.isError}
      error={reading.error}
      onRetry={reading.refetch}
    >
      <WindowVirtualGrid
        items={reading.highlights}
        columns={1}
        estimateRowHeight={70}
        gap={12}
        getKey={(highlight) => highlight.id}
        renderItem={(highlight) => <HighlightItem highlight={highlight} />}
      />
    </ReadingListPage>
  );
}
