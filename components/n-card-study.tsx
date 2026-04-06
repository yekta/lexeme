"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type RatingQuality = 1 | 3 | 4 | 5;

interface NCardStudyProps {
  front: string;
  back: string;
  showAnswer: boolean;
  onShowAnswer: () => void;
  onRate: (quality: RatingQuality) => void;
  ratingPending: boolean;
  pendingQuality: RatingQuality | null;
  hardLabel: string;
  goodLabel: string;
  easyLabel: string;
}

export function NCardStudy({
  front,
  back,
  showAnswer,
  onShowAnswer,
  onRate,
  ratingPending,
  pendingQuality,
  hardLabel,
  goodLabel,
  easyLabel,
}: NCardStudyProps) {
  return (
    <div className="w-full space-y-8">
      <Card className="min-h-[300px] flex flex-col">
        <CardContent className="flex-1 flex flex-col items-center justify-center p-8 text-center min-w-0">
          <div className="text-2xl font-medium text-slate-900 mb-8 break-words w-full">
            {front}
          </div>
          {showAnswer && (
            <div className="w-full pt-8 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-4 duration-500 min-w-0">
              <div className="text-xl text-slate-700 break-words w-full">
                {back}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center">
        {!showAnswer ? (
          <Button size="lg" className="w-full max-w-sm" onClick={onShowAnswer}>
            Show Answer
          </Button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col gap-1 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={() => onRate(1)}
              isLoading={ratingPending && pendingQuality === 1}
              disabled={ratingPending}
            >
              <span className="font-bold">Again</span>
              <span className="text-xs opacity-70">&lt; 1m</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col gap-1 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              onClick={() => onRate(3)}
              isLoading={ratingPending && pendingQuality === 3}
              disabled={ratingPending}
            >
              <span className="font-bold">Hard</span>
              <span className="text-xs opacity-70">{hardLabel}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col gap-1 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              onClick={() => onRate(4)}
              isLoading={ratingPending && pendingQuality === 4}
              disabled={ratingPending}
            >
              <span className="font-bold">Good</span>
              <span className="text-xs opacity-70">{goodLabel}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col gap-1 border-green-200 hover:bg-green-50 hover:text-green-700"
              onClick={() => onRate(5)}
              isLoading={ratingPending && pendingQuality === 5}
              disabled={ratingPending}
            >
              <span className="font-bold">Easy</span>
              <span className="text-xs opacity-70">{easyLabel}</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
