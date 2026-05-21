"use client";

import {
  EmptyList,
  EmptyListContent,
  EmptyListDescription,
  EmptyListFooter,
  EmptyListHeader,
  EmptyListIcon,
  EmptyListTitle,
} from "@/components/empty-list";
import { DeckNotFound } from "@/components/deck-not-found";
import { LoadError } from "@/components/load-error";
import { NoAccess } from "@/components/no-access";
import CardsIcon from "@/components/icons/cards";
import { LCardStudy } from "@/components/l-card-study";
import { Navbar } from "@/components/navbar";
import { LinkButton } from "@/components/ui/button";
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
import { dataStateOf, mergeStates } from "@/lib/query-state";
import confetti from "canvas-confetti";
import { CheckCircle2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type TQueueItem = {
  card: TStudyCard;
  isRequeued: boolean;
  dueTime: number;
};

type TStudySession = {
  queueKey: string;
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

  const deckName = deckData?.name ?? "Loading...";

  const isPending =
    isPendingAuth || state === "pending" || state === "unauthorized";
  const totalCards = studyData?.totalCards || 0;

  const queueKey = useMemo(
    () => studyData?.dueCards.map((card) => card.id).join("|") ?? "",
    [studyData?.dueCards],
  );
  const initialQueue = useMemo(
    () =>
      studyData?.dueCards.map((card) => ({
        card,
        isRequeued: false,
        dueTime: new Date(card.due).getTime(),
      })) ?? [],
    [studyData?.dueCards],
  );
  const activeSession =
    studySession?.queueKey === queueKey ? studySession : null;
  const queue = activeSession?.queue ?? initialQueue;
  const reviewedCount = activeSession?.reviewedCount ?? 0;

  const rateCardMutation = useRateCard(id);

  const currentCard = queue[0]?.card ?? null;
  const { getElapsedMs } = useReviewTimer(currentCard?.id ?? null);
  const isFinished = queue.length === 0 && reviewedCount > 0;
  const hasNoDueCards =
    !isPending &&
    studyData &&
    studyData.dueCards.length === 0 &&
    totalCards > 0;

  const handleRate = (rating: Grade) => {
    if (!currentCard) return;
    const durationMs = getElapsedMs();
    rateCardMutation.mutate(
      { cardId: currentCard.id, rating, durationMs },
      {
        onSuccess: ({ intervalMs, dbFields }) => {
          setStudySession((prev) => {
            const session =
              prev?.queueKey === queueKey
                ? prev
                : { queueKey, queue, reviewedCount };
            const [current, ...rest] = session.queue;
            if (!current) return session;

            if (intervalMs < SHORT_INTERVAL_MS) {
              const updatedCard: TStudyCard = {
                ...current.card,
                ...dbFields,
              };
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
                queueKey,
                queue: [...firstPass, ...requeuedItems],
                reviewedCount: session.reviewedCount + 1,
              };
            }

            return {
              queueKey,
              queue: rest,
              reviewedCount: session.reviewedCount + 1,
            };
          });
        },
      },
    );
  };

  const previewLabels =
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

  const hasNoCards = !isPending && studyData && totalCards === 0;
  const showPlaceholder =
    !isUnavailable &&
    (isPending ||
      !deckData ||
      (!currentCard && !isFinished && !hasNoDueCards && !hasNoCards));

  return (
    <div className="h-svh overflow-hidden flex flex-col">
      <Navbar
        backHref="/"
        title={
          isUnavailable ? (
            ""
          ) : showPlaceholder ? (
            <div className="h-5 w-36 bg-foreground/20 animate-pulse rounded" />
          ) : (
            deckName
          )
        }
        rightActions={
          showPlaceholder ? (
            <div className="text-sm font-medium text-transparent bg-foreground/20 animate-pulse rounded w-12">
              &nbsp;
            </div>
          ) : (
            !isFinished &&
            queue.length > 0 && (
              <div className="text-sm font-medium text-muted-foreground">
                {reviewedCount + 1} / {reviewedCount + queue.length}
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
            <LoadError
              error={deckQuery.error ?? studyQuery.error ?? profilesQuery.error}
              onRetry={() => {
                deckQuery.refetch();
                studyQuery.refetch();
                profilesQuery.refetch();
              }}
            />
          )
        ) : showPlaceholder ? (
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
              <LinkButton href={`/deck/${id}`}>Add Cards</LinkButton>
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
              <LinkButton variant="outline" href={`/deck/${id}`}>
                Manage Deck
              </LinkButton>
            </EmptyListFooter>
          </EmptyList>
        ) : (
          <LCardStudy
            key={`${currentCard.id}-${reviewedCount}`}
            front={currentCard.front}
            back={currentCard.back}
            onRate={handleRate}
            ratingPending={rateCardMutation.isPending}
            pendingRating={rateCardMutation.variables?.rating ?? null}
            againLabel={previewLabels!.againLabel}
            hardLabel={previewLabels!.hardLabel}
            goodLabel={previewLabels!.goodLabel}
            easyLabel={previewLabels!.easyLabel}
          />
        )}
      </main>
    </div>
  );
}
