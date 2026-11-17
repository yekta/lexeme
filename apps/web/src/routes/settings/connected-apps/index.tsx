import type { TConnectedApp } from "@lexeme/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict } from "date-fns";
import { BlocksIcon } from "lucide-react";

import { CopyField } from "@/components/access/copy-field";
import { RevokeButton } from "@/components/access/revoke-button";
import { RoleBadge } from "@/components/access/role-picker";
import {
  CredentialRow,
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
import { LoadError } from "@/components/load-error";
import { useConnectedApps, useRevokeConnectedApp } from "@/hooks/data/use-connected-apps";
import useRedirectToSignInIfNecessary from "@/hooks/use-redirect-to-sign-in-if-necessary";
import { publicApiOrigin } from "@/lib/api";

export const Route = createFileRoute("/settings/connected-apps/")({
  component: ConnectedAppsPage,
});

function ConnectedAppsPage() {
  useRedirectToSignInIfNecessary();
  const appsQuery = useConnectedApps();
  const mcpUrl = `${publicApiOrigin()}/mcp`;

  return (
    <SettingsPage
      title="Connected Apps"
      description="Apps you've signed in to with your Lexeme account, such as MCP clients."
    >
      <SettingsSection
        title="MCP server"
        description="Add this URL to an MCP client. You'll sign in to Lexeme and choose what the app can do."
      >
        <CopyField value={mcpUrl} />
        <ul className="text-sm text-muted-foreground list-disc pl-5 flex flex-col gap-1">
          <li>
            <span className="text-foreground">Claude:</span> Settings, Connectors, Add custom
            connector.
          </li>
          <li>
            <span className="text-foreground">ChatGPT:</span> Settings, Apps &amp; Connectors, with
            developer mode on.
          </li>
          <li>
            <span className="text-foreground">Claude Code:</span> run the command below, then{" "}
            <code className="font-mono text-xs">/mcp</code> to sign in.
          </li>
        </ul>
        <CopyField layout="snippet" value={`claude mcp add --transport http lexeme ${mcpUrl}`} />
      </SettingsSection>

      <SettingsSection title="Your apps">
        {appsQuery.isError ? (
          <LoadError error={appsQuery.error} onRetry={() => appsQuery.refetch()} />
        ) : (
          <ConnectedAppList apps={appsQuery.data?.apps} isPending={appsQuery.isPending} />
        )}
      </SettingsSection>
    </SettingsPage>
  );
}

function ConnectedAppList({
  apps,
  isPending,
}: {
  apps: TConnectedApp[] | undefined;
  isPending: boolean;
}) {
  const revoke = useRevokeConnectedApp();

  if (isPending) {
    return <div className="h-16 rounded-xl border bg-card animate-pulse" />;
  }

  if (!apps || apps.length === 0) {
    return (
      <EmptyList className="border border-dashed">
        <EmptyListHeader>
          <EmptyListIcon>
            <BlocksIcon />
          </EmptyListIcon>
          <EmptyListContent>
            <EmptyListTitle className="text-lg">No connected apps yet</EmptyListTitle>
            <EmptyListDescription className="text-sm">
              Apps show up here once you approve them.
            </EmptyListDescription>
          </EmptyListContent>
        </EmptyListHeader>
      </EmptyList>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {apps.map((app) => (
        <CredentialRow
          key={app.id}
          title={app.client_name}
          badges={<RoleBadge role={app.role} />}
          meta={
            <>
              {app.last_used_at
                ? `Last used ${formatDistanceToNowStrict(new Date(app.last_used_at), { addSuffix: true })}`
                : "Never used"}
              {" · "}
              Connected {format(new Date(app.created_at), "MMM d, yyyy")}
            </>
          }
          action={
            <RevokeButton
              title="Disconnect app"
              description={`${app.client_name} loses access to your account immediately. You can connect it again later.`}
              onRevoke={() => revoke.mutateAsync(app.id)}
            />
          }
        />
      ))}
    </div>
  );
}
