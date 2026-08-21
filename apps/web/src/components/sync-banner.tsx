import { useZero } from "@rocicorp/zero/react";
import { CloudOffIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { type TSyncStatus } from "@/lib/sync-status";
import { useSync } from "@/zero/account";

/**
 * What syncing is doing, when it is doing something worth mentioning.
 *
 * Nothing here is an error state. The archive is on the device, so being
 * offline costs nothing: decks open, cards are added, a study session runs start
 * to finish, and every write queues until the network comes back. The banner
 * exists so that is *visible*: without it the app works perfectly and gives no
 * account of itself, which reads as "did that save?".
 *
 * It is in the document flow rather than floating over the page, so it can
 * never cover a control. That makes its appearance a layout change, which is
 * exactly why `useSyncStatus` settles first: a two-hundred-millisecond blip
 * between reconnects never reaches this component, so a banner appearing is
 * always news.
 */
export function SyncBanner() {
  const sync = useSync();

  if (!sync || sync.name === "synced" || sync.name === "syncing") return null;
  return <Banner sync={sync} />;
}

function Banner({
  sync,
}: {
  sync: Extract<TSyncStatus, { name: "offline" | "unreachable" | "refused" | "expired" }>;
}) {
  const zero = useZero();
  const { signInWithGoogle } = useAuth();

  // The browser has a network and the sync service still will not answer. Say
  // that, rather than "you're offline": the user's connection is fine, and
  // sending them to check their wifi wastes their time on our outage.
  if (sync.name === "unreachable") {
    return (
      <BannerShell tone="warning">
        <TriangleAlertIcon className="size-4 shrink-0" />
        <span>Your decks are safe but this device can&apos;t load them currently.</span>
        <Button size="xs" variant="outline" onClick={() => void zero.connection.connect()}>
          Retry
        </Button>
      </BannerShell>
    );
  }

  // Offline is the ordinary case and the quiet one: it is not a problem, it is
  // a fact about the network, and the only thing worth saying is that nothing
  // is lost.
  if (sync.name === "offline") {
    return (
      <BannerShell tone="muted">
        <CloudOffIcon className="size-4 shrink-0" />
        <span>You&apos;re offline. Changes are saved locally and will sync when online.</span>
      </BannerShell>
    );
  }

  // The session is gone. The app stays open on the local store; signing in is
  // what resumes syncing, so offer it here rather than bouncing to a screen.
  if (sync.name === "expired") {
    return (
      <BannerShell tone="warning">
        <TriangleAlertIcon className="size-4 shrink-0" />
        <span>You&apos;re signed out. Sync is paused but your decks are safe on this device.</span>
        <Button size="xs" variant="outline" onClick={() => void signInWithGoogle()}>
          Sign in
        </Button>
      </BannerShell>
    );
  }

  // Signed in, and sync was still turned away. That is the server's problem to
  // fix, not the user's, so name what happened and offer a retry rather than a
  // pointless sign-in.
  return (
    <BannerShell tone="warning">
      <TriangleAlertIcon className="size-4 shrink-0" />
      <span>Sync was refused: {sync.detail}. Changes stay local until it&apos;s accepted.</span>
      <Button size="xs" variant="outline" onClick={() => void zero.connection.connect()}>
        Retry
      </Button>
    </BannerShell>
  );
}

function BannerShell({
  tone,
  children,
}: {
  tone: "muted" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "w-full border-b px-5 py-2 text-sm",
        "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center",
        // There is no --warning-foreground token, so the amber is the text
        // rather than the fill, over a tint of itself.
        tone === "muted"
          ? "bg-muted text-muted-foreground border-border"
          : "bg-warning/10 text-warning border-warning/30",
      )}
    >
      {children}
    </div>
  );
}
