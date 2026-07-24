-- ملاحظة مزامنة: النسخة القديمة من هذا الملف فى الريبو (058_policies_branch_id.sql)
-- كانت ناقصة جزء مهم — الـ trigger اللي بيملأ branch_id تلقائيًا لأي وثيقة
-- جديدة بعد كده (trg_set_policy_branch_id)، وكانت بتستخدم "أقدم فرع" كحل
-- أخير بدل فرع الهيدكوارتر الفعلي. النسخة ده مطابقة تمامًا لما هو مطبّق
-- على قاعدة البيانات.
--
-- حل جزء من المشكلة 2 (الازدواج فى إنتاج وكيل متعدد الفروع)، الخيار (ب):
-- branch_id فعلي وثابت على كل وثيقة، بدل استنتاجه ضمنيًا من فروع الوكيل
-- الحالية وقت كل تقرير.
ALTER TABLE policies ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);

UPDATE policies p
SET branch_id = ubr.branch_id
FROM user_branch_roles ubr
WHERE ubr.user_id = p.owner_id
  AND ubr.is_primary = true
  AND p.branch_id IS NULL;

-- أي صف نادر فاضل بدون فرع ياخد فرع الهيدكوارتر كحل أخير، عشان نقدر نحط NOT NULL بأمان
UPDATE policies
SET branch_id = (SELECT id FROM branches WHERE is_headquarters = true LIMIT 1)
WHERE branch_id IS NULL;

ALTER TABLE policies ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_policies_branch_id ON policies(branch_id);

CREATE OR REPLACE FUNCTION set_policy_branch_id()
RETURNS TRIGGER AS $$
DECLARE
    v_owner_branch_count int;
BEGIN
    IF NEW.branch_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO v_owner_branch_count
    FROM user_branch_roles WHERE user_id = NEW.owner_id;

    IF v_owner_branch_count = 1 THEN
        SELECT branch_id INTO NEW.branch_id
        FROM user_branch_roles WHERE user_id = NEW.owner_id;
    ELSE
        SELECT branch_id INTO NEW.branch_id
        FROM user_branch_roles WHERE user_id = NEW.owner_id AND is_primary = true;
    END IF;

    IF NEW.branch_id IS NULL THEN
        RAISE EXCEPTION
            'يجب تحديد branch_id صراحة عند إنشاء الوثيقة: تعذر تحديد فرع صاحب الوثيقة (%) تلقائيًا.',
            NEW.owner_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_policy_branch_id ON policies;
CREATE TRIGGER trg_set_policy_branch_id
    BEFORE INSERT ON policies
    FOR EACH ROW
    EXECUTE FUNCTION set_policy_branch_id();
