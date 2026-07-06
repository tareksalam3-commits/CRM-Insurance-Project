/*
  # تحسين أداء البحث (Performance Optimization)

  المشكلة:
  البحث في الشاشات (العملاء، الوثائق، المستخدمون، التحصيل) يستخدم
  عامل التصفية `ilike '%term%'` على أعمدة مثل الاسم، الهاتف، الرقم القومي،
  رقم الوثيقة، والبريد الإلكتروني. هذا النوع من البحث (بادئة متغيرة %term%)
  لا يستفيد من الفهارس العادية (B-Tree)، مما يجعل قاعدة البيانات تفحص
  كل الصفوف (Sequential Scan) في كل بحث، وكلما زاد عدد السجلات كلما
  أصبح البحث أبطأ.

  الحل:
  إضافة امتداد pg_trgm (trigram) وفهارس GIN مبنية عليه على نفس الأعمدة
  التي يتم البحث فيها بالفعل في كود التطبيق. هذا يسرّع عمليات البحث
  بشكل كبير خصوصًا مع تزايد عدد العملاء والوثائق والمستخدمين، دون أي
  تغيير في منطق العمل أو النتائج التي يحصل عليها المستخدم — فقط سرعة أكبر.

  1. تفعيل امتداد pg_trgm (إن لم يكن مفعّلاً)
  2. فهارس GIN trigram على:
     - customers.phone, customers.national_id
     - policies.policy_number
     - users.name, users.email
  3. لا حذف أو تعديل لأي بيانات أو أعمدة أو صلاحيات (RLS) — فهارس فقط
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- العملاء: البحث بالاسم / الرقم القومي / الهاتف (Customers.tsx)
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
  ON customers USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_national_id_trgm
  ON customers USING gin (national_id gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin (name gin_trgm_ops);

-- الوثائق: البحث برقم الوثيقة (Policies.tsx, Collection.tsx)
CREATE INDEX IF NOT EXISTS idx_policies_policy_number_trgm
  ON policies USING gin (policy_number gin_trgm_ops);

-- المستخدمون: البحث بالاسم / البريد الإلكتروني (Users.tsx)
CREATE INDEX IF NOT EXISTS idx_users_name_trgm
  ON users USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_email_trgm
  ON users USING gin (email gin_trgm_ops);
