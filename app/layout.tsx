import { AuthProvider } from "@/components/auth-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { NowProvider } from "@/components/now-provider";
import { Providers } from "@/components/query-provider";
import { DEFAULT_THEME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { DM_Sans } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";
import BgPattern from "@/components/bg-pattern";

const fontMain = DM_Sans({
  variable: "--font-sans",
  weight: "variable",
});

export const metadata: Metadata = {
  title: "Lexeme",
  description:
    "A flashcard app using spaced repetition algorithm with Firebase authentication.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(
        "font-sans bg-background text-foreground",
        fontMain.variable,
      )}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning className="relative">
        <BgPattern />
        <NextTopLoader
          shadow={false}
          color="var(--primary)"
          showSpinner={false}
        />
        <ErrorBoundary>
          <ThemeProvider
            attribute="class"
            defaultTheme={DEFAULT_THEME}
            enableSystem
          >
            <AuthProvider>
              <Providers>
                <NowProvider>{children}</NowProvider>
              </Providers>
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
