import { createFileRoute } from "@tanstack/react-router";

import { ReadingListPage, ReadingRoute } from "@/components/reading-list-page";
import { SessionRow } from "@/components/session-row";
import { DividedVirtualList } from "@/components/window-virtual-grid";
import { useBookReading } from "@/hooks/data/use-reading";

export const Route = createFileRoute("/reading/$id/sessions")({
  component: () => (
    <ReadingRoute>
      <SessionsPage />
    </ReadingRoute>
  ),
});

function SessionsPage() {
  const { id } = Route.useParams();
  const reading = useBookReading(id);
  return (
    <ReadingListPage
      navTitle={reading.book?.title ?? "Book"}
      title="Sessions"
      count={reading.sessions.length}
      backHref={`/reading/${id}`}
      narrow
      isError={reading.isError}
      error={reading.error}
      onRetry={reading.refetch}
    >
      <DividedVirtualList
        items={reading.sessions}
        estimateRowHeight={49}
        getKey={(session) => String(session.started_at)}
        renderItem={(session) => <SessionRow session={session} />}
      />
    </ReadingListPage>
  );
}
