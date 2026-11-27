ALTER TABLE "books" ADD COLUMN "locations" integer;--> statement-breakpoint
ALTER TABLE "highlights" ADD COLUMN "location" integer;--> statement-breakpoint
ALTER TABLE "reading_goals" ADD COLUMN "position_unit" text DEFAULT 'page' NOT NULL;