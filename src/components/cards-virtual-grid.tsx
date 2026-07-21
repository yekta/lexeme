"use client";

import { LCardManage } from "@/components/l-card-manage";
import { isRowOptimistic } from "@/db/collections";
import { type TCard } from "@/hooks/data/use-cards";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Estimated height (px) of a single card row before it is measured. Real
// heights are measured dynamically via measureElement; this only affects the
// initial scroll-height guess and overscan math.
const ESTIMATED_ROW_HEIGHT = 180;
// Matches the `gap-4` (1rem) used by the card grid.
const ROW_GAP = 16;

export function CardsVirtualGrid({
  cards,
  deckId,
}: {
  cards: TCard[];
  deckId: string;
}) {
  const isMobile = useIsMobile();
  const columns = isMobile ? 1 : 2;

  // Chunk the flat card list into rows of `columns` cards each. Each virtual
  // item is one row, so rows in the same row stay height-matched exactly like
  // the original CSS grid (align-items: stretch).
  const rows = useMemo(() => {
    const out: TCard[][] = [];
    for (let i = 0; i < cards.length; i += columns) {
      out.push(cards.slice(i, i + columns));
    }
    return out;
  }, [cards, columns]);

  // The window virtualizer measures scroll against the whole document, so it
  // needs to know how far the grid sits from the top of the page (navbar +
  // header above it). Recompute on resize since that header height and the
  // column count both shift with the breakpoint.
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const el = parentRef.current;
      if (!el) return;
      setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
    gap: ROW_GAP,
    scrollMargin,
  });

  // When the column count changes (crossing the md breakpoint) the rows are
  // re-chunked, so any cached row heights are stale — drop them and re-measure.
  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  return (
    <div ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const rowCards = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${
                  virtualRow.start - virtualizer.options.scrollMargin
                }px)`,
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rowCards.map((card) => (
                  <LCardManage
                    key={card.id}
                    id={card.id}
                    deckId={deckId}
                    front={card.front}
                    back={card.back}
                    createdAt={card.created_at}
                    updatedAt={card.updated_at}
                    isOptimistic={isRowOptimistic(card)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
