"use client";

import { AddCardForm } from "@/components/add-card-form";
import { DeckNotFound } from "@/components/deck-not-found";
import { DeckSettingsMenu } from "@/components/deck-settings-menu";
import {
  EmptyList,
  EmptyListContent,
  EmptyListDescription,
  EmptyListFooter,
  EmptyListHeader,
  EmptyListIcon,
  EmptyListTitle,
} from "@/components/empty-list";
import CardsIcon from "@/components/icons/cards";
import { LCardManage } from "@/components/l-card-manage";
import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { NoAccess } from "@/components/no-access";
import OptimisticIndicator from "@/components/optimistic-indicator";
import { Button, LinkButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { isRowOptimistic } from "@/db/collections";
import { useCardsByDeck, type TCard } from "@/hooks/data/use-cards";
import { useDeck, type TDeck } from "@/hooks/data/use-decks";
import { useAsyncRouterPush } from "@/hooks/use-async-router-push";
import useRedirectToSignInIfNecessary from "@/hooks/use-redirect-to-sign-in-if-necessary";
import { dataStateOf, mergeStates, type DataState } from "@/lib/query-state";
import { ArrowLeft, Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

export function DeckPage() {
  const { isPending: isPendingAuth } = useRedirectToSignInIfNecessary();
  const { id } = useParams() as { id: string };

  const deckQuery = useDeck(id);
  const cardsQuery = useCardsByDeck(id);

  const state = mergeStates(dataStateOf(deckQuery), dataStateOf(cardsQuery));
  const isPlaceholder =
    isPendingAuth || state === "pending" || state === "unauthorized";

  const isOptimistic =
    (deckQuery.data ? isRowOptimistic(deckQuery.data) : false) ||
    cardsQuery.data.some(isRowOptimistic);

  return (
    <DeckPageView
      isPlaceholder={isPlaceholder}
      state={state}
      deck={deckQuery.data}
      cards={cardsQuery.data}
      deckId={id}
      isOptimistic={isOptimistic}
      error={deckQuery.error ?? cardsQuery.error}
      onRetry={() => {
        deckQuery.refetch();
        cardsQuery.refetch();
      }}
    />
  );
}

/** The deck page's loading state — the view in placeholder mode. */
export function DeckPageSkeleton() {
  return <DeckPageView isPlaceholder />;
}

/**
 * The deck page layout — the single source of the page's markup, shared by the
 * live page (`DeckPage`) and its skeleton (`DeckPageSkeleton`). `isPlaceholder`
 * threads through to swap real content for skeleton primitives.
 */
function DeckPageView({
  isPlaceholder = false,
  state = "pending",
  deck,
  cards = [],
  deckId = "",
  isOptimistic = false,
  error,
  onRetry = () => {},
}: {
  isPlaceholder?: boolean;
  state?: DataState;
  deck?: TDeck;
  cards?: TCard[];
  deckId?: string;
  isOptimistic?: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  const [asyncPush] = useAsyncRouterPush();
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);

  const deckName = deck?.name ?? "Loading...";

  return (
    <div
      data-placeholder={isPlaceholder ? "true" : undefined}
      className="min-h-screen group flex flex-col w-full"
    >
      <Navbar />
      <main className="w-full max-w-5xl mx-auto px-5 pt-4 pb-16 space-y-5 flex-1 flex flex-col">
        {state === "not-found" || state === "forbidden" || state === "error" ? (
          <div className="flex-1 w-full items-center justify-center flex flex-col pb-[8vh]">
            {state === "not-found" ? (
              <DeckNotFound />
            ) : state === "forbidden" ? (
              <NoAccess />
            ) : (
              <LoadError error={error} onRetry={onRetry} />
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <LinkButton
                  variant="ghost"
                  href="/"
                  className="shrink-0 -ml-2 size-9"
                >
                  <ArrowLeft className="size-5 shrink-0" />
                </LinkButton>
                <h1
                  data-placeholder={isPlaceholder ? "true" : undefined}
                  className="text-xl truncate items-center font-semibold data-placeholder:animate-pulse data-placeholder:bg-foreground/20 data-placeholder:rounded data-placeholder:text-transparent"
                >
                  {deckName}
                </h1>
                {!isPlaceholder && deck && (
                  <DeckSettingsMenu
                    deck={deck}
                    triggerClassName="shrink-0"
                    align="start"
                    onDeleted={() => asyncPush("/")}
                  />
                )}
                <OptimisticIndicator
                  isOptimistic={isOptimistic}
                  className="size-4"
                />
              </div>
              <LinkButton
                href={`/study/${deckId}`}
                isPlaceholder={isPlaceholder}
              >
                Study Deck
              </LinkButton>
            </div>

            <div className="w-full h-px bg-border rounded-full" />

            <div className="flex items-center justify-between gap-4">
              <h2 className="px-1 text-2xl font-bold tracking-tight truncate min-w-0 group-data-placeholder:text-transparent group-data-placeholder:bg-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                Cards{" "}
                <span className="font-normal text-muted-foreground group-data-placeholder:text-transparent">
                  ({isPlaceholder ? 5 : cards.length})
                </span>
              </h2>

              <Dialog open={isAddCardOpen} onOpenChange={setIsAddCardOpen}>
                <DialogTrigger
                  render={<Button isPlaceholder={isPlaceholder} />}
                >
                  <Plus className="size-5 -ml-1.5 shrink-0" />
                  <span className="shrink min-w-0 overflow-hidden overflow-ellipsis">
                    Add Card
                  </span>
                </DialogTrigger>
                <DialogContent>
                  <AddCardForm
                    key={String(isAddCardOpen)}
                    deckId={deckId}
                    onDone={() => setIsAddCardOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            </div>

            {isPlaceholder ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <LCardManage key={i} isPlaceholder />
                ))}
              </div>
            ) : cards.length === 0 ? (
              <EmptyList className="border border-dashed">
                <EmptyListHeader>
                  <EmptyListIcon>
                    <CardsIcon />
                  </EmptyListIcon>
                  <EmptyListContent>
                    <EmptyListTitle>No cards yet</EmptyListTitle>
                    <EmptyListDescription>
                      Add your first card to this deck.
                    </EmptyListDescription>
                  </EmptyListContent>
                </EmptyListHeader>
                <EmptyListFooter>
                  <Button onClick={() => setIsAddCardOpen(true)}>
                    Add Card
                  </Button>
                </EmptyListFooter>
              </EmptyList>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cards.map((card) => (
                  <LCardManage
                    key={card.id}
                    id={card.id}
                    deckId={deckId}
                    front={card.front}
                    back={card.back}
                    createdAt={card.created_at}
                    updatedAt={card.updated_at}
                    contentUpdatedAt={card.content_updated_at}
                    isOptimistic={isRowOptimistic(card)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
