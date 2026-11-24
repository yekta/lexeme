import { generateBackRequest, generateCardRequest } from "@lexeme/contracts";
import { Hono } from "hono";

import { requireDeck } from "../access.ts";
import { generateBackForDeck, generateCardForDeck } from "../ai/generate-card.ts";
import { parseBody, requireUserId } from "../http.ts";

/** The web app's model calls; API keys and MCP reach the same ones through `api/operations.ts`. */
export const cardRoutes = new Hono()
  .post("/generate-back", async (c) => {
    const userId = await requireUserId(c);
    const input = await parseBody(c, generateBackRequest);
    await requireDeck({ deckId: input.deckId, userId });

    return c.json({ back: await generateBackForDeck(input) });
  })
  .post("/generate-card", async (c) => {
    const userId = await requireUserId(c);
    const input = await parseBody(c, generateCardRequest);
    await requireDeck({ deckId: input.deckId, userId });

    return c.json(
      await generateCardForDeck({ deckId: input.deckId, excludeFronts: input.excludeFronts }),
    );
  });
