import { useMemo } from "react";
import { createCardAction } from "@/lib/actions";
import { getCollections } from "@/lib/collections";
import { buildCardContent, buildNewCard } from "@/lib/fsrs";
import { getCurrentUserId } from "@/lib/session-store";
import { asMutation } from "./_mutation";
import { useAllCardContents, useAllCards } from "./_collections";

/** A card joined with its content, as the manage view consumes it. */
export type TCard = {
  id: string;
  content_id: string;
  front: string;
  back: string;
  created_at: string;
  updated_at: string;
  content_updated_at: string;
};

export function useCardsByDeck(deckId: string | undefined) {
  const { rows: cards, isLoading: l1 } = useAllCards();
  const { rows: contents, isLoading: l2 } = useAllCardContents();

  const data = useMemo<TCard[]>(() => {
    if (!deckId) return [];
    const contentByCard = new Map(contents.map((c) => [c.card_id, c]));
    return cards
      .filter((c) => c.deck_id === deckId)
      .map((c): TCard | null => {
        const content = contentByCard.get(c.id);
        if (!content) return null;
        return {
          id: c.id,
          content_id: content.id,
          front: content.front,
          back: content.back,
          created_at: c.created_at,
          updated_at: c.updated_at,
          content_updated_at: content.updated_at,
        };
      })
      .filter((c): c is TCard => c !== null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [cards, contents, deckId]);

  return { data, isPending: l1 || l2 };
}

export function useCreateCard() {
  return asMutation<{ deckId: string; front: string; back: string }, void>(
    (input) => {
      const userId = getCurrentUserId();
      const card = buildNewCard({ deckId: input.deckId, userId });
      const content = buildCardContent({
        cardId: card.id,
        userId,
        front: input.front,
        back: input.back,
      });
      createCardAction({ card, content });
    },
  );
}

export function useUpdateCard() {
  return asMutation<
    { contentId: string; front: string; back: string },
    void
  >((input) => {
    getCollections().cardContents.update(input.contentId, (draft) => {
      draft.front = input.front;
      draft.back = input.back;
      draft.updated_at = new Date().toISOString();
    });
  });
}

export function useDeleteCard() {
  return asMutation<{ id: string }, void>((input) => {
    getCollections().cards.delete(input.id);
  });
}
