-- Add registration_number to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS registration_number text;

-- Allow users to update their own profile information
DROP POLICY IF EXISTS "users_update_own_profile" ON public.users;
CREATE POLICY "users_update_own_profile" ON public.users
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
