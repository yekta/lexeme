CREATE TABLE "books" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"authors" text,
	"progress" real,
	"status" text NOT NULL,
	"pages" integer,
	"last_read_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_code" text NOT NULL,
	"poll_token_hash" text NOT NULL,
	"device_name" text NOT NULL,
	"user_id" text,
	"api_key_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_pairings_user_code_unique" UNIQUE("user_code"),
	CONSTRAINT "device_pairings_poll_token_hash_unique" UNIQUE("poll_token_hash")
);
--> statement-breakpoint
CREATE TABLE "highlights" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" uuid NOT NULL,
	"text" text NOT NULL,
	"note" text,
	"chapter" text,
	"page" text,
	"highlighted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lookups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" uuid,
	"word" text NOT NULL,
	"context" text,
	"card_id" uuid,
	"looked_up_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" uuid NOT NULL,
	"day" text NOT NULL,
	"seconds" integer NOT NULL,
	"pages" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookups" ADD CONSTRAINT "lookups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookups" ADD CONSTRAINT "lookups_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookups" ADD CONSTRAINT "lookups_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_days" ADD CONSTRAINT "reading_days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_days" ADD CONSTRAINT "reading_days_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "books_user_id_key_idx" ON "books" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "highlights_user_id_idx" ON "highlights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lookups_user_id_idx" ON "lookups" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reading_days_book_id_day_idx" ON "reading_days" USING btree ("book_id","day");--> statement-breakpoint
CREATE INDEX "reading_days_user_id_idx" ON "reading_days" USING btree ("user_id");