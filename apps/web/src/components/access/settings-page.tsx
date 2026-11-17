import { Trash2Icon } from "lucide-react";

import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SettingsPage({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar backHref="/" title={title} />
      <main className="w-full max-w-3xl mx-auto px-5 pt-6 pb-16 flex-1 flex flex-col gap-6">
        {action && <div className="flex -mb-3">{action}</div>}
        {children}
      </main>
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const PLACEHOLDER_SKELETON =
  "group-data-placeholder/row:text-transparent group-data-placeholder/row:animate-pulse group-data-placeholder/row:rounded group-data-placeholder/row:select-none";

/** A row in a list of credentials: what it is on the left, actions on the right. */
export function CredentialRow({
  title,
  badges,
  meta,
  action,
  isPlaceholder,
}: {
  title: string;
  badges: React.ReactNode;
  meta: React.ReactNode;
  action: React.ReactNode;
  isPlaceholder?: boolean;
}) {
  return (
    <div
      data-placeholder={isPlaceholder || undefined}
      className="group/row flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <p
            className={cn(
              "font-medium truncate min-w-0 group-data-placeholder/row:bg-foreground/20",
              PLACEHOLDER_SKELETON,
            )}
          >
            {title}
          </p>
          <div
            className={cn(
              "contents",
              "*:group-data-placeholder/row:text-transparent *:group-data-placeholder/row:animate-pulse *:group-data-placeholder/row:select-none",
            )}
          >
            {badges}
          </div>
        </div>
        <p
          className={cn(
            "self-start text-xs text-muted-foreground group-data-placeholder/row:bg-muted-foreground/20",
            PLACEHOLDER_SKELETON,
          )}
        >
          {meta}
        </p>
      </div>
      {action}
    </div>
  );
}

/** Stands in for a CredentialRow while it loads, with sample content of the same shape. */
export function CredentialRowPlaceholder({
  badges,
  meta,
}: {
  badges: React.ReactNode;
  meta: string;
}) {
  return (
    <CredentialRow
      isPlaceholder
      title="Placeholder"
      badges={badges}
      meta={meta}
      action={
        <Button variant="ghost-destructive" size="icon" isPlaceholder aria-hidden className="shrink-0 rounded-[calc(var(--radius-lg)-3px)]">
          <Trash2Icon className="size-4.5" />
        </Button>
      }
    />
  );
}
