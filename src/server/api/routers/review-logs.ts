import { eq } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { reviewLogs } from "@/server/db/schema";

// Read-only: logs are written exclusively through cards.rate. Full-table
// fetch is fine at flashcard scale; if it ever gets heavy, this is the place
// for a created_at cursor (remember card deletes cascade into this table, so
// a naive insert-only cursor would miss removals).
export const reviewLogsRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(reviewLogs)
      .where(eq(reviewLogs.user_id, ctx.session.user.id)),
  ),
});
