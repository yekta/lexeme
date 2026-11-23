import { createFileRoute } from "@tanstack/react-router";

import { HighlightItem } from "@/components/highlight-item";
import { ReadingListPage, ReadingRoute } from "@/components/reading-list-page";
import { DividedVirtualList } from "@/components/window-virtual-grid";
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
      <DividedVirtualList
        items={reading.highlights}
        estimateRowHeight={90}
        getKey={(highlight) => highlight.id}
        renderItem={(highlight) => <HighlightItem highlight={highlight} />}
      />
    </ReadingListPage>
  );
}
