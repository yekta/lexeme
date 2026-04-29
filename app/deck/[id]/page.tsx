"use client";

import { useAuth } from "@/components/auth-provider";
import {
  EmptyList,
  EmptyListContent,
  EmptyListDescription,
  EmptyListFooter,
  EmptyListHeader,
  EmptyListIcon,
  EmptyListTitle,
} from "@/components/empty-list";
import { AddCardForm } from "@/components/add-card-form";
import CardsIcon from "@/components/icons/cards";
import { NCardManage } from "@/components/n-card-manage";
import { Navbar } from "@/components/navbar";
import { Button, LinkButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCardsByDeck } from "@/hooks/data/use-cards";
import { useDeck } from "@/hooks/data/use-decks";
import { ArrowLeft, Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import { useEffect, useState } from "react";

export default function DeckPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user, loading } = useAuth();

  const [isAddCardOpen, setIsAddCardOpen] = useState(false);

  const { data: deckData, isPending: isPendingDecks } = useDeck(id);
  const { data: cards = [], isPending: isPendingCards } = useCardsByDeck(id);

  // Redirect home if the deck doesn't exist (or was deleted).
  useEffect(() => {
    if (!isPendingDecks && user && id && deckData === null) {
      router.push("/");
    }
  }, [isPendingDecks, deckData, user, id, router]);

  const deckName = deckData?.name ?? "Loading...";

  const isPending = isPendingDecks || isPendingCards;

  if (!loading && !user) return null;

  const showPlaceholder = loading || isPending;

  return (
    <div
      data-placeholder={showPlaceholder ? "true" : undefined}
      className="min-h-screen group"
    >
      <Navbar />
      <main className="max-w-5xl mx-auto px-5 pt-4 pb-16 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <LinkButton
              variant="ghost"
              href="/"
              className="shrink-0 -ml-2 size-9"
            >
              <ArrowLeft className="size-5" />
            </LinkButton>
            <h1
              data-placeholder={showPlaceholder ? "true" : undefined}
              className="text-xl font-semibold truncate min-w-0 data-placeholder:animate-pulse data-placeholder:bg-foreground/20 data-placeholder:rounded data-placeholder:text-transparent"
            >
              {deckName}
            </h1>
          </div>
          <LinkButton href={`/study/${id}`} isPlaceholder={showPlaceholder}>
            Study Deck
          </LinkButton>
        </div>

        <div className="w-full h-px bg-border rounded-full" />

        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight truncate min-w-0 group-data-placeholder:text-transparent group-data-placeholder:bg-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
            Cards{" "}
            <span className="font-normal text-muted-foreground group-data-placeholder:text-transparent">
              ({showPlaceholder ? 5 : cards.length})
            </span>
          </h2>

          <Dialog open={isAddCardOpen} onOpenChange={setIsAddCardOpen}>
            <DialogTrigger render={<Button isPlaceholder={showPlaceholder} />}>
              <Plus className="size-5 -ml-1.5" />
              <span className="shrink min-w-0 overflow-hidden overflow-ellipsis">
                Add Card
              </span>
            </DialogTrigger>
            <DialogContent>
              <AddCardForm
                key={String(isAddCardOpen)}
                deckId={id}
                onDone={() => setIsAddCardOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        {showPlaceholder ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <NCardManage key={i} isPlaceholder />
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
              <Button onClick={() => setIsAddCardOpen(true)}>Add Card</Button>
            </EmptyListFooter>
          </EmptyList>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cards.map((card) => (
              <NCardManage
                key={card.id}
                id={card.id}
                deckId={id}
                front={card.front}
                back={card.back}
                createdAt={card.created_at}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
