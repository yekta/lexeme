ALTER TABLE "decks" ADD COLUMN "new_cards_per_day" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "max_reviews_per_day" integer DEFAULT 200 NOT NULL;