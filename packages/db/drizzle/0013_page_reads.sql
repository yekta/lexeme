CREATE TABLE "page_reads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"total_pages" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_reads" ADD CONSTRAINT "page_reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_reads" ADD CONSTRAINT "page_reads_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_reads_user_id_idx" ON "page_reads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "page_reads_book_id_idx" ON "page_reads" USING btree ("book_id");