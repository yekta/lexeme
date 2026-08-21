-- Better Auth 1.7 looks accounts up by `(issuer, account_id)` instead of
-- `(provider_id, account_id)`, so `account` gains an `issuer` column.
--
-- drizzle-kit generates this as a single `ADD COLUMN ... NOT NULL`, which
-- cannot work on a table that already has rows: Postgres has no value to put in
-- them and rejects the statement outright. Three steps instead, in one implicit
-- transaction, add it nullable, fill it in, then constrain it, so the table is
-- never briefly in a state where a sign-in could read a null issuer.
--
-- The backfill is exact rather than a guess. `google` is the only provider this
-- app configures (emailAndPassword is off), and Better Auth's Google provider
-- declares `accountIssuer: "https://accounts.google.com"` as a literal: the
-- same value that showed up in the failing query's parameters. Any row that
-- somehow is not google keeps `provider_id` as its issuer, which is what Better
-- Auth's own fallback (`createOAuthAccountIssuer`) derives an issuer from, so
-- such a row stays addressable rather than blocking the migration.
ALTER TABLE "account" ADD COLUMN "issuer" text;
--> statement-breakpoint
UPDATE "account"
SET "issuer" = CASE
  WHEN "provider_id" = 'google' THEN 'https://accounts.google.com'
  ELSE "provider_id"
END
WHERE "issuer" IS NULL;
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;
