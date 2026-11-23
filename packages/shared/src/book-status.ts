/** Where a reader is with a book, as its e-reader reports it. */
export const BOOK_STATUSES = ["reading", "finished", "abandoned"] as const;

export type TBookStatus = (typeof BOOK_STATUSES)[number];
