import { Hono } from "hono";

import { finishReadingUpload } from "../reading-uploads.ts";

/** The second half of upload-reading's command: the file is in storage, so apply it. The signed token is the authorization. */
export const readingUploadRoutes = new Hono().post("/:token", async (c) => c.json(await finishReadingUpload(c.req.param("token"))));
