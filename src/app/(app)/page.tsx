"use client";

import { LearningProfileField } from "@/components/learning-profile-field";
import { LDeck, type TDeckStats } from "@/components/l-deck";
import { useNow } from "@/components/now-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateDeck, useDecks, type TDeck } from "@/hooks/data/use-decks";
import { useLearningProfiles } from "@/hooks/data/use-learning-profiles";
import { useDeckStats, useTodayStats } from "@/hooks/data/use-stats";
import { useForm } from "@tanstack/react-form";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { useAsyncRouterPush } from "@/hooks/use-async-router-push";
import useRedirectToSignInIfNecessary from "@/hooks/use-redirect-to-sign-in-if-necessary";
import { dataStateOf, mergeStates } from "@/lib/query-state";
import { formatDuration, intervalToDuration } from "date-fns";
import { cn } from "@/lib/utils";

const createDeckSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim(),
  learning_profile_id: z.uuid(),
});

const EMPTY_STATS: TDeckStats = {
  total: 0,
  new: 0,
  learn: 0,
  due: 0,
  latestCardCreatedAt: 0,
};

export default function Home() {
  const { isPending: isPendingAuth } = useRedirectToSignInIfNecessary();
  const [asyncRouterPush] = useAsyncRouterPush();
  const nowTime = useNow();

  const [isCreateDeckOpen, setIsCreateDeckOpen] = useState(false);

  const decksQuery = useDecks();
  const deckStatsQuery = useDeckStats();
  const { data: decks = [] } = decksQuery;
  const { data: deckStatsRows = [] } = deckStatsQuery;

  const statsByDeck = useMemo(() => {
    const map = new Map<string, TDeckStats>();
    for (const r of deckStatsRows) {
      map.set(r.deckId, {
        total: r.total,
        new: r.new,
        learn: r.learn,
        due: r.due,
        latestCardCreatedAt: r.latestCardCreatedAt
          ? new Date(r.latestCardCreatedAt).getTime()
          : 0,
      });
    }
    return map;
  }, [deckStatsRows]);

  const state = mergeStates(
    dataStateOf(decksQuery),
    dataStateOf(deckStatsQuery),
  );
  const showPlaceholder =
    isPendingAuth || state === "pending" || state === "unauthorized";
  const isError = state === "error";

  return (
    <div
      data-placeholder={showPlaceholder ? "true" : undefined}
      className="min-h-screen relative group flex flex-col"
    >
      <Navbar />
      <main className="w-full max-w-5xl mx-auto px-5 pt-4 pb-16 flex-1 flex flex-col gap-6">
        {isError ? (
          <div className="flex-1 w-full items-center justify-center flex flex-col pb-[8vh]">
            <LoadError
              error={decksQuery.error ?? deckStatsQuery.error}
              onRetry={() => {
                decksQuery.refetch();
                deckStatsQuery.refetch();
              }}
              hideGoHome={true}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold tracking-tight truncate min-w-0 group-data-placeholder:text-transparent group-data-placeholder:bg-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                Decks{" "}
                <span className="font-normal text-muted-foreground group-data-placeholder:text-transparent">
                  ({showPlaceholder ? 5 : decks.length})
                </span>
              </h2>

              <Dialog
                open={isCreateDeckOpen}
                onOpenChange={setIsCreateDeckOpen}
              >
                <DialogTrigger
                  render={<Button isPlaceholder={showPlaceholder} />}
                >
                  <Plus className="size-5 -ml-1.5 shrink-0" />
                  <span className="shrink min-w-0 overflow-hidden overflow-ellipsis">
                    Create Deck
                  </span>
                </DialogTrigger>
                <DialogContent>
                  <CreateDeckForm
                    key={String(isCreateDeckOpen)}
                    onAfterSubmit={async (id) => {
                      await asyncRouterPush(`/deck/${id}`);
                      setIsCreateDeckOpen(false);
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>
            <DecksSection
              showPlaceholder={showPlaceholder}
              decks={decks}
              getDeckStats={(id) => statsByDeck.get(id) ?? EMPTY_STATS}
              nowTime={nowTime}
              onCreateDeck={() => setIsCreateDeckOpen(true)}
            />
            <div className="w-full h-px rounded-full bg-border" />
            <TodayStatsFooter
              showPlaceholder={showPlaceholder}
              className="-mt-1"
            />
          </>
        )}
      </main>
    </div>
  );
}

function CreateDeckForm({
  onAfterSubmit,
}: {
  onAfterSubmit: (id: string) => Promise<void>;
}) {
  const { data: profiles, isPending: isPendingProfiles } =
    useLearningProfiles();
  const defaultProfile = profiles?.find((p) => p.is_default);
  const defaultProfileId = defaultProfile?.id;
  const mutation = useCreateDeck();
  const form = useForm({
    defaultValues: {
      name: "",
      description: "",
      learning_profile_id: defaultProfileId ?? "",
    },
    validators: {
      onMount: createDeckSchema,
      onChange: createDeckSchema,
      onSubmit: createDeckSchema,
    },
    onSubmit: async ({ value }) => {
      const id = await mutation.mutateAsync({
        name: value.name,
        description: value.description,
        learning_profile_id: value.learning_profile_id,
      });
      await onAfterSubmit(id);
    },
  });

  // Profiles load async, so the initial onMount validation can run before the
  // default profile id exists. Fill it and re-run form-level validation.
  useEffect(() => {
    if (!defaultProfileId) return;
    if (form.getFieldValue("learning_profile_id")) return;

    form.setFieldValue("learning_profile_id", defaultProfileId);
    void form.validate("change");
  }, [defaultProfileId, form]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Create Deck</DialogTitle>
        <DialogDescription>
          Organize your cards into decks by topic or subject.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <form.Field name="name">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Name</Label>
              <Input
                id={field.name}
                name={field.name}
                placeholder="e.g. Spanish Vocabulary"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>
                Description{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id={field.name}
                name={field.name}
                placeholder="e.g. Words from chapter 1-5"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="learning_profile_id">
          {(field) => (
            <LearningProfileField
              profiles={profiles}
              isPending={isPendingProfiles}
              value={field.state.value}
              onChange={field.handleChange}
              fallbackId={defaultProfile?.id}
            />
          )}
        </form.Field>
      </div>
      <DialogFooter>
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isSubmitting: s.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              type="submit"
              disabled={!canSubmit || isPendingProfiles}
              isPending={isSubmitting}
            >
              Create Deck
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

function TodayStatsFooter({
  showPlaceholder,
  className,
}: {
  showPlaceholder: boolean;
  className?: string;
}) {
  const { data, isPending, isError } = useTodayStats();
  const humanDuration = formatHumanDuration(data?.totalMs ?? 0);
  const secondsPerCard = formatSecondsPerCard(data?.msPerCard ?? 0);
  const count = data?.count ?? 0;
  const cardWord = count === 1 ? "card" : "cards";

  const statsText =
    showPlaceholder || isPending ? (
      "Loading today's stats..."
    ) : isError ? (
      "Couldn't load today's stats."
    ) : count === 0 ? (
      "You haven't studied today."
    ) : (
      <>
        {"You've studied "}
        <span className="text-foreground">
          {count} {cardWord}
        </span>{" "}
        in <span className="text-foreground">{humanDuration}</span> today (
        <span className="text-foreground">{secondsPerCard}s/card</span>)
      </>
    );

  return (
    <div
      data-placeholder={showPlaceholder ? "true" : undefined}
      className={cn("w-full flex justify-center group", className)}
    >
      <p className="text-center text-sm max-w-2xl text-muted-foreground group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:text-transparent group-data-placeholder:animate-skeleton group-data-placeholder:rounded">
        {statsText}
      </p>
    </div>
  );
}

function formatHumanDuration(totalMs: number): string {
  const duration = intervalToDuration({ start: 0, end: Math.round(totalMs) });
  const formatted = formatDuration(duration, {
    format: ["hours", "minutes", "seconds"],
    delimiter: ", ",
  });
  return formatted || "less than a second";
}

function formatSecondsPerCard(msPerCard: number): string {
  const seconds = msPerCard / 1000;
  const rounded = Math.round(seconds * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function DecksSection({
  showPlaceholder,
  decks,
  getDeckStats,
  onCreateDeck,
}: {
  showPlaceholder: boolean;
  decks: TDeck[];
  getDeckStats: (deckId: string) => TDeckStats;
  nowTime: number;
  onCreateDeck: () => void;
}) {
  if (showPlaceholder) {
    return (
      <DeckWrapper>
        {Array.from({ length: 9 }).map((_, i) => (
          <LDeck key={i} isPlaceholder />
        ))}
      </DeckWrapper>
    );
  }

  if (decks.length === 0) {
    return (
      <div className="text-center py-20 bg-background rounded-lg border border-dashed">
        <h3 className="text-lg font-medium text-foreground mb-2">
          No decks yet
        </h3>
        <p className="text-muted-foreground mb-6">
          Create your first deck to start adding cards.
        </p>
        <Button onClick={onCreateDeck}>
          <Plus className="size-5 -ml-1.5 shrink-0" />
          <span className="shrink min-w-0 overflow-hidden overflow-ellipsis">
            Create Deck
          </span>
        </Button>
      </div>
    );
  }

  return (
    <DeckWrapper>
      {decks.map((deck) => {
        const stats = getDeckStats(deck.id);
        return (
          <LDeck
            key={deck.id}
            deck={deck}
            stats={stats}
            totalCards={stats.total}
            newCount={stats.new}
            learningCount={stats.learn}
            dueCount={stats.due}
            studyHref={`/study/${deck.id}`}
            manageHref={`/deck/${deck.id}`}
          />
        );
      })}
    </DeckWrapper>
  );
}

function DeckWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-2">
      {children}
    </div>
  );
}
