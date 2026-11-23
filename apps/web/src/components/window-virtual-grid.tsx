import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * A long list or grid scrolled by the page itself, rendering only the rows on
 * screen. Items are chunked into rows of `columns`, so items in one row stay
 * height-matched like a CSS grid row.
 */
export function WindowVirtualGrid<T>({
  items,
  columns,
  estimateRowHeight,
  gap,
  getKey,
  renderItem,
  className,
  rowClassName,
}: {
  items: T[];
  columns: number;
  estimateRowHeight: number;
  gap: number;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  rowClassName?: string;
}) {
  const rows = useMemo(() => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += columns) {
      out.push(items.slice(i, i + columns));
    }
    return out;
  }, [items, columns]);

  // The window virtualizer measures scroll against the whole document, so it
  // needs to know how far the list sits from the top of the page. A stale
  // reading offsets every row by the difference.
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const measureScrollMargin = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    // Rounded: while scrolling, `rect.top + scrollY` only changes by subpixel
    // noise, and storing it would re-render the list on every frame.
    setScrollMargin(Math.round(el.getBoundingClientRect().top + window.scrollY));
  }, []);

  // After every commit, because a render is the usual reason the content
  // above the list changes height.
  useLayoutEffect(measureScrollMargin);

  // And for reflows React never renders: a resize, a banner, a webfont.
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
    estimateSize: () => estimateRowHeight,
    overscan: 5,
    gap,
    scrollMargin,
  });

  // Re-chunked rows make cached heights stale. Deliberately not on mount:
  // `measure()` drops every cached height and nothing re-measures rows already
  // on screen, so the first paint would jump to the estimate.
  const measuredColumns = useRef(columns);
  useEffect(() => {
    if (measuredColumns.current === columns) return;
    measuredColumns.current = columns;
    virtualizer.measure();
  }, [columns, virtualizer]);

  return (
    <div ref={parentRef} className={className}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
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
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <div className={rowClassName}>
                {row.map((item, i) => (
                  <Fragment key={getKey(item)}>
                    {renderItem(item, virtualRow.index * columns + i)}
                  </Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
