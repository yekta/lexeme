/// <reference types="vite/client" />
import { ErrorBoundary } from "@/components/error-boundary";
import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { NowProvider } from "@/components/now-provider";
import { PageNotFound } from "@/components/page-not-found";
import { Toaster } from "@/components/ui/sonner";
import { CollectionsPreloader } from "@/db/collections-preloader";
import { DEFAULT_THEME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { TRPCReactProvider } from "@/trpc/react";
import globalsCss from "@/styles/globals.css?url";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lexeme" },
      {
        name: "description",
        content:
          "A flashcard app using spaced repetition algorithm with Firebase authentication.",
      },
    ],
    links: [{ rel: "stylesheet", href: globalsCss }],
  }),
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
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-5xl mx-auto px-5 flex flex-col items-center justify-center pb-[8vh]">
        <PageNotFound />
      </main>
    </div>
  ),
});

function RootComponent() {
  return (
    <RootDocument>
      <ErrorBoundary>
        <ThemeProvider
          attribute="class"
          defaultTheme={DEFAULT_THEME}
          enableSystem
        >
          <TRPCReactProvider>
            <CollectionsPreloader />
            <NowProvider>
              <Outlet />
            </NowProvider>
            <Toaster closeButton position="bottom-right" />
          </TRPCReactProvider>
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
