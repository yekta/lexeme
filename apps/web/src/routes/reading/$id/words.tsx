import { createFileRoute } from "@tanstack/react-router";

import { ReadingListPage, ReadingRoute } from "@/components/reading-list-page";
import { DividedVirtualList } from "@/components/window-virtual-grid";
import { WordRow } from "@/components/word-row";
import { useBookReading } from "@/hooks/data/use-reading";

export const Route = createFileRoute("/reading/$id/words")({
  component: () => (
    <ReadingRoute>
      <BookWordsPage />
    </ReadingRoute>
  ),
});

function BookWordsPage() {
  const { id } = Route.useParams();
  const reading = useBookReading(id);
  return (
    <ReadingListPage
      navTitle={reading.book?.title ?? "Book"}
      title="Words"
      count={reading.words.length}
      backHref={`/reading/${id}`}
      isError={reading.isError}
      error={reading.error}
      onRetry={reading.refetch}
    >
      <DividedVirtualList
        items={reading.words}
        estimateRowHeight={90}
        getKey={(lookup) => lookup.id}
        renderItem={(lookup) => <WordRow lookup={lookup} />}
      />
    </ReadingListPage>
  );
}
