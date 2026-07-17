-- Fix search_path for all functions
ALTER FUNCTION get_role_level(user_role) SET search_path = public;
ALTER FUNCTION get_user_subtree(uuid) SET search_path = public;
ALTER FUNCTION update_updated_at() SET search_path = public;
ALTER FUNCTION generate_installments(uuid, date, payment_method, decimal) SET search_path = public;
ALTER FUNCTION regenerate_installments() SET search_path = public;
ALTER FUNCTION record_payment() SET search_path = public;
ALTER FUNCTION cancel_payment() SET search_path = public;
ALTER FUNCTION is_month_closed(date) SET search_path = public;
ALTER FUNCTION log_activity(action_type, text, uuid, jsonb, jsonb) SET search_path = public;
ALTER FUNCTION create_due_notifications() SET search_path = public;
ALTER FUNCTION get_dashboard_stats(uuid) SET search_path = public;
ALTER FUNCTION get_target_progress(uuid, date) SET search_path = public;
ALTER FUNCTION get_collection_report(date, date, uuid) SET search_path = public;
ALTER FUNCTION create_user_with_auth(text, text, text, user_role, text, uuid, decimal) SET search_path = public;
ALTER FUNCTION handle_new_auth_user() SET search_path = public;
ALTER FUNCTION transfer_user(uuid, uuid) SET search_path = public;
ALTER FUNCTION suspend_policy(uuid, text) SET search_path = public;
ALTER FUNCTION reactivate_policy(uuid) SET search_path = public;

-- Revoke anon access to sensitive functions
REVOKE EXECUTE ON FUNCTION cancel_payment() FROM anon;
REVOKE EXECUTE ON FUNCTION create_due_notifications() FROM anon;
REVOKE EXECUTE ON FUNCTION create_user_with_auth(text, text, text, user_role, text, uuid, decimal) FROM anon;
REVOKE EXECUTE ON FUNCTION generate_installments(uuid, date, payment_method, decimal) FROM anon;
REVOKE EXECUTE ON FUNCTION get_collection_report(date, date, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_dashboard_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_target_progress(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION get_user_subtree(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION handle_new_auth_user() FROM anon;
REVOKE EXECUTE ON FUNCTION is_month_closed(date) FROM anon;
REVOKE EXECUTE ON FUNCTION log_activity(action_type, text, uuid, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION reactivate_policy(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION record_payment() FROM anon;
REVOKE EXECUTE ON FUNCTION regenerate_installments() FROM anon;
REVOKE EXECUTE ON FUNCTION suspend_policy(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION transfer_user(uuid, uuid) FROM anon;

-- Fix notifications insert policy - restrict to only insert for the user themselves or via system
DROP POLICY IF EXISTS "notifications_insert_system" ON notifications;
CREATE POLICY "notifications_insert_authenticated" ON notifications FOR INSERT
    TO authenticated
    WITH CHECK (user_id IS NOT NULL);
;
