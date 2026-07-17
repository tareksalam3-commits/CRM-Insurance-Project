-- تحسين أداء داخلي بحت: استبدال auth.uid() بـ (select auth.uid()) داخل سياسات RLS
-- ده بيخلي Postgres يحسب هوية المستخدم مرة واحدة فقط لكل استعلام بدل ما يعيد حسابها
-- لكل صف على حدة. نفس الصلاحيات بالظبط ونفس النتائج، بس أسرع بكثير مع الجداول الكبيرة.

-- activity_logs
alter policy activity_logs_insert_all on public.activity_logs
  with check (user_id = (select auth.uid()));

alter policy activity_logs_select_hierarchy on public.activity_logs
  using (user_id in (select unnest(get_user_subtree((select auth.uid())))));

-- customers
alter policy customers_delete_owner on public.customers
  using (((owner_id = (select auth.uid())) or (owner_id in (select unnest(get_user_subtree((select auth.uid())))))) and can_delete_customer(id));

alter policy customers_insert_owner on public.customers
  with check ((owner_id = (select auth.uid())) or (owner_id in (select unnest(get_user_subtree((select auth.uid()))))));

alter policy customers_select_hierarchy on public.customers
  using (owner_id in (select unnest(get_user_subtree((select auth.uid())))));

alter policy customers_update_owner on public.customers
  using ((owner_id = (select auth.uid())) or (owner_id in (select unnest(get_user_subtree((select auth.uid()))))))
  with check ((owner_id = (select auth.uid())) or (owner_id in (select unnest(get_user_subtree((select auth.uid()))))));

-- installments
alter policy installments_insert_system on public.installments
  with check (exists (select 1 from policies where policies.id = installments.policy_id and policies.owner_id = (select auth.uid())));

alter policy installments_select_hierarchy on public.installments
  using (policy_id in (select policies.id from policies where policies.owner_id in (select unnest(get_user_subtree((select auth.uid()))))));

alter policy installments_update_system on public.installments
  using (exists (select 1 from policies where policies.id = installments.policy_id and policies.owner_id in (select unnest(get_user_subtree((select auth.uid()))))))
  with check (exists (select 1 from policies where policies.id = installments.policy_id and policies.owner_id in (select unnest(get_user_subtree((select auth.uid()))))));

-- monthly_closings
alter policy monthly_closings_insert_supervisor on public.monthly_closings
  with check (exists (select 1 from users where users.id = (select auth.uid()) and users.role = any (array['supervisor'::user_role, 'general_supervisor'::user_role, 'development_manager'::user_role, 'super_admin'::user_role])));

alter policy monthly_closings_update_supervisor on public.monthly_closings
  using (exists (select 1 from users where users.id = (select auth.uid()) and users.role = any (array['supervisor'::user_role, 'general_supervisor'::user_role, 'development_manager'::user_role, 'super_admin'::user_role])))
  with check (exists (select 1 from users where users.id = (select auth.uid()) and users.role = any (array['supervisor'::user_role, 'general_supervisor'::user_role, 'development_manager'::user_role, 'super_admin'::user_role])));

-- notifications
alter policy notifications_select_own on public.notifications
  using (user_id = (select auth.uid()));

alter policy notifications_update_own on public.notifications
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- payments
alter policy payments_insert_owner on public.payments
  with check ((paid_by_user_id = (select auth.uid())) and (installment_id in (select i.id from installments i join policies p on i.policy_id = p.id where (p.owner_id = (select auth.uid())) or (p.owner_id in (select unnest(get_user_subtree((select auth.uid())))))) ));

alter policy payments_select_hierarchy on public.payments
  using (installment_id in (select i.id from installments i join policies p on i.policy_id = p.id where p.owner_id in (select unnest(get_user_subtree((select auth.uid()))))));

alter policy payments_update_cancel on public.payments
  using (
    (paid_by_user_id = (select auth.uid()))
    or (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'super_admin'::user_role))
    or (exists (select 1 from users where users.id = (select auth.uid()) and users.role = any (array['general_supervisor'::user_role, 'supervisor'::user_role])))
    or ((exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'development_manager'::user_role)) and (installment_id in (select i.id from installments i join policies p on i.policy_id = p.id where p.owner_id in (select unnest(get_user_subtree((select auth.uid())))))))
  )
  with check (
    (paid_by_user_id = (select auth.uid()))
    or (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'super_admin'::user_role))
    or (exists (select 1 from users where users.id = (select auth.uid()) and users.role = any (array['general_supervisor'::user_role, 'supervisor'::user_role])))
    or ((exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'development_manager'::user_role)) and (installment_id in (select i.id from installments i join policies p on i.policy_id = p.id where p.owner_id in (select unnest(get_user_subtree((select auth.uid())))))))
  );

-- policies
alter policy policies_delete_owner on public.policies
  using (((owner_id = (select auth.uid())) or (owner_id in (select unnest(get_user_subtree((select auth.uid())))))) and can_delete_policy(id));

alter policy policies_insert_owner on public.policies
  with check ((owner_id = (select auth.uid())) or (owner_id in (select unnest(get_user_subtree((select auth.uid()))))));

alter policy policies_select_hierarchy on public.policies
  using (owner_id in (select unnest(get_user_subtree((select auth.uid())))));

alter policy policies_update_owner on public.policies
  using ((owner_id = (select auth.uid())) or (owner_id in (select unnest(get_user_subtree((select auth.uid()))))))
  with check ((owner_id = (select auth.uid())) or (owner_id in (select unnest(get_user_subtree((select auth.uid()))))));

-- settings
alter policy settings_insert_super_admin on public.settings
  with check (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'super_admin'::user_role));

alter policy settings_update_super_admin on public.settings
  using (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'super_admin'::user_role))
  with check (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'super_admin'::user_role));

-- users
alter policy users_admin_delete on public.users
  using (is_super_admin() or (id in (select unnest(get_user_subtree((select auth.uid()))))));

alter policy users_admin_insert on public.users
  with check (is_super_admin() or (manager_id in (select unnest(get_user_subtree((select auth.uid()))))));

alter policy users_admin_select_all on public.users
  using (is_super_admin() or (id in (select unnest(get_user_subtree((select auth.uid()))))));

alter policy users_admin_update on public.users
  using (is_super_admin() or (id in (select unnest(get_user_subtree((select auth.uid()))))))
  with check (is_super_admin() or (id in (select unnest(get_user_subtree((select auth.uid()))))));

-- webauthn_credentials
alter policy "users can view own passkeys" on public.webauthn_credentials
  using ((select auth.uid()) = user_id);

alter policy "users can delete own passkeys" on public.webauthn_credentials
  using ((select auth.uid()) = user_id);
;
