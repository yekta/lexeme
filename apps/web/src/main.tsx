import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/styles/globals.css";
import { getRouter } from "@/router";

/**
 * The whole entry point.
 *
 * This app used to be server-rendered: TanStack Start owned the document, every
 * data screen was wrapped in `ClientOnly` so it would not run during SSR, and
 * the first client render deliberately painted a placeholder to match what the
 * server had sent. All of that existed to keep hydration honest, and all of it
 * cost a frame of something-that-is-not-the-app on every load.
 *
 * It ships as a static bundle now. There is no server render to match, so there
 * is no hydration, so there is nothing to hold back: the first paint is the
 * app, drawn from the local store.
 */
const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
