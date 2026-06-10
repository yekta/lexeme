/// <reference types="vite/client" />
import { ErrorBoundary } from "@/components/error-boundary";
import { LoadError } from "@/components/load-error";
import { FormDraftProvider } from "@/components/form-draft-provider";
import { Navbar } from "@/components/navbar";
import { NowProvider } from "@/components/now-provider";
import { PageNotFound } from "@/components/page-not-found";
import { Toaster } from "@/components/ui/sonner";
import { authClient } from "@/lib/auth-client";
import { getToken } from "@/lib/auth-server";
import { DEFAULT_THEME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { RouterContext } from "@/router";
import globalsCss from "@/styles/globals.css?url";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { createServerFn } from "@tanstack/react-start";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouteContext,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

const fetchToken = createServerFn({ method: "GET" }).handler(() => getToken());

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lexeme" },
      {
        name: "description",
        content: "Master any subject with spaced repetition.",
      },
    ],
    links: [{ rel: "stylesheet", href: globalsCss }],
  }),
  // Authenticate SSR Convex queries with the current session token.
  beforeLoad: async ({ context }) => {
    const token = await fetchToken();
    if (token) {
      context.convexQueryClient.serverHttpClient?.setAuth(token);
    }
    return { token };
  },
  component: RootComponent,
  errorComponent: ({ error, reset }) => (
    <RootDocument>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 w-full max-w-5xl mx-auto px-5 flex flex-col items-center justify-center pb-[8vh]">
          <LoadError error={error} onRetry={reset} />
        </main>
      </div>
    </RootDocument>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col wrap-anywhere">
      <Navbar />
      <main className="flex-1 w-full max-w-5xl mx-auto px-5 flex flex-col items-center justify-center pb-[8vh]">
        <PageNotFound />
      </main>
    </div>
  ),
});

function RootComponent() {
  const { convexQueryClient, token } = useRouteContext({ from: Route.id });
  return (
    <RootDocument>
      <ErrorBoundary>
        <ThemeProvider
          attribute="class"
          defaultTheme={DEFAULT_THEME}
          enableSystem
        >
          <ConvexBetterAuthProvider
            client={convexQueryClient.convexClient}
            authClient={authClient}
            initialToken={token}
          >
            <NowProvider>
              <FormDraftProvider>
                <Outlet />
              </FormDraftProvider>
            </NowProvider>
            <Toaster closeButton position="bottom-right" />
          </ConvexBetterAuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        suppressHydrationWarning
        className={cn("font-sans bg-background text-foreground relative")}
      >
        {children}
        <Scripts />
      </body>
    </html>
  );
}
