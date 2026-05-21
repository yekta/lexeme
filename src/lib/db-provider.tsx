import { useEffect, useState } from "react";
import { initCollections } from "@/lib/collections";
import { startOfflineSync } from "@/lib/offline";

type Status = "loading" | "ready" | "error";

/**
 * Boots the local-first data layer in the browser: opens the OPFS SQLite
 * database, builds the Electric collections, and starts the offline write
 * queue. Children render only once the local store is ready, so every data
 * hook downstream can rely on the collections existing.
 */
export function DbProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    initCollections()
      .then(() => {
        startOfflineSync();
        if (!cancelled) setStatus("ready");
      })
      .catch((err) => {
        console.error("Failed to initialise the local database", err);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "error") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-lg font-semibold">Couldn&apos;t open local storage</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Lexeme stores your cards locally and needs OPFS / IndexedDB. Try
          reloading, or open the app in a different browser.
        </p>
      </div>
    );
  }

  // OPFS opens within a few milliseconds; render nothing to avoid a flash.
  if (status === "loading") return null;

  return <>{children}</>;
}
