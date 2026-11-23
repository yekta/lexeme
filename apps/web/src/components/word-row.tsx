import { formatDistanceToNowStrict } from "date-fns";

import type { TLookup } from "@/hooks/data/use-reading";

/** The word in bold inside the sentence it was read in. */
function WordInContext({ word, context }: { word: string; context?: string | null }) {
  if (!context) return null;
  const at = context.toLowerCase().indexOf(word.toLowerCase());
  if (at < 0) return <span>{context}</span>;
  return (
    <span>
      {context.slice(0, at)}
      <strong className="font-semibold text-foreground">{context.slice(at, at + word.length)}</strong>
      {context.slice(at + word.length)}
    </span>
  );
}

/** A looked-up word in its sentence; `isCard` when the word is in a deck already. */
export function WordRow({ lookup, bookTitle, isCard }: { lookup: TLookup; bookTitle?: string; isCard?: boolean }) {
  return (
    <div className="px-4 py-3 flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{lookup.word}</span>
          {isCard && (
            <span className="text-[11px] rounded-full border px-1.5 py-px text-muted-foreground">Card</span>
          )}
          <span className="ml-auto text-xs text-muted-foreground shrink-0">
            {formatDistanceToNowStrict(lookup.looked_up_at, { addSuffix: true })}
          </span>
        </div>
        {bookTitle && <span className="text-xs text-muted-foreground truncate">{bookTitle}</span>}
      </div>
      {lookup.context && (
        <p className="text-sm text-muted-foreground">
          <WordInContext word={lookup.word} context={lookup.context} />
        </p>
      )}
    </div>
  );
}
