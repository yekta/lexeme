import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { ReadingListPage, ReadingRoute } from "@/components/reading-list-page";
import { SessionRow } from "@/components/session-row";
import { DividedVirtualList } from "@/components/window-virtual-grid";
import { useReading } from "@/hooks/data/use-reading";

export const Route = createFileRoute("/reading/sessions")({
  component: () => (
    <ReadingRoute>
      <SessionsPage />
    </ReadingRoute>
  ),
});

function SessionsPage() {
  const reading = useReading();
  const titles = useMemo(() => new Map(reading.books.map((book) => [book.id, book.title])), [reading.books]);
  return (
    <ReadingListPage
      navTitle="Sessions"
      title="Sessions"
      count={reading.sessions.length}
      backHref="/reading"
      isError={reading.isError}
      error={reading.error}
      onRetry={reading.refetch}
    >
      <DividedVirtualList
        items={reading.sessions}
        estimateRowHeight={66}
        getKey={(session) => `${session.book_id}-${session.started_at}`}
        renderItem={(session) => <SessionRow session={session} bookTitle={titles.get(session.book_id)} />}
      />
    </ReadingListPage>
  );
}
