import { formatLocation } from "@lexeme/shared";
import { Fragment } from "react";

import { Dot } from "@/components/dot";
import { usePositionUnit, type THighlight } from "@/hooks/data/use-reading";

/** A highlight with its note, as a list row; `bookTitle` names the book when the list mixes books. */
export function HighlightItem({ highlight, bookTitle }: { highlight: THighlight; bookTitle?: string }) {
  const where = [bookTitle, highlight.chapter, usePlace(highlight)].filter((part): part is string => !!part);
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

/** "Loc 1,514" or "Page 122", in the user's progress units when the highlight has its place in them. */
function usePlace(highlight: THighlight): string | null {
  const { unit } = usePositionUnit();
  const page = highlight.page ? `Page ${highlight.page}` : null;
  const location = highlight.location != null ? `Loc ${formatLocation(highlight.location)}` : null;
  return (unit === "location" ? location ?? page : page ?? location) ?? null;
}
