import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";

import { ErrorBoundary } from "@/components/error-boundary";
import { FormDraftProvider } from "@/components/form-draft-provider";
import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { NowProvider } from "@/components/now-provider";
import { PageNotFound } from "@/components/page-not-found";
import { SuggestionProvider } from "@/components/suggestion-provider";
import { Toaster } from "@/components/ui/sonner";
import { ZeroRoot } from "@/components/zero-root";
import { DEFAULT_THEME } from "@/lib/constants";
import { queryClient } from "@/lib/query-client";

/**
 * The app shell.
 *
 * It used to render `<html>`, `<head>` and `<Scripts>` itself, because TanStack
 * Start rendered the document on the server. The document is `index.html` now,
 * which is also where the title, the icons and the pre-paint theme script went,
 * so this is just the provider tree and an outlet.
 */
export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-5xl mx-auto px-5 flex flex-col items-center justify-center pb-[8vh]">
        <LoadError error={error} onRetry={reset} />
      </main>
    </div>
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
  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme={DEFAULT_THEME} enableSystem>
        <QueryClientProvider client={queryClient}>
          {/* Zero owns reads, writes and the local replica. It mounts only
              once this device has an identity; `RequireIdentity` is what
              keeps data screens from rendering before then. */}
          <ZeroRoot>
            <NowProvider>
              <FormDraftProvider>
                <SuggestionProvider>
                  <Outlet />
                </SuggestionProvider>
              </FormDraftProvider>
            </NowProvider>
          </ZeroRoot>
          <Toaster closeButton position="bottom-right" />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
