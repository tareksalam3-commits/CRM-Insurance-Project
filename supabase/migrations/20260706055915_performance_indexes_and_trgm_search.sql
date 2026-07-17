-- تحسينات أداء داخلية بحتة: فهارس إضافية لتسريع الاستعلامات الشائعة
-- بدون أي تغيير في المنطق أو البيانات أو النتائج المعروضة

-- 1) تفعيل pg_trgm لتسريع البحث بالـ ILIKE '%...%' (بحث الاسم/الهاتف/رقم الوثيقة)
--    البحث ده كان بيعمل full table scan قبل كده، دلوقتي هيستخدم فهرس GIN
create extension if not exists pg_trgm;

create index if not exists idx_customers_name_trgm on public.customers using gin (name gin_trgm_ops);
create index if not exists idx_customers_phone_trgm on public.customers using gin (phone gin_trgm_ops);
create index if not exists idx_policies_policy_number_trgm on public.policies using gin (policy_number gin_trgm_ops);
create index if not exists idx_users_name_trgm on public.users using gin (name gin_trgm_ops);
create index if not exists idx_users_email_trgm on public.users using gin (email gin_trgm_ops);

-- 2) فهارس مركّبة (composite) على أنماط الفلترة المتكررة فعليًا في الكود
--    (بدل الاعتماد على فهرس عمود واحد بس، بتسرّع خصوصًا مع كثرة السجلات)

-- installments: يتفلتر دايمًا بالحالة + تاريخ الاستحقاق مع بعض (المستحق اليوم، المتأخرات...)
create index if not exists idx_installments_status_due_date on public.installments (status, due_date);

-- payments: يتفلتر دايمًا بشهر الدفع + عدم الإلغاء مع بعض (كل تقارير الشهر)
create index if not exists idx_payments_month_cancelled on public.payments (payment_month, is_cancelled);

-- policies: يتفلتر بالمالك + الحالة مع بعض في أغلب الصفحات
create index if not exists idx_policies_owner_status on public.policies (owner_id, status);

-- customers: مطلوب فرز/فلترة بالمالك بشكل متكرر مع الترتيب بالاسم
create index if not exists idx_customers_owner_name on public.customers (owner_id, name);
;
