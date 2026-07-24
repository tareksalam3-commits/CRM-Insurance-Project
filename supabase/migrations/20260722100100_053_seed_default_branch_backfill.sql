-- استكمال 052: إنشاء فرع افتراضي واحد، وربط كل مستخدم حالي فى users بصف
-- واحد فى user_branch_roles بنفس role وmanager_id بتوعه الحاليين، مربوط
-- بالفرع الافتراضي، وis_primary = true. additive-only بالكامل — سلوك أي
-- مستخدم حالي مايتغيرش، لأن ولا حاسبة ولا صفحة بتقرأ من الجدول ده لسه.

INSERT INTO branches (name)
VALUES ('الفرع الرئيسي')
ON CONFLICT (name) DO NOTHING;

-- كل مستخدم (بما فيهم المديرين) بياخد صف فى نفس عملية INSERT الواحدة —
-- الـ constraint trigger على manager_id مؤجّل لحد الـ COMMIT (راجع 052)
-- عشان كده ترتيب الصفوف هنا مش مهم: صف المدير هيكون موجود وقت الفحص
-- النهائي حتى لو اتدرج بعد صف المرؤوس فى نفس الـ INSERT.
INSERT INTO user_branch_roles (user_id, branch_id, role, manager_id, is_primary)
SELECT
    u.id,
    b.id,
    u.role,
    u.manager_id,
    true
FROM users u
CROSS JOIN (SELECT id FROM branches WHERE name = 'الفرع الرئيسي') b
ON CONFLICT (user_id, branch_id) DO NOTHING;
