import { pgTable, text, uuid, timestamp, real, integer, index } from 'drizzle-orm/pg-core';

export const decks = pgTable(
  'decks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('decks_user_id_created_at_idx').on(t.userId, t.createdAt)]
);

export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    front: text('front').notNull(),
    back: text('back').notNull(),
    interval: integer('interval').notNull().default(0),
    repetition: integer('repetition').notNull().default(0),
    easeFactor: real('ease_factor').notNull().default(2.5),
    nextReviewDate: timestamp('next_review_date', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cards_deck_id_user_id_next_review_idx').on(t.deckId, t.userId, t.nextReviewDate),
  ]
);

export type Deck = typeof decks.$inferSelect;
export type Card = typeof cards.$inferSelect;
