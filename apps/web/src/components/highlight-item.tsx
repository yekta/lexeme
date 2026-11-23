import type { THighlight } from "@/hooks/data/use-reading";

/** A highlight with its note, as a list row; `bookTitle` names the book when the list mixes books. */
export function HighlightItem({ highlight, bookTitle }: { highlight: THighlight; bookTitle?: string }) {
  const where = [bookTitle, highlight.chapter, highlight.page && `Page ${highlight.page}`].filter(Boolean);
  return (
    <figure className="py-3 pl-3 pr-4 flex gap-3">
      <div aria-hidden className="w-1 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0 flex flex-col gap-1.5">
        <blockquote className="text-sm leading-relaxed">{highlight.text}</blockquote>
        {highlight.note && <p className="text-sm italic text-muted-foreground">{highlight.note}</p>}
        {where.length > 0 && <figcaption className="text-xs text-muted-foreground">{where.join(" · ")}</figcaption>}
      </div>
    </figure>
  );
}
