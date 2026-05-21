import {
  HeadContent,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { ErrorBoundary } from "@/components/error-boundary";
import { NowProvider } from "@/components/now-provider";
import { DEFAULT_THEME } from "@/lib/constants";
import { DbProvider } from "@/lib/db-provider";
import { cn } from "@/lib/utils";
import appCss from "@/styles.css?url";
import "@fontsource-variable/dm-sans";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lexeme" },
      {
        name: "description",
        content:
          "A local-first flashcard app using the FSRS spaced-repetition algorithm.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans bg-background text-foreground")}
    >
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning className="relative">
        <ErrorBoundary>
          <ThemeProvider
            attribute="class"
            defaultTheme={DEFAULT_THEME}
            enableSystem
          >
            <NowProvider>
              <DbProvider>{children}</DbProvider>
            </NowProvider>
          </ThemeProvider>
        </ErrorBoundary>
        <Scripts />
      </body>
    </html>
  );
}
