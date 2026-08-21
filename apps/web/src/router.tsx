import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

/**
 * The router, and nothing else.
 *
 * No route has a loader: every screen reads the local Zero store, which answers
 * without a round trip, so there is nothing for a route to wait on before it
 * renders and no pending state for the router to show. Navigation is therefore
 * synchronous — which is why creating a deck and landing on it is a single
 * frame rather than a spinner.
 */
export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
