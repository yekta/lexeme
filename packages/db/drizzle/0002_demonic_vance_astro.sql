ALTER TABLE "learning_profiles" ALTER COLUMN "last_calibrated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "learning_profiles" ALTER COLUMN "last_calibrated_at" DROP NOT NULL;