/** How places in a book are given: the e-reader's page, or the Kindle's location. */
export const POSITION_UNITS = ["page", "location"] as const;

export type TPositionUnit = (typeof POSITION_UNITS)[number];

/** 1514 as "1,514", as the Kindle writes locations. */
export function formatLocation(location: number) {
  return location.toLocaleString("en-US");
}
