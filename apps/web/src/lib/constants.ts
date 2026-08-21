import { z } from "zod";

/**
 * Constants that only mean something in a browser. Everything the server also
 * needs — the daily study limits, the formatting locale, the suggestion cap —
 * lives in `@lexeme/shared`, where both ends read one copy.
 */

export const AvailableThemesEnum = z.enum(["light", "dark", "system"]);
export type TTheme = z.infer<typeof AvailableThemesEnum>;

/**
 * Kept in step with the pre-paint script in `index.html`, which applies the
 * stored theme before React runs. Change one and change the other.
 */
export const DEFAULT_THEME: TTheme = "system";
export const DEFAULT_NON_SYSTEM_THEME: TTheme = "light";

export const SIGN_IN_PATHNAME = "/sign-in";
