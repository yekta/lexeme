import { ClientOnly } from "@/components/client-only";
import { DeckPage, DeckPageSkeleton } from "./deck-page";

export const dynamic = "force-static";
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default function Page() {
  return (
    <ClientOnly fallback={<DeckPageSkeleton />}>
      <DeckPage />
    </ClientOnly>
  );
}
