import { cardsRouter } from "@/server/api/routers/cards";
import { decksRouter } from "@/server/api/routers/decks";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

export const appRouter = createTRPCRouter({
  decks: decksRouter,
  cards: cardsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
