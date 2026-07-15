"use client";

import BgPattern from "@/components/bg-pattern";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { Rating, type Grade } from "ts-fsrs";

type TLCardStudyProps =
  | { isPlaceholder: true }
  | {
      isPlaceholder?: never;
      front: string;
      back: string;
      onRate: (rating: Grade) => void;
      ratingPending: boolean;
      pendingRating: Grade | null;
      againLabel: string;
      hardLabel: string;
      goodLabel: string;
      easyLabel: string;
    };

const placeholderProps: Omit<TRatingButtonsProps, "visible"> = {
  isPlaceholder: true,
  onRate: () => {},
  ratingPending: false,
  pendingRating: null,
  againLabel: "<1m",
  hardLabel: "1d",
  goodLabel: "3d",
  easyLabel: "5d",
};

export function LCardStudy(props: TLCardStudyProps) {
  const { isPlaceholder } = props;

  const [isBack, setIsBack] = useState(false);

  // The canonical Y rotation angle (0 = front, 180 = back)
  const rotateY = useMotionValue(0);
  const frontOpacity = useTransform(rotateY, (v) => (Math.abs(v) < 90 ? 1 : 0));
  const backOpacity = useTransform(rotateY, (v) => (Math.abs(v) >= 90 ? 1 : 0));
  const baseAngle = useRef(0); // 0 or 180 — updated on flip commit

  const commitFlip = (targetAngle: number) => {
    baseAngle.current = targetAngle;
    animate(rotateY, targetAngle, {
      type: "spring",
      stiffness: 360,
      damping: 40,
    });
    setIsBack(targetAngle !== 0);
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPlaceholder) return;
    // Don't interfere with button clicks
    if ((e.target as HTMLElement).closest("button")) return;
    // Back face is locked — must use buttons to rate
    if (baseAngle.current !== 0) return;
    commitFlip(180);
  };

  /* ─── Shared face structure ─── */
  const faceBase = "flex flex-col p-4 md:p-8 rounded-2xl select-none";

  return (
    <div
      data-placeholder={isPlaceholder ? "true" : undefined}
      data-is-back={isBack ? "true" : undefined}
      className="w-full flex-1 min-h-0 group perspective-distant md:perspective-[1600px] cursor-pointer data-is-back:cursor-default data-placeholder:cursor-default"
      onClick={onClick}
    >
      <motion.div
        style={{ rotateY, transformStyle: "preserve-3d" }}
        className="relative w-full h-full"
      >
        {/* ─── Front face ─── */}
        <motion.div
          style={{ backfaceVisibility: "hidden", opacity: frontOpacity }}
          className={cn(
            faceBase,
            "absolute inset-0 border border-border bg-background shadow-lg shadow-shadow/shadow-muted overflow-hidden flex flex-col items-center",
          )}
        >
          <p className="max-w-full shrink min-w-0 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-5 text-center relative z-10 group-data-placeholder:text-transparent group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
            Front
          </p>
          <FaceScrollArea>
            <p className="max-w-full text-2xl font-medium text-foreground wrap-anywhere text-center group-data-placeholder:text-transparent group-data-placeholder:bg-foreground/15 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none px-3">
              {isPlaceholder ? "Front text" : props.front}
            </p>
          </FaceScrollArea>
          {/* Invisible buttons — keep layout identical to back face */}
          <RatingButtons
            visible={false}
            {...(isPlaceholder ? placeholderProps : props)}
          />
          <p className="text-xs text-muted-foreground text-center relative z-10 select-none group-data-placeholder:text-transparent group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
            Click to flip
          </p>
        </motion.div>

        {/* ─── Back face ─── */}
        {!isPlaceholder && (
          <motion.div
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              position: "absolute",
              inset: 0,
              opacity: backOpacity,
            }}
            className={cn(
              faceBase,
              "border bg-background overflow-hidden border-border shadow-lg shadow-shadow/shadow-muted",
            )}
          >
            <BgPattern />
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-5 text-center relative">
              Back
            </p>
            <FaceScrollArea>
              <p className="max-w-full text-xl text-foreground wrap-anywhere text-center px-3">
                {isPlaceholder ? "Back text" : props.back}
              </p>
            </FaceScrollArea>
            {/* Invisible placeholder — matches "Click to flip" line height */}
            <p className="text-xs text-center mt-1 mb-0 opacity-0 select-none relative">
              placeholder
            </p>
            {/* Visible rating buttons */}
            <RatingButtons visible={true} {...props} />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

/**
 * Scroll area shared by both faces. Full-bleeds through the face's padding so
 * the top/bottom fade mask reaches the card edges, then re-applies the padding
 * inside so content keeps its inset.
 */
function FaceScrollArea({ children }: { children: React.ReactNode }) {
  return (
    <div className="faded-scroll-container relative z-10 -mx-4 md:-mx-8 w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center-safe px-4 md:px-8 py-6">
      {children}
    </div>
  );
}

type TRatingButtonsProps = {
  isPlaceholder?: boolean;
  visible: boolean;
  ratingPending: boolean;
  pendingRating: Grade | null;
  onRate: (rating: Grade) => void;
  againLabel: string;
  hardLabel: string;
  goodLabel: string;
  easyLabel: string;
};

function RatingButtons({
  visible,
  ratingPending,
  pendingRating,
  onRate,
  againLabel,
  hardLabel,
  goodLabel,
  easyLabel,
}: TRatingButtonsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 pt-2 transition-opacity duration-150 relative",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      <Button
        variant="outline"
        className="h-auto py-2 md:py-2.5 flex flex-col gap-0.5 bg-rating-again border-rating-again-border hover:bg-rating-again-border active:bg-rating-again-border"
        onClick={(e) => {
          e.stopPropagation();
          onRate(Rating.Again);
        }}
        isPending={ratingPending && pendingRating === Rating.Again}
        disabled={ratingPending}
      >
        <span className="font-bold text-sm">Again</span>
        <span className="text-xs opacity-70">{againLabel}</span>
      </Button>
      <Button
        variant="outline"
        className="h-auto py-2 md:py-2.5 flex flex-col gap-0.5 bg-rating-hard border-rating-hard-border hover:bg-rating-hard-border active:bg-rating-hard-border"
        onClick={(e) => {
          e.stopPropagation();
          onRate(Rating.Hard);
        }}
        isPending={ratingPending && pendingRating === Rating.Hard}
        disabled={ratingPending}
      >
        <span className="font-bold text-sm">Hard</span>
        <span className="text-xs opacity-70">{hardLabel}</span>
      </Button>
      <Button
        variant="outline"
        className="h-auto py-2 md:py-2.5 flex flex-col gap-0.5 bg-rating-good border-rating-good-border hover:bg-rating-good-border active:bg-rating-good-border"
        onClick={(e) => {
          e.stopPropagation();
          onRate(Rating.Good);
        }}
        isPending={ratingPending && pendingRating === Rating.Good}
        disabled={ratingPending}
      >
        <span className="font-bold text-sm">Good</span>
        <span className="text-xs opacity-70">{goodLabel}</span>
      </Button>
      <Button
        variant="outline"
        className="h-auto py-2 md:py-2.5 flex flex-col gap-0.5 bg-rating-easy border-rating-easy-border hover:bg-rating-easy-border active:bg-rating-easy-border"
        onClick={(e) => {
          e.stopPropagation();
          onRate(Rating.Easy);
        }}
        isPending={ratingPending && pendingRating === Rating.Easy}
        disabled={ratingPending}
      >
        <span className="font-bold text-sm">Easy</span>
        <span className="text-xs opacity-70">{easyLabel}</span>
      </Button>
    </div>
  );
}
