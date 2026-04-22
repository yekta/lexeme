-- Atomic card creation: insert into cards and card_contents in one transaction
-- so clients can't leave a card without its content row. Ownership is
-- enforced via the standard RLS policies on both tables.
CREATE OR REPLACE FUNCTION public.create_card_with_content (
  p_deck_id uuid,
  p_front text,
  p_back text
) RETURNS uuid AS $$
DECLARE
  new_card_id uuid;
BEGIN
  INSERT INTO public."cards" ("deck_id")
  VALUES (p_deck_id)
  RETURNING "id" INTO new_card_id;

  INSERT INTO public."card_contents" ("card_id", "front", "back")
  VALUES (new_card_id, p_front, p_back);

  RETURN new_card_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
