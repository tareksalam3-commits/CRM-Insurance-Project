-- تحديث sync_primary_branch_role() (الموجودة بالفعل من migration سابق 056) لتنفيذ
-- قرار المشكلة 3: الفرع الافتراضي للمستخدم الجديد = فرع المدير المباشر، بدل
-- التثبيت الدائم على "الفرع الرئيسي" (اللي بقى فرع تجميعي/headquarters بس
-- للسوبر أدمن، مش فرع تشغيلي حقيقي). نفس اسم الدالة والـ triggers الحالية
-- (trg_sync_primary_branch_role_insert / _update) بيفضلوا زي ما هما.
CREATE OR REPLACE FUNCTION public.sync_primary_branch_role()
RETURNS trigger AS $$
DECLARE
    v_branch_id uuid;
    v_manager_branch_count int;
    v_meta_branch_id uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF EXISTS (SELECT 1 FROM user_branch_roles WHERE user_id = NEW.id AND is_primary = true) THEN
            RETURN NEW;
        END IF;

        -- أولوية 1: branch_id صريح فى user_metadata (لازم لو المدير له أكثر من فرع)
        SELECT (raw_user_meta_data->>'branch_id')::uuid INTO v_meta_branch_id
        FROM auth.users WHERE id = NEW.id;

        IF v_meta_branch_id IS NOT NULL THEN
            v_branch_id := v_meta_branch_id;

        ELSIF NEW.manager_id IS NULL THEN
            -- لا مدير (سوبر أدمن) → فرع الهيدكوارتر التجميعي
            SELECT id INTO v_branch_id FROM branches WHERE is_headquarters = true LIMIT 1;

        ELSE
            -- أولوية 2: فرع المدير المباشر (لو فرع واحد بس)
            SELECT count(*) INTO v_manager_branch_count
            FROM user_branch_roles WHERE user_id = NEW.manager_id;

            IF v_manager_branch_count = 1 THEN
                SELECT branch_id INTO v_branch_id
                FROM user_branch_roles WHERE user_id = NEW.manager_id;
            ELSE
                RAISE EXCEPTION
                    'تعذر تحديد الفرع الافتراضي تلقائيًا للمستخدم الجديد (%): المدير المباشر له % فرع/فروع. يجب تمرير branch_id صراحة عند الإنشاء.',
                    NEW.id, v_manager_branch_count;
            END IF;
        END IF;

        IF v_branch_id IS NULL THEN
            RETURN NEW; -- سلوك احتياطي مطابق للنسخة القديمة لو لم يوجد فرع مناسب إطلاقًا
        END IF;

        INSERT INTO user_branch_roles (user_id, branch_id, role, manager_id, is_primary)
        VALUES (NEW.id, v_branch_id, NEW.role, NEW.manager_id, true)
        ON CONFLICT (user_id, branch_id) DO NOTHING;

        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.role IS DISTINCT FROM OLD.role OR NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
            UPDATE user_branch_roles
            SET role = NEW.role, manager_id = NEW.manager_id, updated_at = now()
            WHERE user_id = NEW.id AND is_primary = true;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
