import { formatLocation } from "@lexeme/shared";
import { Fragment, type ReactNode } from "react";

import { Dot } from "@/components/dot";
import { usePositionUnit, type THighlight } from "@/hooks/data/use-reading";

/** A highlight with its note, as a list row; `bookTitle` names the book when the list mixes books. */
export function HighlightItem({ highlight, bookTitle }: { highlight: THighlight; bookTitle?: string }) {
  const where = [bookTitle, highlight.chapter, usePlace(highlight)].filter((part): part is NonNullable<ReactNode> => !!part);
  return (
    <figure className="py-3 pl-3 pr-4 flex gap-3">
      <div aria-hidden className="w-1 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0 flex flex-col gap-1.5">
        <blockquote className="text-sm leading-relaxed">{highlight.text}</blockquote>
        {highlight.note && <p className="text-sm italic text-muted-foreground">{highlight.note}</p>}
        {where.length > 0 && (
          <figcaption className="text-xs text-muted-foreground">
            {where.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && <> <Dot /> </>}
                {part}
              </Fragment>
            ))}
          </figcaption>
        )}
      </div>
    </figure>
  );
}

/** "Page 122" or "Loc 1,514"; with both known, tapping it switches every place between them, as on a Kindle. */
function usePlace(highlight: THighlight): ReactNode {
  const { unit, toggle } = usePositionUnit();
  const page = highlight.page ? `Page ${highlight.page}` : null;
  const location = highlight.location != null ? `Loc ${formatLocation(highlight.location)}` : null;
  if (!page || !location) return page ?? location;
  return (
    <button
      type="button"
      onClick={toggle}
      title={unit === "location" ? "Show pages" : "Show locations"}
      className="cursor-pointer hover:text-foreground transition-colors"
    >
      {unit === "location" ? location : page}
    </button>
  );
}
