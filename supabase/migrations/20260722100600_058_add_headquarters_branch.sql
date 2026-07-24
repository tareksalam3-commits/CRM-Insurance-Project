-- migration مفقودة تمامًا من الريبو قبل المزامنة. هذه هي الـ migration
-- الأهم فى كل موضوع "الفرع الرئيسي": إضافة عمود يميّزه صراحة (is_headquarters)
-- بدل الاعتماد على مطابقة الاسم نصيًا أو على ترتيبه الزمني — وهو المعيار
-- اللي كل الكود اللاحق (sync_primary_branch_role النهائية فى
-- default_branch_from_manager، وbranchVisibility.ts فى الفرونت إند، وRLS
-- فى 063_hide_main_branch_rls) لازم يعتمد عليه.

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS is_headquarters boolean NOT NULL DEFAULT false;

-- فرع رئيسي واحد بس مسموح بيه
CREATE UNIQUE INDEX IF NOT EXISTS branches_single_headquarters_idx
  ON public.branches (is_headquarters)
  WHERE is_headquarters = true;

COMMENT ON COLUMN public.branches.is_headquarters IS
  'true لفرع واحد فقط: "الفرع الرئيسي" الخاص بالسوبر أدمن. هذا الفرع لا يحمل عملاء/وثائق فعلية، وإنما يمثل نطاق تجميعي (Aggregate) يجمع أرقام كل الفروع التشغيلية معًا مع عرض رقم كل فرع لوحده في التقارير/الداشبورد.';

-- إنشاء الفرع الرئيسي
INSERT INTO public.branches (name, is_active, is_headquarters)
VALUES ('الفرع الرئيسي', true, true);

-- نقل السوبر أدمن من "فرع طنطا 3" إلى "الفرع الرئيسي"
UPDATE public.user_branch_roles ubr
SET branch_id = (SELECT id FROM public.branches WHERE is_headquarters = true),
    updated_at = now()
FROM public.users u
WHERE ubr.user_id = u.id
  AND u.role = 'super_admin';
