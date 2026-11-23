import type { THighlight } from "@/hooks/data/use-reading";

export function HighlightItem({ highlight }: { highlight: THighlight }) {
  return (
    <figure className="border-l-4 border-foreground pl-4 flex flex-col gap-1">
      <blockquote className="text-sm leading-relaxed">{highlight.text}</blockquote>
      {highlight.note && <p className="text-sm italic text-muted-foreground">{highlight.note}</p>}
      <figcaption className="text-xs text-muted-foreground">
        {[highlight.chapter, highlight.page && `Page ${highlight.page}`].filter(Boolean).join(" · ")}
      </figcaption>
    </figure>
  );
}
