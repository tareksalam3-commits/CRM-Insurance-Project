-- إصلاح: تحديث handle_new_auth_user لتستخدم البيانات الكاملة من raw_user_meta_data
-- (سيتم تمرير role, manager_id, target, phone من الـ Edge Function عبر user_metadata)
-- هذا يجعل trigger هو المصدر الوحيد لإدراج صف public.users، فلا تعارض مع أي إدراج يدوي لاحق.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, role, phone, manager_id, target)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'agent'),
        NEW.raw_user_meta_data->>'phone',
        CASE WHEN NEW.raw_user_meta_data->>'manager_id' IS NOT NULL
             THEN (NEW.raw_user_meta_data->>'manager_id')::uuid
             ELSE NULL END,
        COALESCE((NEW.raw_user_meta_data->>'target')::decimal, 0)
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- تنظيف: إزالة الدالة الناقصة create_user_with_auth (لم تعد مطلوبة، الـ Edge Function تتعامل مباشرة مع Admin API)
DROP FUNCTION IF EXISTS create_user_with_auth(text, text, text, user_role, text, uuid, decimal);
;
