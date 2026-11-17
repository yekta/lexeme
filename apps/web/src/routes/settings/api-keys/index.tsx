import { DEFAULT_ACCESS_ROLE, type TAccessRole } from "@lexeme/shared";
import type { TApiKey } from "@lexeme/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, format, formatDistanceToNowStrict } from "date-fns";
import { KeyRoundIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { CopyField } from "@/components/access/copy-field";
import { RevokeButton } from "@/components/access/revoke-button";
import { RoleBadge, RolePicker } from "@/components/access/role-picker";
import {
  CredentialRow,
  CredentialRowPlaceholder,
  SettingsPage,
  SettingsSection,
} from "@/components/access/settings-page";
import {
  EmptyList,
  EmptyListContent,
  EmptyListDescription,
  EmptyListHeader,
  EmptyListIcon,
  EmptyListTitle,
} from "@/components/empty-list";
import { FormFieldWrapper, FormWrapper } from "@/components/form";
import { LoadError } from "@/components/load-error";
import PlusIcon from "@/components/icons/plus-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/data/use-api-keys";
import useRedirectToSignInIfNecessary from "@/hooks/use-redirect-to-sign-in-if-necessary";
import { publicApiOrigin } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/api-keys/")({
  component: ApiKeysPage,
});

const EXPIRY_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "Never", days: null },
] as const;

function ApiKeysPage() {
  useRedirectToSignInIfNecessary();
  const keysQuery = useApiKeys();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <SettingsPage
      title="API Keys"
      action={
        <Button className="shrink-0" onClick={() => setIsCreateOpen(true)}>
          <PlusIcon className="size-5 -ml-1.5 shrink-0" />
          <span>Create Key</span>
        </Button>
      }
    >
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <CreateApiKeyFlow onDone={() => setIsCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {keysQuery.isError ? (
        <LoadError error={keysQuery.error} onRetry={() => keysQuery.refetch()} />
      ) : (
        <ApiKeyList keys={keysQuery.data?.keys} isPending={keysQuery.isPending} />
      )}

      <UsageSection />
    </SettingsPage>
  );
}

function ApiKeyList({ keys, isPending }: { keys: TApiKey[] | undefined; isPending: boolean }) {
  const revoke = useRevokeApiKey();

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <CredentialRowPlaceholder
            key={i}
            badges={<ApiKeyBadges tokenPrefix="lx_xxxx" role="admin" />}
            meta="Never expires · Last used 5 minutes ago · Created Nov 17, 2026"
          />
        ))}
      </div>
    );
  }

  if (!keys || keys.length === 0) {
    return (
      <EmptyList className="border border-dashed">
        <EmptyListHeader>
          <EmptyListIcon>
            <KeyRoundIcon />
          </EmptyListIcon>
          <EmptyListContent>
            <EmptyListTitle className="text-lg">No API keys yet</EmptyListTitle>
            <EmptyListDescription className="text-sm">
              Create one to use Lexeme from a script or an MCP client.
            </EmptyListDescription>
          </EmptyListContent>
        </EmptyListHeader>
      </EmptyList>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {keys.map((key) => (
        <CredentialRow
          key={key.id}
          title={key.name}
          badges={<ApiKeyBadges tokenPrefix={key.token_prefix} role={key.role} />}
          meta={<ApiKeyMeta apiKey={key} />}
          action={
            <RevokeButton
              title="Revoke API key"
              description={`Anything using "${key.name}" stops working immediately. This can't be undone.`}
              onRevoke={() => revoke.mutateAsync(key.id)}
            />
          }
        />
      ))}
    </div>
  );
}

function ApiKeyBadges({ tokenPrefix, role }: { tokenPrefix: string; role: TAccessRole }) {
  return (
    <>
      <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono">{tokenPrefix}...</code>
      <RoleBadge role={role} />
    </>
  );
}

function ApiKeyMeta({ apiKey }: { apiKey: TApiKey }) {
  const now = Date.now();
  const expiresAt = apiKey.expires_at ? new Date(apiKey.expires_at) : null;
  const isExpired = !!expiresAt && expiresAt.getTime() <= now;

  const expiry = !expiresAt
    ? "Never expires"
    : isExpired
      ? "Expired"
      : `Expires in ${formatDistanceToNowStrict(expiresAt)}`;
  const lastUsed = apiKey.last_used_at
    ? `Last used ${formatDistanceToNowStrict(new Date(apiKey.last_used_at), { addSuffix: true })}`
    : "Never used";

  return (
    <>
      <span className={cn(isExpired && "text-destructive")}>{expiry}</span>
      {" · "}
      {lastUsed}
      {" · "}
      Created {format(new Date(apiKey.created_at), "MMM d, yyyy")}
    </>
  );
}

function CreateApiKeyFlow({ onDone }: { onDone: () => void }) {
  const create = useCreateApiKey();
  const [name, setName] = useState("");
  const [role, setRole] = useState<TAccessRole>(DEFAULT_ACCESS_ROLE);
  const [expiryDays, setExpiryDays] = useState<number | null>(null);

  if (create.data) {
    return <ApiKeyCreated name={create.data.key.name} token={create.data.token} onDone={onDone} />;
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      name: name.trim(),
      role,
      expires_at: expiryDays === null ? null : addDays(new Date(), expiryDays).toISOString(),
    });
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Create API Key</DialogTitle>
        <DialogDescription>The key is shown once, right after you create it.</DialogDescription>
      </DialogHeader>
      <FormWrapper>
        <FormFieldWrapper>
          <Label htmlFor="api-key-name">Name</Label>
          <FormInput
            id="api-key-name"
            placeholder="e.g. My App"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">Something that tells you where it&apos;s used.</p>
        </FormFieldWrapper>
        <FormFieldWrapper>
          <Label>Role</Label>
          <RolePicker value={role} onChange={setRole} />
        </FormFieldWrapper>
        <FormFieldWrapper>
          <Label>Expires</Label>
          <div className="-mx-1 w-[calc(100%+0.5rem)] flex flex-wrap gap-1.5">
            {EXPIRY_OPTIONS.map((option) => (
              <Button
                key={option.label}
                type="button"
                size="sm"
                variant={option.days === expiryDays ? "secondary" : "ghost"}
                className={cn(option.days === expiryDays && "ring-1 ring-foreground/30")}
                onClick={() => setExpiryDays(option.days)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </FormFieldWrapper>
        {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
      </FormWrapper>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()} isPending={create.isPending}>
          Create Key
        </Button>
      </DialogFooter>
    </form>
  );
}

function ApiKeyCreated({ name, token, onDone }: { name: string; token: string; onDone: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>API key created</DialogTitle>
        <DialogDescription>
          &quot;{name}&quot; is ready. Keep it somewhere safe.
        </DialogDescription>
      </DialogHeader>
      <CopyField value={token} layout="wrap" />
      <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
        <TriangleAlertIcon className="size-4 shrink-0" />
        Copy the key now. It won&apos;t be shown again.
      </div>
      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </>
  );
}

function UsageSection() {
  const origin = publicApiOrigin();
  return (
    <SettingsSection
      title="Using a key"
      description={
        <>
          Send it as a bearer token. Every endpoint is listed at{" "}
          <a className="underline underline-offset-3" href={`${origin}/api/v1`} target="_blank" rel="noreferrer">
            {origin}/api/v1
          </a>
          .
        </>
      }
    >
      <CopyField
        layout="snippet"
        value={`curl ${origin}/api/v1/decks \\\n  -H "Authorization: Bearer lx_your_key"`}
      />
    </SettingsSection>
  );
}
