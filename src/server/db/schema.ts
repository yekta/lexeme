import {
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_NEW_CARDS_PER_DAY,
} from "@/lib/constants";
import {
  FSRS_DEFAULT_ENABLE_FUZZ,
  FSRS_DEFAULT_ENABLE_SHORT_TERM,
  FSRS_DEFAULT_LEARNING_STEPS,
  FSRS_DEFAULT_MAXIMUM_INTERVAL,
  FSRS_DEFAULT_RELEARNING_STEPS,
  FSRS_DEFAULT_REQUEST_RETENTION,
  FSRS_DEFAULT_W,
} from "@/lib/fsrs";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const cardStateEnumConst = ["new", "learning", "review", "relearning"] as const;
export const cardStateEnum = pgEnum("card_state", cardStateEnumConst);

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Better Auth tables. Schema is snake_case both in JS and in the DB; the
// camelCase fields Better Auth uses internally (emailVerified, userId, etc.)
// are mapped to these snake_case fields in src/server/auth.ts.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  email_verified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
  ip_address: text("ip_address"),
  user_agent: text("user_agent"),
  user_id: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull(),
  provider_id: text("provider_id").notNull(),
  user_id: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  access_token: text("access_token"),
  refresh_token: text("refresh_token"),
  id_token: text("id_token"),
  access_token_expires_at: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refresh_token_expires_at: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// App tables
export const learningProfiles = pgTable(
  "learning_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    is_default: boolean("is_default").notNull().default(false),
    new_cards_per_day: integer("new_cards_per_day")
      .notNull()
      .default(DEFAULT_NEW_CARDS_PER_DAY),
    max_reviews_per_day: integer("max_reviews_per_day")
      .notNull()
      .default(DEFAULT_MAX_REVIEWS_PER_DAY),
    request_retention: real("request_retention")
      .notNull()
      .default(FSRS_DEFAULT_REQUEST_RETENTION),
    maximum_interval: integer("maximum_interval")
      .notNull()
      .default(FSRS_DEFAULT_MAXIMUM_INTERVAL),
    w: real("w")
      .array()
      .notNull()
      .default(FSRS_DEFAULT_W as number[]),
    enable_fuzz: boolean("enable_fuzz")
      .notNull()
      .default(FSRS_DEFAULT_ENABLE_FUZZ),
    enable_short_term: boolean("enable_short_term")
      .notNull()
      .default(FSRS_DEFAULT_ENABLE_SHORT_TERM),
    learning_steps: text("learning_steps")
      .array()
      .notNull()
      .default(FSRS_DEFAULT_LEARNING_STEPS as string[]),
    relearning_steps: text("relearning_steps")
      .array()
      .notNull()
      .default(FSRS_DEFAULT_RELEARNING_STEPS as string[]),
    last_calibrated_at: timestamp("last_calibrated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("learning_profiles_user_id_is_default_idx").on(
      t.user_id,
      t.is_default,
    ),
  ],
);

export const decks = pgTable(
  "decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    learning_profile_id: uuid("learning_profile_id")
      .notNull()
      .references(() => learningProfiles.id, { onDelete: "restrict" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("decks_user_id_created_at_idx").on(t.user_id, t.created_at)],
);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deck_id: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    due: timestamp("due", { withTimezone: true }).notNull().defaultNow(),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    elapsed_days: integer("elapsed_days").notNull().default(0),
    scheduled_days: integer("scheduled_days").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: cardStateEnum("state").notNull().default("new"),
    learning_steps: integer("learning_steps").notNull().default(0),
    last_review: timestamp("last_review", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("cards_deck_id_due_idx").on(t.deck_id, t.due)],
);

export const cardContents = pgTable("card_contents", {
  id: uuid("id").primaryKey().defaultRandom(),
  card_id: uuid("card_id")
    .notNull()
    .unique()
    .references(() => cards.id, { onDelete: "cascade" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const reviewLogs = pgTable(
  "review_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    card_id: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    state: cardStateEnum("state").notNull(),
    due: timestamp("due", { withTimezone: true }).notNull(),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    scheduled_days: integer("scheduled_days").notNull(),
    learning_steps: integer("learning_steps").notNull(),
    review: timestamp("review", { withTimezone: true }).notNull(),
    duration_ms: integer("duration_ms").notNull(),
    created_at: createdAt(),
  },
  (t) => [index("review_logs_card_id_review_idx").on(t.card_id, t.review)],
);

export type TUser = typeof user.$inferSelect;
export type TDeck = typeof decks.$inferSelect;
export type TCard = typeof cards.$inferSelect;
export type TCardContent = typeof cardContents.$inferSelect;
export type TLearningProfile = typeof learningProfiles.$inferSelect;
export type TReviewLog = typeof reviewLogs.$inferSelect;

export type TCardStateEnum = (typeof cardStateEnumConst)[number];
