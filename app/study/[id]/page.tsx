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
import CardsIcon from "@/components/icons/cards";
import { NCardStudy } from "@/components/n-card-study";
import { Navbar } from "@/components/navbar";
import { LinkButton } from "@/components/ui/button";
import { useDeck } from "@/hooks/data/use-decks";
import { useLearningProfiles } from "@/hooks/data/use-learning-profiles";
import { useRateCard } from "@/hooks/data/use-rate-card";
import { useStudyCards, type TStudyCard } from "@/hooks/data/use-study-cards";
import { useReviewTimer } from "@/hooks/use-review-timer";
import {
  createUserScheduler,
  dbRowToFSRSCard,
  formatInterval,
  Rating,
  SHORT_INTERVAL_MS,
  type Grade,
} from "@/lib/fsrs";
import confetti from "canvas-confetti";
import { CheckCircle2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
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

export default function StudyPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user, loading } = useAuth();

  const [studySession, setStudySession] = useState<TStudySession | null>(null);

  const { data: profiles = [], isPending: isPendingProfiles } =
    useLearningProfiles();

  const { data: deckData, isPending: isPendingDecks } = useDeck(id);

  const learningProfile =
    profiles.find((p) => p.id === deckData?.learning_profile_id) ??
    profiles.find((p) => p.is_default) ??
    null;

  const userScheduler = useMemo(() => {
    if (!learningProfile) return null;
    return createUserScheduler(learningProfile);
  }, [learningProfile]);

  // Redirect home if the deck doesn't exist.
  useEffect(() => {
    if (!isPendingDecks && user && id && deckData === null) {
      router.push("/");
    }
  }, [isPendingDecks, deckData, user, id, router]);

  const deckName = deckData?.name ?? "Loading...";

  const { data: studyData, isPending: isPendingCards } = useStudyCards(
    id,
    learningProfile,
  );

  const isPending = isPendingDecks || isPendingCards || isPendingProfiles;
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

  const rateCardMutation = useRateCard(userScheduler, id);

  const currentCard = queue[0]?.card ?? null;
  const { getElapsedMs } = useReviewTimer(currentCard?.id ?? null);
  const isFinished = queue.length === 0 && reviewedCount > 0;
  const hasNoDueCards =
    !isPending &&
    studyData &&
    studyData.dueCards.length === 0 &&
    totalCards > 0;

  const handleRate = (rating: Grade) => {
    if (!user || !currentCard) return;
    const durationMs = getElapsedMs();
    rateCardMutation.mutate(
      { rating, currentCard, durationMs },
      {
        onSuccess: ({ result, dbFields, now }) => {
          const newDueMs = result.card.due.getTime();
          const intervalMs = newDueMs - now.getTime();

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
                dueTime: newDueMs,
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

  if (!loading && !user) return null;

  const hasNoCards = !isPending && studyData && totalCards === 0;
  const showPlaceholder =
    loading ||
    isPending ||
    !deckData ||
    (!currentCard && !isFinished && !hasNoDueCards && !hasNoCards);

  return (
    <div className="h-svh overflow-hidden flex flex-col">
      <Navbar
        backHref="/"
        title={
          showPlaceholder ? (
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
      <main className="flex-1 flex flex-col items-center justify-center px-5 pt-4 pb-5 max-w-4xl mx-auto w-full overflow-hidden">
        {showPlaceholder ? (
          <NCardStudy isPlaceholder />
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
          <NCardStudy
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
