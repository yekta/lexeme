import { useEffect, useState } from "react";

import { SETTLE_BUDGET } from "@/lib/settle";

/**
 * What the app asks for.
 *
 * Same-origin and already in the bundle's `public/`, so this adds no endpoint
 * to the API, no CORS to configure, and nothing to deploy. It is the app's own
 * static host answering, which is a fact about the network and nothing else.
 */
const PROBE_PATH = "/favicon.ico";

/**
 * Whether this device can reach the network at all.
 *
 * `navigator.onLine` answers this only when it feels like it. Going false is a
 * fact and `useOnline` acts on it instantly, but staying true is not a claim
 * about connectivity: it means some interface has a route, which is still so
 * with a Docker bridge up, a VPN adapter attached, or wifi associated to a
 * router with nothing behind it. On those machines turning the wifi off fires
 * no `offline` event, and there is no second browser API to ask.
 *
 * So the only way left to learn the network is gone is to try to use it. This
 * asks for one small file the app already ships and reads the outcome:
 *
 *   any response   the request travelled, so there is a network. A 404 or a
 *                  500 settles the question exactly as well as a 200 does.
 *   any failure    it did not, so there is not.
 *
 * `active` keeps this dormant, which is almost always. Nothing is ever sent
 * while sync is healthy: the request exists only to explain a connection that
 * has already gone wrong.
 */
export function useReachable(active: boolean): boolean | null {
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    // Dormant again, and the old verdict expires with it. Holding on to "no
    // network" across a connection that has since recovered is worse than
    // holding no opinion at all.
    if (!active) {
      setReachable(null);
      return;
    }

    let live = true;
    let inFlight: AbortController | undefined;

    async function probe() {
      const controller = new AbortController();
      inFlight?.abort();
      inFlight = controller;
      // A network that is simply gone fails in milliseconds. One that accepts
      // the request and then says nothing (a captive portal, an interface up
      // with nothing behind it) would otherwise never answer, and never has to
      // become an answer at some point.
      const timer = setTimeout(() => controller.abort(), SETTLE_BUDGET.probeTimeout);
      try {
        // `no-store` is the entire request: a favicon served out of the cache
        // would prove nothing about the network, which is the only thing being
        // asked here.
        await fetch(PROBE_PATH, { cache: "no-store", signal: controller.signal });
        if (live && inFlight === controller) setReachable(true);
      } catch {
        // Only this probe's own failure counts. One aborted because a newer
        // probe replaced it proves nothing, and reading that as "no network"
        // would be the app inventing an outage out of its own bookkeeping.
        if (live && inFlight === controller) setReachable(false);
      } finally {
        clearTimeout(timer);
      }
    }

    void probe();
    // An outage lasts as long as it lasts, and the answer can change under it:
    // wifi comes back while our sync host is still down, and the banner has to
    // stop blaming the user's router.
    const interval = setInterval(() => void probe(), SETTLE_BUDGET.probeInterval);

    return () => {
      live = false;
      inFlight?.abort();
      clearInterval(interval);
    };
  }, [active]);

  return reachable;
}
