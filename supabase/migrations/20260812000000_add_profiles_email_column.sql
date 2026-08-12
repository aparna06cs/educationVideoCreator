-- private.handle_new_user() (see 20260805074724_...) has always inserted
-- (id, email) into public.profiles, but the profiles table was never given
-- an email column — every signup has been failing with "Database error
-- saving new user" as a result. Add the column the trigger already expects.
ALTER TABLE public.profiles
  ADD COLUMN email text;
