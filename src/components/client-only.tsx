"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};

/**
 * Renders `children` only after hydration, showing `fallback` during SSR and
 * the first client render. The data layer (TanStack DB live queries) uses
 * `useSyncExternalStore` with no server snapshot, so any component that calls
 * it must mount *after* hydration — it can't be server-rendered or hydrated.
 * `fallback` should be the page's loading skeleton so there is never a blank
 * screen.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return <>{hydrated ? children : fallback}</>;
}
