import { LCardManage } from "@/components/l-card-manage";
import { usePendingIds } from "@/zero/mutate";
import { type TCard } from "@/hooks/data/use-cards";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  // Read once for the whole grid and test membership per card, rather than
  // subscribing from every tile.
  const pending = usePendingIds();

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
  // header above it). A stale reading offsets every row by the difference.
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const measureScrollMargin = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    // Rounded because this runs after every commit, including the ones a scroll
    // causes: `rect.top + scrollY` is a constant while scrolling only up to
    // subpixel noise, and storing that noise would re-render the grid on every
    // frame for a fraction of a pixel.
    setScrollMargin(Math.round(el.getBoundingClientRect().top + window.scrollY));
  }, []);

  // After every commit, because a render is the ordinary reason the header
  // above the grid changes height.
  useLayoutEffect(measureScrollMargin);

  // And for the reflows React never renders: the viewport resizing, or the
  // document growing under us when the sync banner arrives or a webfont lands.
  useLayoutEffect(() => {
    window.addEventListener("resize", measureScrollMargin);
    const observer = new ResizeObserver(measureScrollMargin);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("resize", measureScrollMargin);
      observer.disconnect();
    };
  }, [measureScrollMargin]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
    gap: ROW_GAP,
    scrollMargin,
  });

  // When the column count changes (crossing the md breakpoint) the rows are
  // re-chunked, so any cached row heights are stale: drop them and re-measure.
  //
  // Deliberately not on mount. `measure()` clears every cached height, and
  // nothing re-measures a row that is already on screen: the ref that measures
  // one only runs when the element mounts, and the observer behind it only
  // fires when the element's own size changes. Running it on mount therefore
  // threw away the heights the first rows had just been measured at and re-laid
  // the grid out on the 180px estimate, one frame after it was painted
  // correctly. That was the shift.
  const measuredColumns = useRef(columns);
  useEffect(() => {
    if (measuredColumns.current === columns) return;
    measuredColumns.current = columns;
    virtualizer.measure();
  }, [columns, virtualizer]);

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
                    isOptimistic={pending.has(card.id)}
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
