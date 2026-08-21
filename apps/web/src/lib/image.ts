import { apiUrl } from "@/lib/api";

/**
 * Cross-origin isolation (`require-corp`, see vite.config.ts and
 * public/_headers) drops remote images that carry no CORP header, which is
 * every avatar on googleusercontent.com. The API re-serves them with one.
 *
 * Absolute, not origin-relative: the API is a different host from the app in
 * production, so a relative path would ask Cloudflare Pages for an endpoint it
 * does not have and get index.html back with a 200.
 */
export function proxiedImageUrl(src: string) {
  if (!/^https?:\/\//i.test(src)) return src;
  return apiUrl(`/api/avatar?url=${encodeURIComponent(src)}`);
}
