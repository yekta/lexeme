ALTER TABLE "card_contents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "card_contents" CASCADE;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "front" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "back" text NOT NULL;--> statement-breakpoint
ALTER TABLE "review_logs" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_user_id_idx" ON "cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "review_logs_user_id_idx" ON "review_logs" USING btree ("user_id");