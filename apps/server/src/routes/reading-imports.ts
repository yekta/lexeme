import { Hono } from "hono";

import { finishReadingImport } from "../reading-imports.ts";

/** The second half of import-reading's command: the file is in storage, so apply it. The signed token is the authorization. */
export const readingImportRoutes = new Hono().post("/:token", async (c) => c.json(await finishReadingImport(c.req.param("token"))));
