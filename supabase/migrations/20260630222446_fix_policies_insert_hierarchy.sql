DROP POLICY IF EXISTS "policies_insert_owner" ON policies;
CREATE POLICY "policies_insert_owner" ON policies FOR INSERT
    TO authenticated
    WITH CHECK (
        (owner_id = auth.uid())
        OR (owner_id IN (SELECT unnest(get_user_subtree(auth.uid()))))
    );
