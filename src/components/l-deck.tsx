"use client";

import { AddCardForm } from "@/components/add-card-form";
import { DeckSettingsMenu } from "@/components/deck-settings-menu";
import NewIndicator from "@/components/new-indicator";
import { useNow } from "@/components/now-provider";
import { Button, LinkButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { type TDeck } from "@/hooks/data/use-decks";
import { motion } from "motion/react";
import { useState } from "react";

export type TDeckStats = {
  total: number;
  new: number;
  learn: number;
  due: number;
  latestCardCreatedAt: number;
};

type TLDeckProps =
  | { isPlaceholder: true }
  | {
      isPlaceholder?: never;
      deck: TDeck;
      totalCards: number;
      newCount: number;
      learningCount: number;
      dueCount: number;
      stats: TDeckStats;
      studyHref: string;
      manageHref: string;
    };

export function LDeck(props: TLDeckProps) {
  const { isPlaceholder } = props;

  const name = isPlaceholder ? "Deck Name" : props.deck.name;
  const description = isPlaceholder
    ? "A short description"
    : props.deck.description;
  const totalCards = isPlaceholder ? 0 : props.totalCards;
  const newCount = isPlaceholder ? 0 : props.newCount;
  const learningCount = isPlaceholder ? 0 : props.learningCount;
  const dueCount = isPlaceholder ? 0 : props.dueCount;

  const now = useNow();
  const isNew =
    !isPlaceholder &&
    now - new Date(props.deck.created_at).getTime() < 4000 &&
    now - new Date(props.deck.created_at).getTime() >= 500;

  const isRecentlyUpdated = isPlaceholder
    ? false
    : props.stats.latestCardCreatedAt > 0 &&
      now - props.stats.latestCardCreatedAt <= 4_000;

  const [addCardOpen, setAddCardOpen] = useState(false);

  return (
    <div
      className="group relative"
      data-placeholder={isPlaceholder || undefined}
    >
      {/* Ghost card 2 — bottom of stack */}
      {(isPlaceholder || totalCards > 2) && (
        <div className="shadow-md shadow-shadow/shadow absolute -top-2.5 -left-0.5 w-full h-full rounded-xl border border-border bg-card -rotate-[1deg] origin-bottom-left transition-colors" />
      )}
      {/* Ghost card 1 */}
      {(isPlaceholder || totalCards > 1) && (
        <div className="shadow-md shadow-shadow/shadow absolute -top-1 left-2.5 w-full h-full rounded-xl border border-border bg-card -rotate-[1deg] origin-bottom-left transition-colors" />
      )}
      {/* Main card */}
      <motion.div className="relative z-10">
        <Card className="flex flex-col shadow-md shadow-shadow/shadow relative isolate transition-colors">
          {!isPlaceholder && (
            <DeckSettingsMenu
              deck={props.deck}
              triggerClassName="absolute right-1 top-1 z-20"
            />
          )}
          <CardHeader className="flex flex-row items-start justify-between gap-4 relative z-10">
            <div className="w-full flex flex-col items-start gap-1">
              <CardTitle className="truncate pr-5 group-data-placeholder:text-transparent group-data-placeholder:bg-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                {name}
              </CardTitle>
              <CardDescription className="truncate group-data-placeholder:text-transparent group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                {/* Description or non-breaking space */}
                {description || "\u00A0"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <NewIndicator
              isNew={isNew || isRecentlyUpdated}
              className="rounded-tl-[calc(var(--radius)*1.4-1px)]"
              classNameInner="rounded-tl-[calc(var(--radius)*1.4-2px)]"
            />
            <div className="flex flex-col items-start gap-3 mt-2 relative">
              <div
                data-recently-updated={isRecentlyUpdated ? "true" : undefined}
                className="text-sm max-w-full text-muted-foreground bg-transparent flex justify-start transition-colors duration-300 rounded px-2 py-0.5 -ml-2 data-recently-updated:bg-success/15 data-recently-updated:text-success"
              >
                <p className="max-w-full min-w-0 group-data-placeholder:text-transparent group-data-placeholder:rounded group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:select-none">
                  {totalCards} {totalCards === 1 ? "card" : "cards"}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-state-new group-data-placeholder:text-transparent group-data-placeholder:bg-state-new/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                  <span className="w-2 h-2 rounded-full bg-state-new group-data-placeholder:opacity-0" />
                  {newCount} New
                </div>
                <div className="flex items-center gap-1.5 text-state-learn group-data-placeholder:text-transparent group-data-placeholder:bg-state-learn/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                  <span className="w-2 h-2 rounded-full bg-state-learn group-data-placeholder:opacity-0" />
                  {learningCount} Learn
                </div>
                <div className="flex items-center gap-1.5 text-state-due group-data-placeholder:text-transparent group-data-placeholder:bg-state-due/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                  <span className="w-2 h-2 rounded-full bg-state-due group-data-placeholder:opacity-0" />
                  {dueCount} Due
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col w-full gap-1.5 relative">
            <LinkButton
              href={isPlaceholder ? "#" : props.studyHref}
              isPlaceholder={isPlaceholder}
              className="w-full"
            >
              Study
            </LinkButton>
            <div className="w-full flex gap-1.5">
              <LinkButton
                variant="outline"
                href={isPlaceholder ? "#" : props.manageHref}
                isPlaceholder={isPlaceholder}
                className="min-w-0 flex-1 shrink"
              >
                Manage
              </LinkButton>
              {!isPlaceholder ? (
                <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
                  <DialogTrigger
                    render={
                      <Button className="flex-1 min-w-0" variant="outline" />
                    }
                  >
                    Add Card
                  </DialogTrigger>
                  <DialogContent>
                    <AddCardForm
                      key={String(addCardOpen)}
                      deckId={props.deck.id}
                      onDone={() => setAddCardOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
              ) : (
                <Button
                  isPlaceholder
                  className="flex-1 min-w-0"
                  variant="outline"
                >
                  Add Card
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
