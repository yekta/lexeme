import { StudyPage } from "./study-page";

export const dynamic = "force-static";
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default function Page() {
  return <StudyPage />;
}
