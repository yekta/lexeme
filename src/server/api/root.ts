import { cardsRouter } from "@/server/api/routers/cards";
import { decksRouter } from "@/server/api/routers/decks";
import { learningProfilesRouter } from "@/server/api/routers/learning-profiles";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

export const appRouter = createTRPCRouter({
  decks: decksRouter,
  cards: cardsRouter,
  learningProfiles: learningProfilesRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
