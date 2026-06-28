/*
# Create Users Table with Hierarchical Structure

1. New Tables
   - `users` - Extended user profiles beyond auth.users with hierarchical structure
   - `id` (uuid, primary key, references auth.users)
   - `email` (text, unique)
   - `phone` (text)
   - `name` (text, not null)
   - `role` (enum: super_admin, development_manager, general_supervisor, supervisor, group_leader, agent, premium_agent)
   - `manager_id` (uuid, self-reference for hierarchy)
   - `target` (decimal, monthly target amount)
   - `is_active` (boolean, default true)
   - `avatar_url` (text)
   - `last_login` (timestamp)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

2. Hierarchy Levels
   - Level 1: super_admin
   - Level 2: development_manager
   - Level 3: general_supervisor
   - Level 4: supervisor
   - Level 5: group_leader
   - Level 6: agent, premium_agent

3. Security
   - Enable RLS on `users`
   - Users can read their own data and data of users below them in hierarchy
   - Only super_admin and development_manager can insert/update/delete users

4. Important Notes
   - Hierarchy is enforced through manager_id self-reference
   - Role determines access level in the system
   - Each user inherits visibility of all users below them in the tree
*/

-- Create enum for user roles
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'super_admin',
        'development_manager',
        'general_supervisor',
        'supervisor',
        'group_leader',
        'agent',
        'premium_agent'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text UNIQUE NOT NULL,
    phone text,
    name text NOT NULL,
    role user_role NOT NULL DEFAULT 'agent',
    manager_id uuid REFERENCES users(id) ON DELETE SET NULL,
    target decimal(12,2) DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    avatar_url text,
    last_login timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Helper function to get user hierarchy level
CREATE OR REPLACE FUNCTION get_role_level(r user_role) RETURNS int AS $$
BEGIN
    RETURN CASE r
        WHEN 'super_admin' THEN 1
        WHEN 'development_manager' THEN 2
        WHEN 'general_supervisor' THEN 3
        WHEN 'supervisor' THEN 4
        WHEN 'group_leader' THEN 5
        WHEN 'agent' THEN 6
        WHEN 'premium_agent' THEN 6
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function to check if a user is under another in hierarchy
CREATE OR REPLACE FUNCTION is_under_or_equal(check_user_id uuid, ancestor_id uuid) RETURNS boolean AS $$
DECLARE
    current_id uuid;
BEGIN
    IF check_user_id = ancestor_id THEN
        RETURN true;
    END IF;
    
    current_id := check_user_id;
    
    WHILE current_id IS NOT NULL LOOP
        SELECT manager_id INTO current_id FROM users WHERE id = current_id;
        IF current_id = ancestor_id THEN
            RETURN true;
        END IF;
    END LOOP;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function to get all user IDs under a specific user (including self)
CREATE OR REPLACE FUNCTION get_user_subtree(user_id uuid) RETURNS uuid[] AS $$
DECLARE
    result uuid[];
BEGIN
    WITH RECURSIVE user_tree AS (
        -- Base case: the user itself
        SELECT id FROM users WHERE id = user_id
        UNION ALL
        -- Recursive case: all users managed by users in the tree
        SELECT u.id FROM users u
        INNER JOIN user_tree ut ON u.manager_id = ut.id
    )
    SELECT array_agg(id) INTO result FROM user_tree;
    
    RETURN COALESCE(result, ARRAY[user_id]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RLS Policies for users table
DROP POLICY IF EXISTS "users_select_own_and_below" ON users;
CREATE POLICY "users_select_own_and_below" ON users FOR SELECT
    TO authenticated
    USING (id IN (SELECT unnest(get_user_subtree(auth.uid()))));

DROP POLICY IF EXISTS "users_insert_admin_only" ON users;
CREATE POLICY "users_insert_admin_only" ON users FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'development_manager')
        )
    );

DROP POLICY IF EXISTS "users_update_admin_only" ON users;
CREATE POLICY "users_update_admin_only" ON users FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'development_manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'development_manager')
        )
    );

DROP POLICY IF EXISTS "users_delete_admin_only" ON users;
CREATE POLICY "users_delete_admin_only" ON users FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'development_manager')
        )
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
