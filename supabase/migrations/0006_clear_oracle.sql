-- Drop RLS policies that reference columns being removed so the column drops
-- below don't fail. These get recreated (with the new deck-join shape) by
-- re-applying supabase/policies.sql after this migration runs.
DROP POLICY IF EXISTS "Users can CRUD own cards" ON "cards";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can insert own review logs" ON "review_logs";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can read own review logs" ON "review_logs";--> statement-breakpoint
CREATE TABLE "card_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_contents_card_id_unique" UNIQUE("card_id")
);
--> statement-breakpoint
ALTER TABLE "card_contents" ADD CONSTRAINT "card_contents_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "card_contents" ("card_id", "front", "back", "created_at", "updated_at")
SELECT "id", "front", "back", "created_at", "updated_at" FROM "cards";--> statement-breakpoint
ALTER TABLE "cards" DROP CONSTRAINT "cards_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "cards_deck_id_user_id_due_idx";--> statement-breakpoint
CREATE INDEX "cards_deck_id_due_idx" ON "cards" USING btree ("deck_id","due");--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "front";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "back";