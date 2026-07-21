"use client";

import { AddCardForm } from "@/components/add-card-form";
import { DeckSettingsMenu } from "@/components/deck-settings-menu";
import NewIndicator from "@/components/new-indicator";
import { useNow } from "@/components/now-provider";
import OptimisticIndicator from "@/components/optimistic-indicator";
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
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type TDeck } from "@/hooks/data/use-decks";
import { appLocale } from "@/lib/constants";
import { motion } from "motion/react";
import { useState } from "react";

export type TDeckStats = {
  total: number;
  new: number;
  learn: number;
  due: number;
  latestCardCreatedAt: number;
  /** True retention (0..1), or null when the deck has no review answers yet. */
  retention: number | null;
  /** A card in this deck has local changes the server hasn't confirmed yet. */
  optimistic: boolean;
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
      isOptimistic: boolean;
    };

export function LDeck(props: TLDeckProps) {
  const { isPlaceholder } = props;

  const name = isPlaceholder ? "Deck Name" : props.deck.name;
  const description = isPlaceholder
    ? "A short description"
    : props.deck.description;
  const totalCards = isPlaceholder ? 100 : props.totalCards;
  const newCount = isPlaceholder ? 5 : props.newCount;
  const learningCount = isPlaceholder ? 5 : props.learningCount;
  const dueCount = isPlaceholder ? 5 : props.dueCount;
  const retention = isPlaceholder ? null : props.stats.retention;

  const now = useNow();
  const isNew =
    !isPlaceholder && now - new Date(props.deck.created_at).getTime() < 4000;

  const isRecentlyUpdated = isPlaceholder
    ? false
    : props.stats.latestCardCreatedAt > 0 &&
      now - props.stats.latestCardCreatedAt <= 4_000;

  const [addCardOpen, setAddCardOpen] = useState(false);

  const isOptimistic = isPlaceholder ? false : props.isOptimistic;

  return (
    <div
      className="group relative w-full h-full"
      data-placeholder={isPlaceholder || undefined}
    >
      {/* Main card */}
      <motion.div className="relative z-10 h-full">
        <Card className="h-full flex flex-col shadow-md shadow-shadow/shadow relative isolate transition-colors">
          {!isPlaceholder && (
            <DeckSettingsMenu
              deck={props.deck}
              triggerClassName="absolute right-1 top-1 z-20"
            />
          )}
          <CardHeader className="flex flex-row items-start justify-between gap-4 relative z-10">
            <div className="w-full flex flex-col items-start gap-1">
              <CardTitle className="max-w-full flex items-center shrink min-w-0 truncate pr-8 group-data-placeholder:text-transparent group-data-placeholder:bg-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                <span className="pr-[0.5ch] shrink min-w-0 truncate">
                  {name}
                </span>
                {!isPlaceholder && (
                  <OptimisticIndicator
                    isOptimistic={isOptimistic}
                    className="size-3.5"
                  />
                )}
              </CardTitle>
              <CardDescription className="truncate group-data-placeholder:text-transparent group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                {/* Description or non-breaking space */}
                {description || "\u00A0"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-end">
            <NewIndicator
              isNew={isNew || isRecentlyUpdated}
              className="rounded-tl-[calc(var(--radius)*1.4-1px)]"
              classNameInner="rounded-tl-[calc(var(--radius)*1.4-2px)]"
            />
            <div className="flex flex-col items-start gap-3 mt-2 relative">
              <div className="text-sm max-w-full text-muted-foreground bg-transparent flex-wrap flex justify-start items-center">
                <div
                  data-recently-updated={isRecentlyUpdated ? "true" : undefined}
                  className="px-1.25 py-px data-recently-updated:bg-success/15 data-recently-updated:text-success duration-300 transition-colors rounded -mx-1.25"
                >
                  <p className="shrink wrap-break-word min-w-0 group-data-placeholder:text-transparent group-data-placeholder:rounded group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:select-none">
                    {totalCards.toLocaleString(appLocale)}{" "}
                    {totalCards === 1 ? "card" : "cards"}
                  </p>
                </div>
                {(isPlaceholder || retention !== null) && (
                  <p className="px-2 text-muted-more-foreground group-data-placeholder:text-transparent group-data-placeholder:px-1">
                    |
                  </p>
                )}
                {isPlaceholder ? (
                  <p className="shrink wrap-break-word min-w-0 group-data-placeholder:text-transparent group-data-placeholder:rounded group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:select-none">
                    80% retention
                  </p>
                ) : (
                  retention !== null && (
                    <Popover>
                      <PopoverTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="font-normal py-px px-1.25 -my-px -mx-1.25 rounded"
                          />
                        }
                      >
                        <span className="shrink min-w-0 truncate">
                          {retention.toLocaleString(appLocale, {
                            style: "percent",
                            maximumFractionDigits: 0,
                          })}{" "}
                          retention
                        </span>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="min-w-64">
                        <PopoverHeader>
                          <PopoverTitle>
                            True Retention
                            <span className="text-muted-foreground">
                              {" ("}
                            </span>
                            30d
                            <span className="text-muted-foreground">)</span>
                          </PopoverTitle>
                          <PopoverDescription>
                            The share of due-card reviews you answered correctly
                            in the last 30 days.
                          </PopoverDescription>
                        </PopoverHeader>
                      </PopoverContent>
                    </Popover>
                  )
                )}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-state-new group-data-placeholder:text-transparent group-data-placeholder:bg-state-new/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                  <span className="w-2 h-2 rounded-full bg-state-new group-data-placeholder:opacity-0" />
                  {newCount.toLocaleString(appLocale)} New
                </div>
                <div className="flex items-center gap-1.5 text-state-learn group-data-placeholder:text-transparent group-data-placeholder:bg-state-learn/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                  <span className="w-2 h-2 rounded-full bg-state-learn group-data-placeholder:opacity-0" />
                  {learningCount.toLocaleString(appLocale)} Learn
                </div>
                <div className="flex items-center gap-1.5 text-state-due group-data-placeholder:text-transparent group-data-placeholder:bg-state-due/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                  <span className="w-2 h-2 rounded-full bg-state-due group-data-placeholder:opacity-0" />
                  {dueCount.toLocaleString(appLocale)} Due
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
                      deckId={props.deck.id}
                      deckName={props.deck.name}
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
