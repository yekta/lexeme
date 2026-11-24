import type { syncReadingArgs } from "@lexeme/contracts";
import type { z } from "zod";

type TSyncReading = z.infer<typeof syncReadingArgs>;

const ROWS_PER_TRANSACTION = 2000;

function chunks<T>(rows: readonly T[]) {
  const result: T[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_TRANSACTION) result.push(rows.slice(i, i + ROWS_PER_TRANSACTION));
  return result;
}

/** One file is applied as several transactions, books first and deletions last, so none holds the database for long. */
export function readingBatches(args: TSyncReading): TSyncReading[] {
  const empty: TSyncReading = {
    books: [],
    page_reads: [],
    highlights: [],
    lookups: [],
    book_page_reads: [],
    removed_highlight_ids: [],
    removed_lookup_ids: [],
    removed_book_keys: [],
  };
  return [
    { ...empty, books: args.books },
    ...chunks(args.page_reads).map((page_reads) => ({ ...empty, page_reads })),
    ...chunks(args.highlights).map((highlights) => ({ ...empty, highlights })),
    ...chunks(args.lookups).map((lookups) => ({ ...empty, lookups })),
    {
      ...empty,
      book_page_reads: args.book_page_reads,
      removed_highlight_ids: args.removed_highlight_ids,
      removed_lookup_ids: args.removed_lookup_ids,
      removed_book_keys: args.removed_book_keys,
    },
  ];
}
