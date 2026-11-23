import type { ReactNode } from "react";

import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { RequireIdentity } from "@/components/require-identity";
import { SectionTitle } from "@/components/section-title";
import { SettlingSkeleton } from "@/components/settling-skeleton";
import { cn } from "@/lib/utils";

/** A full list behind a "See all" on the reading screens. */
export function ReadingListPage({
  navTitle,
  title,
  count,
  backHref,
  narrow,
  isError,
  error,
  onRetry,
  children,
}: {
  navTitle: string;
  title: string;
  count: number;
  backHref: string;
  /** As wide as the book page these lists belong to. */
  narrow?: boolean;
  isError: boolean;
  error: Error | undefined;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={navTitle} backHref={backHref} />
      <main className={cn("w-full mx-auto px-5 pt-6 pb-16 flex-1 flex flex-col gap-3", narrow ? "max-w-3xl" : "max-w-5xl")}>
        {isError ? (
          <LoadError error={error} onRetry={onRetry} />
        ) : (
          <>
            <SectionTitle title={title} count={count} />
            {count > 0 && children}
          </>
        )}
      </main>
    </div>
  );
}

export function ReadingRoute({ children }: { children: ReactNode }) {
  return (
    <RequireIdentity
      fallback={
        <SettlingSkeleton>
          <Navbar />
        </SettlingSkeleton>
      }
    >
      {children}
    </RequireIdentity>
  );
}
