/** Number and date formatting locale, for anything either app renders. */
export const appLocale = "en-US";

/**
 * Max already-suggested fronts the client sends back with a generate-card call,
 * and the ceiling the server validates that list against — one number so the
 * two can never disagree about what a valid request is.
 */
export const GENERATE_CARD_EXCLUDE_FRONTS_LIMIT = 50;

/**
 * Daily study limits for a learning profile. The column defaults in
 * `@lexeme/db` and the bucketing fallbacks in `study-buckets.ts` both come from
 * here, so a profile row and a profile-less computation agree.
 */
export const DEFAULT_NEW_CARDS_PER_DAY = 20;
export const DEFAULT_MAX_REVIEWS_PER_DAY = 200;
