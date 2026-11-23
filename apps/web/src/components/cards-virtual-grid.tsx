import { LCardManage } from "@/components/l-card-manage";
import { WindowVirtualGrid } from "@/components/window-virtual-grid";
import { usePendingIds } from "@/zero/mutate";
import { type TCard } from "@/hooks/data/use-cards";
import { useIsMobile } from "@/hooks/use-mobile";

export function CardsVirtualGrid({
  cards,
  deckId,
}: {
  cards: TCard[];
  deckId: string;
}) {
  const isMobile = useIsMobile();
  // Read once for the whole grid and test membership per card, rather than
  // subscribing from every tile.
  const pending = usePendingIds();

  return (
    <WindowVirtualGrid
      items={cards}
      columns={isMobile ? 1 : 2}
      estimateRowHeight={180}
      gap={16}
      getKey={(card) => card.id}
      rowClassName="grid grid-cols-1 md:grid-cols-2 gap-4"
      renderItem={(card) => (
        <LCardManage
          id={card.id}
          deckId={deckId}
          front={card.front}
          back={card.back}
          createdAt={card.created_at}
          updatedAt={card.updated_at}
          isOptimistic={pending.has(card.id)}
        />
      )}
    />
  );
}
