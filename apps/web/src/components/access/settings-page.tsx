import { Navbar } from "@/components/navbar";

export function SettingsPage({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar backHref="/" title={title} />
      <main className="w-full max-w-3xl mx-auto px-5 pt-6 pb-16 flex-1 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <p className="text-muted-foreground text-balance">{description}</p>
          {action}
        </div>
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

/** A row in a list of credentials: what it is on the left, actions on the right. */
export function CredentialRow({
  title,
  badges,
  meta,
  action,
}: {
  title: string;
  badges: React.ReactNode;
  meta: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <p className="font-medium truncate min-w-0">{title}</p>
          {badges}
        </div>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      {action}
    </div>
  );
}
