CREATE TABLE "learning_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"new_cards_per_day" integer DEFAULT 20 NOT NULL,
	"max_reviews_per_day" integer DEFAULT 200 NOT NULL,
	"request_retention" real DEFAULT 0.9 NOT NULL,
	"maximum_interval" integer DEFAULT 36500 NOT NULL,
	"w" real[] DEFAULT '{0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542}' NOT NULL,
	"enable_fuzz" boolean DEFAULT false NOT NULL,
	"enable_short_term" boolean DEFAULT true NOT NULL,
	"learning_steps" text[] DEFAULT '{"1m","10m"}' NOT NULL,
	"relearning_steps" text[] DEFAULT '{"10m"}' NOT NULL,
	"last_calibrated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "user_settings" CASCADE;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "learning_profile_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_profiles" ADD CONSTRAINT "learning_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_profiles_user_id_is_default_idx" ON "learning_profiles" USING btree ("user_id","is_default");--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_learning_profile_id_learning_profiles_id_fk" FOREIGN KEY ("learning_profile_id") REFERENCES "public"."learning_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" DROP COLUMN "new_cards_per_day";--> statement-breakpoint
ALTER TABLE "decks" DROP COLUMN "max_reviews_per_day";