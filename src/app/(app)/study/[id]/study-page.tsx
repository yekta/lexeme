"use client";

import { DeckNotFound } from "@/components/deck-not-found";
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
import { LCardStudy } from "@/components/l-card-study";
import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { NoAccess } from "@/components/no-access";
import OptimisticIndicator from "@/components/optimistic-indicator";
import { LinkButton } from "@/components/ui/button";
import { isRowOptimistic } from "@/db/collections";
import { useDeck } from "@/hooks/data/use-decks";
import { useLearningProfiles } from "@/hooks/data/use-learning-profiles";
import { useRateCard } from "@/hooks/data/use-rate-card";
import { useStudyCards, type TStudyCard } from "@/hooks/data/use-study-cards";
import useRedirectToSignInIfNecessary from "@/hooks/use-redirect-to-sign-in-if-necessary";
import { useReviewTimer } from "@/hooks/use-review-timer";
import {
  createUserScheduler,
  dbRowToFSRSCard,
  formatInterval,
  Rating,
  SHORT_INTERVAL_MS,
  type Grade,
} from "@/lib/fsrs";
import { dataStateOf, mergeStates, type DataState } from "@/lib/query-state";
import confetti from "canvas-confetti";
import { CheckCircle2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type TQueueItem = {
  card: TStudyCard;
  isRequeued: boolean;
  dueTime: number;
};

type TPreviewLabels = {
  againLabel: string;
  hardLabel: string;
  goodLabel: string;
  easyLabel: string;
};

/**
 * Fisher–Yates shuffle driven by a seeded PRNG (mulberry32). Deterministic —
 * the same set of cards always yields the same order — so it's safe to run
 * during render without reshuffling on every re-render.
 */
function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * A study session is a one-time snapshot of the due queue, keyed by deck id.
 * The underlying collections stay live, but the session is owned in memory so
 * rating a card (which moves it forward in the collection) doesn't reshuffle
 * or reset the run in progress.
 */
type TStudySession = {
  deckId: string;
  queue: TQueueItem[];
  reviewedCount: number;
};

export function StudyPage() {
  const { isPending: isPendingAuth } = useRedirectToSignInIfNecessary();
  const { id } = useParams() as { id: string };

  const [studySession, setStudySession] = useState<TStudySession | null>(null);

  const profilesQuery = useLearningProfiles();
  const deckQuery = useDeck(id);
  const studyQuery = useStudyCards(id);

  const { data: profiles = [] } = profilesQuery;
  const { data: deckData } = deckQuery;
  const { data: studyData } = studyQuery;

  const state = mergeStates(
    dataStateOf(deckQuery),
    dataStateOf(studyQuery),
    dataStateOf(profilesQuery),
  );
  const isUnavailable =
    state === "not-found" || state === "forbidden" || state === "error";

  const learningProfile =
    profiles.find((p) => p.id === deckData?.learning_profile_id) ??
    profiles.find((p) => p.is_default) ??
    null;

  const userScheduler = useMemo(
    () => (learningProfile ? createUserScheduler(learningProfile) : null),
    [learningProfile],
  );

  const isPending =
    isPendingAuth || state === "pending" || state === "unauthorized";
  const totalCards = studyData?.totalCards || 0;

  const isOptimistic =
    (deckData ? isRowOptimistic(deckData) : false) || studyQuery.isOptimistic;

  // The shuffled due queue. Reactive to the collections until the session
  // starts (first rating), after which `studySession` owns the queue so rating
  // a card can't reshuffle or reset the run in progress.
  const initialQueue = useMemo<TQueueItem[]>(() => {
    const cards = studyData?.dueCards ?? [];
    const items = cards.map((card) => ({
      card,
      isRequeued: false,
      dueTime: new Date(card.due).getTime(),
    }));
    return seededShuffle(items, cards.map((c) => c.id).join(""));
  }, [studyData?.dueCards]);

  const activeSession = studySession?.deckId === id ? studySession : null;
  const queue = activeSession?.queue ?? initialQueue;
  const reviewedCount = activeSession?.reviewedCount ?? 0;

  const { rate } = useRateCard();

  const currentCard = queue[0]?.card ?? null;
  const { getElapsedMs } = useReviewTimer(currentCard?.id ?? null);
  const isFinished = queue.length === 0 && reviewedCount > 0;
  const hasNoDueCards =
    !isPending &&
    !!studyData &&
    studyData.dueCards.length === 0 &&
    totalCards > 0;

  const handleRate = (rating: Grade) => {
    if (!currentCard || !userScheduler) return;
    const durationMs = getElapsedMs();
    const { intervalMs, dbFields } = rate({
      card: currentCard,
      scheduler: userScheduler,
      rating,
      durationMs,
    });

    setStudySession((prev) => {
      const session =
        prev?.deckId === id ? prev : { deckId: id, queue, reviewedCount };
      const [current, ...rest] = session.queue;
      if (!current) return session;

      if (intervalMs < SHORT_INTERVAL_MS) {
        const updatedCard: TStudyCard = { ...current.card, ...dbFields };
        const requeued: TQueueItem = {
          card: updatedCard,
          isRequeued: true,
          dueTime: new Date(dbFields.due).getTime(),
        };
        const firstPass = rest.filter((item) => !item.isRequeued);
        const requeuedItems = [
          ...rest.filter((item) => item.isRequeued),
          requeued,
        ].sort((a, b) => a.dueTime - b.dueTime);
        return {
          deckId: id,
          queue: [...firstPass, ...requeuedItems],
          reviewedCount: session.reviewedCount + 1,
        };
      }

      return {
        deckId: id,
        queue: rest,
        reviewedCount: session.reviewedCount + 1,
      };
    });
  };

  const previewLabels: TPreviewLabels | null =
    currentCard && userScheduler
      ? (() => {
          const fsrsCard = dbRowToFSRSCard(currentCard);
          const now = new Date();
          const preview = userScheduler.repeat(fsrsCard, now);
          return {
            againLabel: formatInterval(preview[Rating.Again].card.due, now),
            hardLabel: formatInterval(preview[Rating.Hard].card.due, now),
            goodLabel: formatInterval(preview[Rating.Good].card.due, now),
            easyLabel: formatInterval(preview[Rating.Easy].card.due, now),
          };
        })()
      : null;

  useEffect(() => {
    if (isFinished) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [isFinished]);

  const hasNoCards = !isPending && !!studyData && totalCards === 0;
  const isPlaceholder =
    !isUnavailable &&
    (isPending ||
      !deckData ||
      (!currentCard && !isFinished && !hasNoDueCards && !hasNoCards));

  return (
    <StudyPageView
      isPlaceholder={isPlaceholder}
      state={state}
      deckName={deckData?.name ?? "Loading..."}
      deckId={id}
      error={deckQuery.error ?? studyQuery.error ?? profilesQuery.error}
      onRetry={() => {
        deckQuery.refetch();
        studyQuery.refetch();
        profilesQuery.refetch();
      }}
      totalCards={totalCards}
      hasNoDueCards={hasNoDueCards}
      isFinished={isFinished}
      currentCard={currentCard}
      previewLabels={previewLabels}
      onRate={handleRate}
      reviewedCount={reviewedCount}
      queueLength={queue.length}
      isOptimistic={isOptimistic}
    />
  );
}

/** The study page's loading state — the view in placeholder mode. */
export function StudyPageSkeleton() {
  return <StudyPageView isPlaceholder />;
}

/**
 * The study page layout — the single source of the page's markup, shared by
 * the live page (`StudyPage`) and its skeleton (`StudyPageSkeleton`).
 * `isPlaceholder` threads through to swap real content for skeleton primitives.
 */
function StudyPageView({
  isPlaceholder = false,
  state = "pending",
  deckName = "Loading...",
  deckId = "",
  error,
  onRetry = () => {},
  totalCards = 0,
  hasNoDueCards = false,
  isFinished = false,
  currentCard = null,
  previewLabels = null,
  onRate = () => {},
  reviewedCount = 0,
  queueLength = 0,
  isOptimistic = false,
}: {
  isPlaceholder?: boolean;
  state?: DataState;
  deckName?: string;
  deckId?: string;
  error?: unknown;
  onRetry?: () => void;
  totalCards?: number;
  hasNoDueCards?: boolean;
  isFinished?: boolean;
  currentCard?: TStudyCard | null;
  previewLabels?: TPreviewLabels | null;
  onRate?: (rating: Grade) => void;
  reviewedCount?: number;
  queueLength?: number;
  isOptimistic?: boolean;
}) {
  const isUnavailable =
    state === "not-found" || state === "forbidden" || state === "error";

  return (
    <div className="h-svh overflow-hidden flex flex-col">
      <Navbar
        backHref="/"
        title={
          isUnavailable ? (
            ""
          ) : isPlaceholder ? (
            <p className="text-transparent bg-foreground/15 rounded leading-tight">
              Loading
            </p>
          ) : (
            <div className="flex items-center shrink min-w-0">
              <span className="pr-[0.5ch] truncate">{deckName}</span>
              <OptimisticIndicator
                isOptimistic={isOptimistic}
                className="size-3.5"
              />
            </div>
          )
        }
        rightActions={
          isPlaceholder ? (
            <div className="text-sm font-medium text-transparent bg-foreground/20 animate-pulse rounded w-12">
              &nbsp;
            </div>
          ) : (
            !isUnavailable &&
            !isFinished &&
            queueLength > 0 && (
              <div className="text-sm font-medium text-muted-foreground">
                {reviewedCount + 1} / {reviewedCount + queueLength}
              </div>
            )
          )
        }
      />
      <main className="flex-1 flex flex-col items-center justify-center px-5 pt-4 max-w-4xl mx-auto w-full overflow-hidden pb-[8vh]">
        {isUnavailable ? (
          state === "not-found" ? (
            <DeckNotFound />
          ) : state === "forbidden" ? (
            <NoAccess />
          ) : (
            <LoadError error={error} onRetry={onRetry} />
          )
        ) : isPlaceholder ? (
          <LCardStudy isPlaceholder />
        ) : totalCards === 0 && !hasNoDueCards ? (
          <EmptyList>
            <EmptyListHeader>
              <EmptyListIcon>
                <CardsIcon />
              </EmptyListIcon>
              <EmptyListContent>
                <EmptyListTitle>This deck is empty</EmptyListTitle>
                <EmptyListDescription>
                  Add some cards to this deck to study it.
                </EmptyListDescription>
              </EmptyListContent>
            </EmptyListHeader>
            <EmptyListFooter>
              <LinkButton href={`/deck/${deckId}`}>Add Cards</LinkButton>
            </EmptyListFooter>
          </EmptyList>
        ) : isFinished || hasNoDueCards ? (
          <EmptyList>
            <EmptyListHeader>
              <EmptyListIcon className="bg-success/10 text-success">
                <CheckCircle2 />
              </EmptyListIcon>
              <EmptyListContent>
                <EmptyListTitle>You&apos;re all caught up!</EmptyListTitle>
                <EmptyListDescription>
                  You have reviewed all the due cards in this deck.
                </EmptyListDescription>
              </EmptyListContent>
            </EmptyListHeader>
            <EmptyListFooter>
              <LinkButton href="/">Back to Dashboard</LinkButton>
              <LinkButton variant="outline" href={`/deck/${deckId}`}>
                Manage Deck
              </LinkButton>
            </EmptyListFooter>
          </EmptyList>
        ) : currentCard ? (
          <LCardStudy
            key={`${currentCard.id}-${reviewedCount}`}
            front={currentCard.front}
            back={currentCard.back}
            onRate={onRate}
            ratingPending={false}
            pendingRating={null}
            againLabel={previewLabels?.againLabel ?? ""}
            hardLabel={previewLabels?.hardLabel ?? ""}
            goodLabel={previewLabels?.goodLabel ?? ""}
            easyLabel={previewLabels?.easyLabel ?? ""}
          />
        ) : null}
      </main>
    </div>
  );
}
