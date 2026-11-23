-- "Add to Lexeme" used to record a second look-up beside the one the device made.
-- Keep the device's look-up, with the sentence the copy carried, and drop the copy.
UPDATE "lookups" AS "looked"
SET "context" = "added"."context"
FROM "lookups" AS "added"
WHERE "added"."card_id" IS NOT NULL
  AND "looked"."card_id" IS NULL
  AND "looked"."id" <> "added"."id"
  AND "looked"."user_id" = "added"."user_id"
  AND lower("looked"."word") = lower("added"."word")
  AND ("looked"."book_id" IS NULL OR "added"."book_id" IS NULL OR "looked"."book_id" = "added"."book_id")
  AND abs(extract(epoch FROM "looked"."looked_up_at" - "added"."looked_up_at")) <= 600
  AND "looked"."context" IS NULL;
--> statement-breakpoint
DELETE FROM "lookups" AS "added"
USING "lookups" AS "looked"
WHERE "added"."card_id" IS NOT NULL
  AND "looked"."card_id" IS NULL
  AND "looked"."id" <> "added"."id"
  AND "looked"."user_id" = "added"."user_id"
  AND lower("looked"."word") = lower("added"."word")
  AND ("looked"."book_id" IS NULL OR "added"."book_id" IS NULL OR "looked"."book_id" = "added"."book_id")
  AND abs(extract(epoch FROM "looked"."looked_up_at" - "added"."looked_up_at")) <= 600;
