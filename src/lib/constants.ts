import { z } from "zod";

export const appLocale = "en-US";
export const AvailableThemesEnum = z.enum(["light", "dark", "system"]);
export type TTheme = z.infer<typeof AvailableThemesEnum>;
export const DEFAULT_THEME: TTheme = "system";
export const DEFAULT_NON_SYSTEM_THEME: TTheme = "light";

// Max already-suggested fronts the client sends back with a generateCard
// call (and the server accepts) so repeated suggestions don't repeat.
export const GENERATE_CARD_EXCLUDE_FRONTS_LIMIT = 50;

export const DEFAULT_NEW_CARDS_PER_DAY = 20;
export const DEFAULT_MAX_REVIEWS_PER_DAY = 200;
export const SIGN_IN_PATHNAME = "/sign-in";
export const AUTH_PATHNAME = "/auth";
