/**
 * The scheduling state of a card, declared once for everything that needs it.
 *
 * Three layers spell this enum out and they must agree exactly: the Postgres
 * enum (`packages/db`), the Zero column type clients sync (`packages/contracts`)
 * and the FSRS mapping in `fsrs/fsrs.ts`. It used to be declared in the drizzle
 * schema, which meant the Zero schema and the browser's FSRS code imported
 * drizzle for a four-string tuple. It lives here instead, at the bottom of the
 * dependency graph, where all three can reach it and none of them pulls in a
 * database driver to do so.
 */
export const CARD_STATES = ["new", "learning", "review", "relearning"] as const;

export type TCardState = (typeof CARD_STATES)[number];
