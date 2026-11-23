import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { ReadingListPage, ReadingRoute } from "@/components/reading-list-page";
import { DividedVirtualList } from "@/components/window-virtual-grid";
import { WordRow } from "@/components/word-row";
import { useCardWords, useReading } from "@/hooks/data/use-reading";

export const Route = createFileRoute("/reading/words")({
  component: () => (
    <ReadingRoute>
      <WordsPage />
    </ReadingRoute>
  ),
});

function WordsPage() {
  const reading = useReading();
  const cardWords = useCardWords();
  const words = useMemo(
    () => [...reading.lookups].sort((a, b) => b.looked_up_at - a.looked_up_at),
    [reading.lookups],
  );
  const titles = useMemo(() => new Map(reading.books.map((book) => [book.id, book.title])), [reading.books]);

  return (
    <ReadingListPage
      navTitle="Words"
      title="Words"
      count={words.length}
      backHref="/reading"
      isError={reading.isError}
      error={reading.error}
      onRetry={reading.refetch}
    >
      <DividedVirtualList
        items={words}
        estimateRowHeight={110}
        getKey={(lookup) => lookup.id}
        renderItem={(lookup) => (
          <WordRow
            lookup={lookup}
            isCard={cardWords.has(lookup.word.trim().toLowerCase())}
            bookTitle={lookup.book_id ? titles.get(lookup.book_id) : undefined}
          />
        )}
      />
    </ReadingListPage>
  );
}
