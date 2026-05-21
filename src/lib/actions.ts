import { createOptimisticAction } from "@tanstack/react-db";
import { getCollections } from "@/lib/collections";
import type { TCardContentRow, TCardRow, TReviewLogRow } from "@/lib/db-types";
import { createCardFn, rateCardFn } from "@/server/functions/cards";

/**
 * Compound, multi-collection writes.
 *
 * Each action applies optimistic state across several collections at once
 * (`onMutate`) and then persists them in a single server transaction
 * (`mutationFn`). The handler awaits the returned `txid` on every affected
 * collection so optimistic state is only dropped once the change has synced
 * back through Electric.
 */

/** Create a card: insert the card row and its content row atomically. */
export const createCardAction = createOptimisticAction<{
  card: TCardRow;
  content: TCardContentRow;
}>({
  onMutate: ({ card, content }) => {
    const { cards, cardContents } = getCollections();
    cards.insert(card);
    cardContents.insert(content);
  },
  mutationFn: async ({ card, content }) => {
    const { cards, cardContents } = getCollections();
    const { txid } = await createCardFn({ data: { card, content } });
    await cards.utils.awaitTxId(txid);
    await cardContents.utils.awaitTxId(txid);
  },
});

/** Rate a card: update its FSRS state and append a review log atomically. */
export const rateCardAction = createOptimisticAction<{
  card: TCardRow;
  log: TReviewLogRow;
}>({
  onMutate: ({ card, log }) => {
    const { cards, reviewLogs } = getCollections();
    cards.update(card.id, (draft) => {
      Object.assign(draft, card);
    });
    reviewLogs.insert(log);
  },
  mutationFn: async ({ card, log }) => {
    const { cards, reviewLogs } = getCollections();
    const { txid } = await rateCardFn({ data: { card, log } });
    await cards.utils.awaitTxId(txid);
    await reviewLogs.utils.awaitTxId(txid);
  },
});
