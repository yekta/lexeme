/**
 * Cross-origin isolation (see vite.config.ts) drops remote images that lack a
 * CORP header, so route them through our own origin.
 */
export function proxiedImageUrl(src: string) {
  if (!/^https?:\/\//i.test(src)) return src;
  return `/api/avatar?url=${encodeURIComponent(src)}`;
}
