-- Drop triggers (must come before dropping the functions they reference)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;


DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;


DROP TRIGGER IF EXISTS set_updated_at ON public."users";


DROP TRIGGER IF EXISTS set_updated_at ON public."decks";


DROP TRIGGER IF EXISTS set_updated_at ON public."cards";


DROP TRIGGER IF EXISTS set_updated_at ON public."card_contents";


DROP TRIGGER IF EXISTS set_updated_at ON public."learning_profiles";


-- Drop functions
DROP FUNCTION IF EXISTS public.handle_new_user ();


DROP FUNCTION IF EXISTS public.handle_user_deleted ();


DROP FUNCTION IF EXISTS public.set_updated_at ();
