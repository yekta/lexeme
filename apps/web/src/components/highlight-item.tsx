import type { THighlight } from "@/hooks/data/use-reading";

/** A highlight with its note; `bookTitle` names the book when the list mixes books. */
export function HighlightItem({ highlight, bookTitle }: { highlight: THighlight; bookTitle?: string }) {
  const where = [bookTitle, highlight.chapter, highlight.page && `Page ${highlight.page}`].filter(Boolean);
  return (
    <figure className="border-l-4 border-foreground pl-4 flex flex-col gap-1">
      <blockquote className="text-sm leading-relaxed">{highlight.text}</blockquote>
      {highlight.note && <p className="text-sm italic text-muted-foreground">{highlight.note}</p>}
      {where.length > 0 && <figcaption className="text-xs text-muted-foreground">{where.join(" · ")}</figcaption>}
    </figure>
  );
}
