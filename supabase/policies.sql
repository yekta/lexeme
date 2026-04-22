-- Enable RLS
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;


ALTER TABLE cards ENABLE ROW LEVEL SECURITY;


ALTER TABLE card_contents ENABLE ROW LEVEL SECURITY;


ALTER TABLE learning_profiles ENABLE ROW LEVEL SECURITY;


ALTER TABLE review_logs ENABLE ROW LEVEL SECURITY;


-- Only one default learning profile per user
CREATE UNIQUE INDEX one_default_per_user ON learning_profiles (user_id) WHERE is_default = true;


-- Decks
CREATE POLICY "Users can CRUD own decks" ON decks FOR ALL USING (auth.uid () = user_id)
WITH
  CHECK (auth.uid () = user_id);


-- Cards (ownership via deck)
CREATE POLICY "Users can CRUD own cards" ON cards FOR ALL USING (
  auth.uid () = (
    SELECT
      user_id
    FROM
      decks
    WHERE
      id = deck_id
  )
)
WITH
  CHECK (
    auth.uid () = (
      SELECT
        user_id
      FROM
        decks
      WHERE
        id = deck_id
    )
  );


-- Card contents (ownership via card -> deck)
CREATE POLICY "Users can CRUD own card_contents" ON card_contents FOR ALL USING (
  auth.uid () = (
    SELECT
      d.user_id
    FROM
      cards c
      JOIN decks d ON d.id = c.deck_id
    WHERE
      c.id = card_id
  )
)
WITH
  CHECK (
    auth.uid () = (
      SELECT
        d.user_id
      FROM
        cards c
        JOIN decks d ON d.id = c.deck_id
      WHERE
        c.id = card_id
    )
  );


-- Learning Profiles
CREATE POLICY "Users can read own learning profiles" ON learning_profiles FOR
SELECT
  USING (auth.uid () = user_id);


CREATE POLICY "Users can insert own learning profiles" ON learning_profiles FOR INSERT
WITH
  CHECK (auth.uid () = user_id);


CREATE POLICY "Users can update own learning profiles" ON learning_profiles
FOR UPDATE
  USING (auth.uid () = user_id)
WITH
  CHECK (auth.uid () = user_id);


CREATE POLICY "Users can delete own non-default learning profiles" ON learning_profiles
FOR DELETE
  USING (auth.uid () = user_id AND is_default = false);


-- Review Logs (ownership via card -> deck)
CREATE POLICY "Users can insert own review logs" ON review_logs FOR INSERT
WITH
  CHECK (
    auth.uid () = (
      SELECT
        d.user_id
      FROM
        cards c
        JOIN decks d ON d.id = c.deck_id
      WHERE
        c.id = card_id
    )
  );


CREATE POLICY "Users can read own review logs" ON review_logs FOR
SELECT
  USING (
    auth.uid () = (
      SELECT
        d.user_id
      FROM
        cards c
        JOIN decks d ON d.id = c.deck_id
      WHERE
        c.id = card_id
    )
  );
