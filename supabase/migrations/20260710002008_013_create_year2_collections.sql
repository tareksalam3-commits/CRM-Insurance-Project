-- إضافة أنواع أنشطة جديدة لسجل النشاط (لا تؤثر على القيم الحالية إطلاقاً)
DO $$ BEGIN
    ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'year2_payment_create';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'year2_payment_cancel';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
