import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { RequireIdentity } from "@/components/require-identity";
import { SectionTitle } from "@/components/section-title";
import { SettlingSkeleton } from "@/components/settling-skeleton";
import { WindowVirtualGrid } from "@/components/window-virtual-grid";
import { WordRow } from "@/components/word-row";
import { useReading } from "@/hooks/data/use-reading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reading/words")({
  component: WordsRoute,
});

function WordsRoute() {
  return (
    <RequireIdentity
      fallback={
        <SettlingSkeleton>
          <Navbar />
        </SettlingSkeleton>
      }
    >
      <WordsPage />
    </RequireIdentity>
  );
}

function WordsPage() {
  const reading = useReading();
  const words = useMemo(
    () => [...reading.lookups].sort((a, b) => b.looked_up_at - a.looked_up_at),
    [reading.lookups],
  );
  const titles = useMemo(() => new Map(reading.books.map((book) => [book.id, book.title])), [reading.books]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Words" backHref="/reading" />
      <main className="w-full max-w-5xl mx-auto px-5 pt-6 pb-16 flex-1 flex flex-col gap-3">
        {reading.isError ? (
          <LoadError error={reading.error} onRetry={reading.refetch} />
        ) : (
          <>
            <SectionTitle title="Words" count={words.length} />
            {words.length > 0 && (
              <WindowVirtualGrid
                items={words}
                columns={1}
                estimateRowHeight={110}
                gap={0}
                getKey={(lookup) => lookup.id}
                className="rounded-xl border overflow-hidden"
                renderItem={(lookup, index) => (
                  <div className={cn(index > 0 && "border-t")}>
                    <WordRow lookup={lookup} bookTitle={lookup.book_id ? titles.get(lookup.book_id) : undefined} />
                  </div>
                )}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
