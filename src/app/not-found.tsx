import { Navbar } from "@/components/navbar";
import { PageNotFound } from "@/components/page-not-found";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-5xl mx-auto px-5 flex flex-col items-center justify-center pb-[8vh]">
        <PageNotFound />
      </main>
    </div>
  );
}
