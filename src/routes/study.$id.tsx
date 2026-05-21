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
import {
  useRateCard,
  useStudyCards,
  type TStudyCard,
} from "@/hooks/data/use-study";
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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import confetti from "canvas-confetti";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/study/$id")({
  component: StudyPage,
});

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

function StudyPage() {
  const { isPending: isPendingAuth } = useRedirectToSignInIfNecessary();
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [studySession, setStudySession] = useState<TStudySession | null>(null);

  const { data: profiles = [], isPending: isPendingProfiles } =
    useLearningProfiles();

  const { data: deckData, isPending: isPendingDecks } = useDeck(id);

  const learningProfile =
    profiles.find((p) => p.id === deckData?.learning_profile_id) ??
    profiles.find((p) => p.is_default) ??
    null;

  const userScheduler = useMemo(
    () => (learningProfile ? createUserScheduler(learningProfile) : null),
    [learningProfile],
  );

  // Redirect home if the deck doesn't exist.
  useEffect(() => {
    if (!isPendingDecks && id && deckData === null) {
      navigate({ to: "/" });
    }
  }, [isPendingDecks, deckData, id, navigate]);

  const deckName = deckData?.name ?? "Loading...";

  const { data: studyData, isPending: isPendingCards } = useStudyCards(id);

  const isPending =
    isPendingDecks || isPendingCards || isPendingProfiles || isPendingAuth;
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

  const rate = useRateCard();

  const currentCard = queue[0]?.card ?? null;
  const { getElapsedMs } = useReviewTimer(currentCard?.id ?? null);
  const isFinished = queue.length === 0 && reviewedCount > 0;
  const hasNoDueCards =
    !isPending &&
    studyData &&
    studyData.dueCards.length === 0 &&
    totalCards > 0;

  const handleRate = (rating: Grade) => {
    if (!currentCard || !learningProfile) return;
    const durationMs = getElapsedMs();
    const { intervalMs, updatedCard } = rate({
      card: currentCard,
      profile: learningProfile,
      rating,
      durationMs,
    });

    setStudySession((prev) => {
      const session =
        prev?.queueKey === queueKey
          ? prev
          : { queueKey, queue, reviewedCount };
      const [current, ...rest] = session.queue;
      if (!current) return session;

      if (intervalMs < SHORT_INTERVAL_MS) {
        const requeued: TQueueItem = {
          card: updatedCard,
          isRequeued: true,
          dueTime: new Date(updatedCard.due).getTime(),
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
            ratingPending={false}
            pendingRating={null}
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
