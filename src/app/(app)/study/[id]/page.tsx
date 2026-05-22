import { ClientOnly } from "@/components/client-only";
import { StudyPage, StudyPageSkeleton } from "./study-page";

export const dynamic = "force-static";
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default function Page() {
  return (
    <ClientOnly fallback={<StudyPageSkeleton />}>
      <StudyPage />
    </ClientOnly>
  );
}
