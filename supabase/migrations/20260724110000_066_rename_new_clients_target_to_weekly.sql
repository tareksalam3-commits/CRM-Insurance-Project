-- هدف العملاء الجدد كان يومي وده مش منطقي (مفروض ما حدش يجيب عميل جديد كل يوم)،
-- فبنحوله لهدف أسبوعي بدل اليومي. بنحول القيمة الحالية (يومي * 7) عشان نحافظ
-- على نفس مستوى الطموح المتوقع قبل ما المدير يعدلها لاحقاً لقيمة أسبوعية واقعية.
ALTER TABLE public.performance_activity_targets
  RENAME COLUMN new_clients_daily_target TO new_clients_weekly_target;

UPDATE public.performance_activity_targets
  SET new_clients_weekly_target = GREATEST(1, new_clients_weekly_target * 7);

ALTER TABLE public.performance_activity_targets
  ALTER COLUMN new_clients_weekly_target SET DEFAULT 5;
