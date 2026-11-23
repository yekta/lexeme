import { createFileRoute } from "@tanstack/react-router";
import { CircleCheckIcon, LoaderIcon, TabletIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import Logo from "@/components/icons/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApprovePairing, usePairing } from "@/hooks/data/use-pairing";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/pair/")({
  component: PairPage,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
});

/** Where a device's QR code leads: approve the device so it can add to this account. */
function PairPage() {
  const { code: codeFromLink } = Route.useSearch();
  const [code, setCode] = useState(codeFromLink);
  const { status, user, signInWithGoogle } = useAuth();
  const isSignedIn = status === "ok";

  let content: React.ReactNode;
  if (status === "checking") {
    content = <Pending />;
  } else if (!isSignedIn) {
    content = (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground">Sign in to Lexeme to connect your e-reader.</p>
        <Button
          className="w-full max-w-64"
          onClick={() => void signInWithGoogle(`${window.location.pathname}${window.location.search}`)}
        >
          Sign in with Google
        </Button>
      </div>
    );
  } else if (!code) {
    content = <CodeForm onSubmit={setCode} />;
  } else {
    content = <Approve code={code} email={user?.email} onWrongCode={() => setCode(undefined)} />;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-lg shadow-shadow/shadow-muted">
        <Logo className="size-10 mx-auto" />
        {content}
      </div>
    </main>
  );
}

function CodeForm({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="text-xl font-semibold">Connect an e-reader</h1>
        <p className="text-sm text-muted-foreground text-balance">
          Enter the code shown on your Kindle under Settings → Integrations → Lexeme.
        </p>
      </div>
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="ABCD-2345"
        autoCapitalize="characters"
        autoComplete="off"
        className="text-center font-mono text-lg tracking-widest"
      />
      <Button type="submit" disabled={!value.trim()}>
        Continue
      </Button>
    </form>
  );
}

function Approve({ code, email, onWrongCode }: { code: string; email?: string; onWrongCode: () => void }) {
  const pairing = usePairing(code, true);
  const approve = useApprovePairing(code);

  if (pairing.isError) {
    return (
      <Message icon={<TriangleAlertIcon className="size-6 text-destructive" />} title="Can't find that device">
        <p>{pairing.error.message}</p>
        <Button variant="outline" className="mt-2" onClick={onWrongCode}>
          Enter the code again
        </Button>
      </Message>
    );
  }
  if (!pairing.data) return <Pending />;
  if (pairing.data.status === "approved") {
    return (
      <Message icon={<CircleCheckIcon className="size-6 text-primary" />} title={`${pairing.data.device_name} is connected`}>
        <p>Words you add and what you read will show up in Lexeme. You can go back to your Kindle.</p>
      </Message>
    );
  }
  if (pairing.data.status === "expired") {
    return (
      <Message icon={<TriangleAlertIcon className="size-6 text-destructive" />} title="This code has expired">
        <p>Start connecting again on your Kindle to get a new one.</p>
      </Message>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center">
          <TabletIcon className="size-6" />
        </div>
        <h1 className="text-xl font-semibold text-balance">Connect {pairing.data.device_name}?</h1>
        {email && <p className="text-sm text-muted-foreground">Signed in as {email}</p>}
      </div>
      <div className="rounded-lg bg-muted px-4 py-3 text-center font-mono text-lg tracking-widest">{code}</div>
      <p className="text-xs text-muted-foreground text-center text-balance">
        Check that this is the code on your Kindle. It will be able to add cards and send what you read. You can
        disconnect it any time under API Keys.
      </p>
      {approve.error && <p className="text-sm text-destructive">{approve.error.message}</p>}
      <Button isPending={approve.isPending} onClick={() => approve.mutate()}>
        Connect
      </Button>
    </div>
  );
}

function Message({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {icon}
      <p className="font-medium">{title}</p>
      <div className="text-sm text-muted-foreground flex flex-col items-center gap-1">{children}</div>
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
