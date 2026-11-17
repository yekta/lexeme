import { roleAllows } from "@lexeme/shared";
import { Hono, type Context } from "hono";
import { z } from "zod";

import { authenticateApiKey, type TCaller } from "../caller.ts";
import { ApiError } from "../errors.ts";
import { operations, parseOperationInput, type TOperation } from "../api/operations.ts";
import { bearerToken } from "../tokens.ts";

async function requireCaller(c: Context): Promise<TCaller> {
  const token = bearerToken(c.req.raw);
  const caller = token ? await authenticateApiKey(token) : undefined;
  if (!caller) {
    throw new ApiError(
      "UNAUTHORIZED",
      "Pass a valid API key as `Authorization: Bearer lx_...`. Create one in Lexeme under API Keys.",
    );
  }
  return caller;
}

async function readInput(c: Context, op: TOperation): Promise<Record<string, unknown>> {
  const fromBody = op.method === "POST" || op.method === "PATCH";
  let body: unknown = {};
  if (fromBody) {
    body = await c.req.json().catch(() => {
      throw new ApiError("BAD_REQUEST", "Expected a JSON body.");
    });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Expected a JSON object.");
  }
  return { ...c.req.query(), ...body, ...c.req.param() };
}

function describe(op: TOperation) {
  return {
    name: op.name,
    method: op.method,
    path: `/api/v1${op.path}`,
    description: op.description,
    role: op.role,
    input: z.toJSONSchema(op.input, { io: "input" }),
  };
}

/** The public REST API: the same operations as the MCP tools, authenticated with an API key. */
export const v1Routes = new Hono().get("/", (c) =>
  c.json({ endpoints: operations.map(describe) }),
);

for (const op of operations) {
  v1Routes.on(op.method, op.path, async (c) => {
    const caller = await requireCaller(c);
    if (!roleAllows(caller.role, op.role)) {
      throw new ApiError(
        "FORBIDDEN",
        `This key has the ${caller.role} role; ${op.name} needs ${op.role}.`,
      );
    }
    const input = parseOperationInput(op, await readInput(c, op));
    return c.json(await op.run(caller, input));
  });
}
