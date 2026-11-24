import { McpServer, createMcpHandler, type CallToolResult } from "@modelcontextprotocol/server";
import { roleAllows } from "@lexeme/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { operations, type TOperation } from "../api/operations.ts";
import { authenticateApiKey, authenticateOAuthAccessToken, type TCaller } from "../caller.ts";
import { ApiError } from "../errors.ts";
import { bearerToken } from "../tokens.ts";
import { RESOURCE_METADATA_URL } from "../urls.ts";

const INSTRUCTIONS = `Lexeme is a spaced repetition app. Cards live in decks; each card has a front (the prompt) and a back (the answer). Each deck uses a learning profile that sets its daily limits and scheduling.

Call whoami first: it tells you the role of this connection. A viewer can only read, an editor can also create, change, import and review, and an admin can also delete. Tools above the role are not offered.

Ids come from list-decks, list-cards and list-learning-profiles. Before adding cards, search the deck with list-cards to avoid duplicates. Keep cards short and atomic: one fact per card. generate-card and generate-back write cards in the style of the deck's existing ones but save nothing; add the ones the user keeps with add-cards.

To quiz the user, call get-study-queue, show one card's front, wait for their answer, show the back, then record how it went with review-card. Rate honestly: again when they forgot, hard when it was a struggle, good when they recalled it, easy when it was effortless.

Reading data comes from the user's e-readers: list-books, list-reading-sessions, list-highlights and list-lookups. Deleting it here doesn't delete it from the e-reader.

Everything you change appears in the user's Lexeme apps right away.`;

function annotations(op: TOperation) {
  return {
    title: op.title,
    readOnlyHint: op.role === "viewer",
    destructiveHint: op.role === "admin",
    openWorldHint: false,
  };
}

function textResult(value: unknown, isError = false): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError };
}

async function callTool(op: TOperation, caller: TCaller, args: unknown): Promise<CallToolResult> {
  console.info(`[mcp] tool=${op.name} user=${caller.userId} via=${caller.via}`);
  try {
    return textResult(await op.run(caller, args as Record<string, unknown>));
  } catch (error) {
    if (error instanceof ApiError) return textResult({ error: error.message }, true);
    console.error(`[mcp] ${op.name} failed:`, error);
    return textResult({ error: "Something went wrong. Please try again." }, true);
  }
}

function buildServer(caller: TCaller) {
  const server = new McpServer(
    { name: "lexeme", title: "Lexeme", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );
  for (const op of operations) {
    if (!roleAllows(caller.role, op.role)) continue;
    server.registerTool(
      op.name,
      {
        title: op.title,
        description: op.description,
        inputSchema: op.input,
        annotations: annotations(op),
      },
      (args) => callTool(op, caller, args),
    );
  }
  return server;
}

const handler = createMcpHandler(({ authInfo }) => buildServer(authInfo?.extra?.caller as TCaller));

async function authenticate(token: string): Promise<TCaller | undefined> {
  return (await authenticateApiKey(token)) ?? (await authenticateOAuthAccessToken(token));
}

/**
 * Accepts an API key or an OAuth access token. A 401 points at the resource
 * metadata, which is how clients like claude.ai discover the OAuth flow.
 */
export const mcpRoutes = new Hono()
  .use(cors({ origin: "*", exposeHeaders: ["WWW-Authenticate", "Mcp-Session-Id"] }))
  .all("/", async (c) => {
    const token = bearerToken(c.req.raw);
    const caller = token ? await authenticate(token) : undefined;
    if (!token || !caller) {
      const challenge = token
        ? `Bearer error="invalid_token", resource_metadata="${RESOURCE_METADATA_URL}"`
        : `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`;
      c.header("WWW-Authenticate", challenge);
      return c.json({ error: "invalid_token", error_description: "Sign in to Lexeme." }, 401);
    }

    return handler.fetch(c.req.raw, {
      authInfo: { token, clientId: caller.via, scopes: [caller.role], extra: { caller } },
    });
  });
