-- Drop policies
DROP POLICY IF EXISTS "Users can CRUD own decks" ON decks;


DROP POLICY IF EXISTS "Users can CRUD own cards" ON cards;


DROP POLICY IF EXISTS "Users can CRUD own card_contents" ON card_contents;


DROP POLICY IF EXISTS "Users can read own learning profiles" ON learning_profiles;


DROP POLICY IF EXISTS "Users can insert own learning profiles" ON learning_profiles;


DROP POLICY IF EXISTS "Users can update own learning profiles" ON learning_profiles;


DROP POLICY IF EXISTS "Users can delete own non-default learning profiles" ON learning_profiles;


DROP POLICY IF EXISTS "Users can insert own review logs" ON review_logs;


DROP POLICY IF EXISTS "Users can read own review logs" ON review_logs;


-- Drop unique index for default learning profile
DROP INDEX IF EXISTS one_default_per_user;