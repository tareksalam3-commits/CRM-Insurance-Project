-- كان فيه صفين فى الجدول ده بالغلط (المفروض صف واحد بس)، ده كان ممكن يكسّر
-- استعلام .maybeSingle() فى الكود. بنشيل الصف الزيادة (الأحدث) ونحتفظ بالأقدم،
-- وبنضيف قيد يمنع إضافة أي صف تاني مستقبلاً عشان الجدول يفضل singleton فعلياً.

DELETE FROM public.performance_activity_targets
WHERE id NOT IN (
  SELECT id FROM public.performance_activity_targets ORDER BY created_at ASC LIMIT 1
);

ALTER TABLE public.performance_activity_targets
  ADD COLUMN singleton boolean NOT NULL DEFAULT true;

ALTER TABLE public.performance_activity_targets
  ADD CONSTRAINT performance_activity_targets_singleton_uq UNIQUE (singleton);
