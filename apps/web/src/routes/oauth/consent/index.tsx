import { oauthAuthorizeParams, type TOAuthAuthorizeParams } from "@lexeme/contracts";
import { DEFAULT_ACCESS_ROLE, type TAccessRole } from "@lexeme/shared";
import { createFileRoute } from "@tanstack/react-router";
import { LoaderIcon, TriangleAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { RolePicker } from "@/components/access/role-picker";
import Logo from "@/components/icons/logo";
import { Button } from "@/components/ui/button";
import { useOAuthConsent, useOAuthDecision } from "@/hooks/data/use-connected-apps";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/oauth/consent/")({
  component: ConsentPage,
});

/** Read raw: the router's search parsing would turn a numeric `state` into a number. */
function useAuthorizeParams(): TOAuthAuthorizeParams | undefined {
  return useMemo(() => {
    const raw = Object.fromEntries(new URLSearchParams(window.location.search));
    const parsed = oauthAuthorizeParams.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  }, []);
}

function ConsentPage() {
  const params = useAuthorizeParams();
  const { status, user, signInWithGoogle } = useAuth();
  const isSignedIn = status === "ok";
  const consent = useOAuthConsent(params, isSignedIn);

  let content: React.ReactNode;
  if (!params) {
    content = <ConsentError message="This sign-in link is incomplete. Start again from the app." />;
  } else if (status === "checking") {
    content = <Pending />;
  } else if (!isSignedIn) {
    content = (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground">Sign in to Lexeme to connect this app.</p>
        <Button
          className="w-full max-w-64"
          onClick={() => void signInWithGoogle(`${window.location.pathname}${window.location.search}`)}
        >
          Sign in with Google
        </Button>
      </div>
    );
  } else if (consent.isError) {
    content = <ConsentError message={consent.error.message} />;
  } else if (!consent.data) {
    content = <Pending />;
  } else {
    content = (
      <ConsentForm
        params={params}
        clientName={consent.data.client_name}
        redirectHost={consent.data.redirect_host}
        email={user?.email}
      />
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md flex flex-col gap-6 rounded-xl border bg-card p-6">
        <Logo className="size-10 mx-auto" />
        {content}
      </div>
    </main>
  );
}

function ConsentForm({
  params,
  clientName,
  redirectHost,
  email,
}: {
  params: TOAuthAuthorizeParams;
  clientName: string;
  redirectHost: string;
  email: string | undefined;
}) {
  const [role, setRole] = useState<TAccessRole>(DEFAULT_ACCESS_ROLE);
  const decision = useOAuthDecision();
  const pendingChoice = decision.isPending || decision.isSuccess ? decision.variables?.approve : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="text-xl font-semibold text-balance">
          {clientName} wants to access your Lexeme account
        </h1>
        {email && <p className="text-sm text-muted-foreground">Signed in as {email}</p>}
      </div>
      <div className="flex flex-col gap-2.5">
        <p className="text-sm font-medium">What it can do</p>
        <RolePicker value={role} onChange={setRole} />
      </div>
      <p className="text-xs text-muted-foreground text-center text-balance">
        You&apos;ll be sent back to <span className="text-foreground">{redirectHost}</span>. Only
        approve if you started this yourself. You can disconnect it any time under Connected Apps.
      </p>
      {decision.error && <p className="text-sm text-destructive">{decision.error.message}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          disabled={pendingChoice !== undefined}
          isPending={pendingChoice === false}
          onClick={() => decision.mutate({ approve: false, params })}
        >
          Deny
        </Button>
        <Button
          disabled={pendingChoice !== undefined}
          isPending={pendingChoice === true}
          onClick={() => decision.mutate({ approve: true, params, role })}
        >
          Approve
        </Button>
      </div>
    </div>
  );
}

function Pending() {
  return (
    <div className="flex justify-center py-6">
      <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ConsentError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <TriangleAlertIcon className="size-6 text-destructive" />
      <p className="font-medium">Can&apos;t connect this app</p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
