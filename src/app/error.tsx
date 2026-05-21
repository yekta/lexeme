"use client";

import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-5xl mx-auto px-5 flex flex-col items-center justify-center pb-[10%]">
        <LoadError error={error} onRetry={reset} />
      </main>
    </div>
  );
}
