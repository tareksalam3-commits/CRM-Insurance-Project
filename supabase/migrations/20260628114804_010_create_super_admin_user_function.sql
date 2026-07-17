-- Function to create a user in both auth.users and public.users
-- Called from Edge Function to bypass RLS
CREATE OR REPLACE FUNCTION create_user_with_auth(
    p_email text,
    p_password text,
    p_name text,
    p_role user_role,
    p_phone text DEFAULT NULL,
    p_manager_id uuid DEFAULT NULL,
    p_target decimal DEFAULT 0
) RETURNS uuid AS $$
DECLARE
    v_user_id uuid;
BEGIN
    -- Only super_admin and development_manager can call this
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() 
        AND role IN ('super_admin', 'development_manager')
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    -- Generate UUID for the new user
    v_user_id := gen_random_uuid();
    
    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle new auth user registration
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Only insert if not already exists (for manually created users)
    INSERT INTO public.users (id, email, name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'agent')
    )
    ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users to create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_auth_user();

-- Function to transfer user to another manager
CREATE OR REPLACE FUNCTION transfer_user(
    p_user_id uuid,
    p_new_manager_id uuid
) RETURNS void AS $$
DECLARE
    v_old_manager_id uuid;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() 
        AND role IN ('super_admin', 'development_manager')
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    SELECT manager_id INTO v_old_manager_id FROM users WHERE id = p_user_id;
    
    UPDATE users SET manager_id = p_new_manager_id, updated_at = now()
    WHERE id = p_user_id;
    
    PERFORM log_activity(
        'user_transfer'::action_type,
        'user',
        p_user_id,
        jsonb_build_object('manager_id', v_old_manager_id),
        jsonb_build_object('manager_id', p_new_manager_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to suspend/reactivate policy
CREATE OR REPLACE FUNCTION suspend_policy(p_policy_id uuid, p_reason text)
RETURNS void AS $$
BEGIN
    UPDATE policies 
    SET status = 'suspended',
        suspended_at = now(),
        suspended_reason = p_reason,
        updated_at = now()
    WHERE id = p_policy_id
    AND owner_id IN (SELECT unnest(get_user_subtree(auth.uid())));
    
    PERFORM log_activity('policy_suspend'::action_type, 'policy', p_policy_id,
        NULL, jsonb_build_object('reason', p_reason));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reactivate_policy(p_policy_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE policies 
    SET status = 'active',
        suspended_at = NULL,
        suspended_reason = NULL,
        updated_at = now()
    WHERE id = p_policy_id
    AND owner_id IN (SELECT unnest(get_user_subtree(auth.uid())));
    
    PERFORM log_activity('policy_reactivate'::action_type, 'policy', p_policy_id, NULL, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
;
