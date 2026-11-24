import type { ReactNode } from "react";

import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { Page } from "@/components/page";
import { RequireIdentity } from "@/components/require-identity";
import { SectionTitle } from "@/components/section-title";
import { SettlingSkeleton } from "@/components/settling-skeleton";

/** A full list behind a "See all" on the reading screens. */
export function ReadingListPage({
  navTitle,
  title,
  count,
  backHref,
  isError,
  error,
  onRetry,
  children,
}: {
  navTitle: string;
  title: string;
  count: number;
  backHref: string;
  isError: boolean;
  error: Error | undefined;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <Page title={navTitle} backHref={backHref} className="gap-3">
      {isError ? (
        <LoadError error={error} onRetry={onRetry} />
      ) : (
        <>
          <SectionTitle title={title} count={count} />
          {count > 0 && children}
        </>
      )}
    </Page>
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
