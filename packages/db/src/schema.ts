import {
  ACCESS_ROLES,
  CARD_STATES,
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_NEW_CARDS_PER_DAY,
  FSRS_DEFAULT_ENABLE_FUZZ,
  FSRS_DEFAULT_ENABLE_SHORT_TERM,
  FSRS_DEFAULT_LEARNING_STEPS,
  FSRS_DEFAULT_MAXIMUM_INTERVAL,
  FSRS_DEFAULT_RELEARNING_STEPS,
  FSRS_DEFAULT_REQUEST_RETENTION,
  FSRS_DEFAULT_W,
} from "@lexeme/shared";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// The tuple lives in @lexeme/shared: the Zero schema clients sync and the FSRS
// state mapping spell out the same four values, and all three have to agree.
export const cardStateEnum = pgEnum("card_state", CARD_STATES);
export const accessRoleEnum = pgEnum("access_role", ACCESS_ROLES);

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
  /**
   * The identity provider that vouched for this account, e.g.
   * `https://accounts.google.com`.
   *
   * Better Auth 1.7 looks accounts up by `(issuer, account_id)` rather than
   * `(provider_id, account_id)`. A provider id is a local nickname: whatever
   * the app called it in its config, while an issuer is the party that
   * actually attests to the subject, so two providers configured against the
   * same IdP can no longer be mistaken for one another.
   */
  issuer: text("issuer").notNull(),
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
    /** Null until a calibration pass has actually completed. */
    last_calibrated_at: timestamp("last_calibrated_at", {
      withTimezone: true,
    }),
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
    // Denormalized owner: every synced query scopes by it, so per-user sync
    // filters need user_id on every synced table.
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
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
  (t) => [
    index("cards_deck_id_due_idx").on(t.deck_id, t.due),
    index("cards_user_id_idx").on(t.user_id),
  ],
);

export const reviewLogs = pgTable(
  "review_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    card_id: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    // Denormalized owner, so a review log filters by user without a join.
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
  (t) => [
    index("review_logs_card_id_review_idx").on(t.card_id, t.review),
    index("review_logs_user_id_idx").on(t.user_id),
  ],
);

// Reading data sent by paired e-readers. Synced to the app, so every table
// carries its owner. Ids are minted on the device so a resent outbox entry
// updates the row it already created instead of adding another.

/** A book as one device knows it; `key` is that device's identity for the file. */
export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    authors: text("authors"),
    /** 0..1 */
    progress: real("progress"),
    /** "reading" | "finished" | "abandoned" */
    status: text("status").notNull(),
    pages: integer("pages"),
    last_read_at: timestamp("last_read_at", { withTimezone: true }),
    finished_at: timestamp("finished_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("books_user_id_key_idx").on(t.user_id, t.key)],
);

/** Time spent in one book on one calendar day, in the device's time zone. */
export const readingDays = pgTable(
  "reading_days",
  {
    id: uuid("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    book_id: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD */
    day: text("day").notNull(),
    seconds: integer("seconds").notNull(),
    pages: integer("pages").notNull(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    uniqueIndex("reading_days_book_id_day_idx").on(t.book_id, t.day),
    index("reading_days_user_id_idx").on(t.user_id),
  ],
);

/** One sitting with a book: from the first page turn to the last, with no long pause between. */
export const readingSessions = pgTable(
  "reading_sessions",
  {
    id: uuid("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    book_id: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    started_at: timestamp("started_at", { withTimezone: true }).notNull(),
    ended_at: timestamp("ended_at", { withTimezone: true }).notNull(),
    /** Time actually spent on pages, which leaves out short pauses. */
    seconds: integer("seconds").notNull(),
    pages: integer("pages").notNull(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("reading_sessions_user_id_idx").on(t.user_id),
    index("reading_sessions_book_id_idx").on(t.book_id),
  ],
);

export const highlights = pgTable(
  "highlights",
  {
    id: uuid("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    book_id: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    note: text("note"),
    chapter: text("chapter"),
    page: text("page"),
    highlighted_at: timestamp("highlighted_at", { withTimezone: true }).notNull(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("highlights_user_id_idx").on(t.user_id)],
);

/** A word looked up or added while reading; `card_id` is set once it became a card. */
export const lookups = pgTable(
  "lookups",
  {
    id: uuid("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    book_id: uuid("book_id").references(() => books.id, { onDelete: "set null" }),
    word: text("word").notNull(),
    context: text("context"),
    card_id: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
    looked_up_at: timestamp("looked_up_at", { withTimezone: true }).notNull(),
    created_at: createdAt(),
  },
  (t) => [index("lookups_user_id_idx").on(t.user_id)],
);

/**
 * Books sent from Lexeme to the user's e-readers. The file is in object storage
 * under `storage_key`; a device downloads it and marks it delivered.
 */
export const sentBooks = pgTable(
  "sent_books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    file_name: text("file_name").notNull(),
    content_type: text("content_type").notNull(),
    size_bytes: integer("size_bytes").notNull(),
    storage_key: text("storage_key").notNull(),
    delivered_at: timestamp("delivered_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("sent_books_user_id_idx").on(t.user_id)],
);

// API keys and connected apps. Server-only: never added to the zero_data
// publication, so token hashes stay out of client replicas.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: accessRoleEnum("role").notNull(),
    token_prefix: text("token_prefix").notNull(),
    token_hash: text("token_hash").notNull().unique(),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("api_keys_user_id_name_idx").on(t.user_id, t.name)],
);

export const oauthClients = pgTable("oauth_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  redirect_uris: text("redirect_uris").array().notNull(),
  created_at: createdAt(),
});

export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code_hash: text("code_hash").notNull().unique(),
  client_id: uuid("client_id")
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  user_id: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: accessRoleEnum("role").notNull(),
  redirect_uri: text("redirect_uri").notNull(),
  code_challenge: text("code_challenge").notNull(),
  resource: text("resource").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  created_at: createdAt(),
});

/** One app's access to one account. Revoking deletes it and its tokens. */
export const oauthGrants = pgTable(
  "oauth_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    client_id: uuid("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: accessRoleEnum("role").notNull(),
    resource: text("resource").notNull(),
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("oauth_grants_user_id_idx").on(t.user_id)],
);

export const oauthTokenKindEnum = pgEnum("oauth_token_kind", ["access", "refresh"]);

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grant_id: uuid("grant_id")
      .notNull()
      .references(() => oauthGrants.id, { onDelete: "cascade" }),
    kind: oauthTokenKindEnum("kind").notNull(),
    token_hash: text("token_hash").notNull().unique(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set when a refresh token is exchanged; presenting it again revokes the grant. */
    used_at: timestamp("used_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("oauth_tokens_grant_id_idx").on(t.grant_id)],
);

/**
 * A device asking to be paired. The device shows `user_code` (as text and a QR
 * code), someone signed in approves it on the web, and the device's next poll
 * with its secret turns the approval into an API key. Server-only.
 */
export const devicePairings = pgTable("device_pairings", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_code: text("user_code").notNull().unique(),
  poll_token_hash: text("poll_token_hash").notNull().unique(),
  device_name: text("device_name").notNull(),
  user_id: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  api_key_id: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  approved_at: timestamp("approved_at", { withTimezone: true }),
  claimed_at: timestamp("claimed_at", { withTimezone: true }),
  created_at: createdAt(),
});

export type TUser = typeof user.$inferSelect;
export type TDeck = typeof decks.$inferSelect;
export type TCard = typeof cards.$inferSelect;
export type TLearningProfile = typeof learningProfiles.$inferSelect;
export type TReviewLog = typeof reviewLogs.$inferSelect;
export type TSentBook = typeof sentBooks.$inferSelect;

