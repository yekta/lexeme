DROP TABLE "reading_days" CASCADE;--> statement-breakpoint
DROP TABLE "reading_sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "series" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "review" text;--> statement-breakpoint
ALTER TABLE "highlights" ADD COLUMN "kind" text DEFAULT 'highlight' NOT NULL;