import { DeckPage } from "./deck-page";

export const dynamic = "force-static";
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default function Page() {
  return <DeckPage />;
}
