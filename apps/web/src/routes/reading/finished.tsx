import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { BookCard, finishedBooks } from "@/components/book-card";
import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { RequireIdentity } from "@/components/require-identity";
import { SectionTitle } from "@/components/section-title";
import { SettlingSkeleton } from "@/components/settling-skeleton";
import { WindowVirtualGrid } from "@/components/window-virtual-grid";
import { useReading } from "@/hooks/data/use-reading";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/reading/finished")({
  component: FinishedRoute,
});

function FinishedRoute() {
  return (
    <RequireIdentity
      fallback={
        <SettlingSkeleton>
          <Navbar />
        </SettlingSkeleton>
      }
    >
      <FinishedPage />
    </RequireIdentity>
  );
}

function FinishedPage() {
  const reading = useReading();
  const isMobile = useIsMobile();
  const books = useMemo(() => finishedBooks(reading.books), [reading.books]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Finished" backHref="/reading" />
      <main className="w-full max-w-5xl mx-auto px-5 pt-6 pb-16 flex-1 flex flex-col gap-3">
        {reading.isError ? (
          <LoadError error={reading.error} onRetry={reading.refetch} />
        ) : (
          <>
            <SectionTitle title="Finished" count={books.length} />
            {books.length > 0 && (
              <WindowVirtualGrid
                items={books}
                columns={isMobile ? 1 : 2}
                estimateRowHeight={110}
                gap={16}
                getKey={(book) => book.id}
                rowClassName="grid grid-cols-1 md:grid-cols-2 gap-4"
                renderItem={(book) => <BookCard book={book} />}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
