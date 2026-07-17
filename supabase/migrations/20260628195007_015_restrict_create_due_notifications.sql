-- تقييد من يستطيع استدعاء create_due_notifications (نظامية التأثير على كل المستخدمين)
-- لتكون متاحة فقط للأدوار الإدارية (مراقب فأعلى)، دفاعاً متعمقاً بمستوى الدالة
CREATE OR REPLACE FUNCTION create_due_notifications()
RETURNS void AS $$
DECLARE
    rec record;
    overdue_date int;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role IN ('supervisor', 'general_supervisor', 'development_manager', 'super_admin')
    ) THEN
        RETURN;
    END IF;

    SELECT notification_days_before INTO overdue_date FROM settings LIMIT 1;
    IF overdue_date IS NULL THEN overdue_date := 7; END IF;

    FOR rec IN
        SELECT DISTINCT i.*, p.policy_number, c.name as customer_name, p.owner_id
        FROM installments i
        JOIN policies p ON i.policy_id = p.id
        JOIN customers c ON p.customer_id = c.id
        WHERE i.due_date = CURRENT_DATE
        AND i.status = 'pending'
        AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.entity_id = i.id
            AND n.type = 'due_today'
            AND n.user_id = p.owner_id
        )
    LOOP
        INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
        VALUES (
            rec.owner_id,
            'due_today',
            'قسط مستحق اليوم',
            'القسط رقم ' || rec.installment_number || ' للوصل رقم ' || rec.policy_number || ' للعميل ' || rec.customer_name || ' مستحق اليوم',
            'installment',
            rec.id
        );
    END LOOP;

    FOR rec IN
        SELECT DISTINCT i.*, p.policy_number, c.name as customer_name, p.owner_id
        FROM installments i
        JOIN policies p ON i.policy_id = p.id
        JOIN customers c ON p.customer_id = c.id
        WHERE i.due_date BETWEEN CURRENT_DATE + interval '1 day' AND CURRENT_DATE + overdue_date
        AND i.status = 'pending'
        AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.entity_id = i.id
            AND n.type = 'due_this_week'
            AND n.user_id = p.owner_id
        )
    LOOP
        INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
        VALUES (
            rec.owner_id,
            'due_this_week',
            'قسط مستحق هذا الأسبوع',
            'القسط رقم ' || rec.installment_number || ' للوصل رقم ' || rec.policy_number || ' للعميل ' || rec.customer_name || ' مستحق في ' || to_char(rec.due_date, 'DD/MM/YYYY'),
            'installment',
            rec.id
        );
    END LOOP;

    FOR rec IN
        SELECT DISTINCT i.*, p.policy_number, c.name as customer_name, p.owner_id, u.manager_id
        FROM installments i
        JOIN policies p ON i.policy_id = p.id
        JOIN customers c ON p.customer_id = c.id
        JOIN users u ON p.owner_id = u.id
        WHERE i.due_date < CURRENT_DATE - interval '2 months'
        AND i.status = 'pending'
    LOOP
        UPDATE policies
        SET status = 'suspended',
            suspended_at = now(),
            suspended_reason = 'تأخر السداد أكثر من شهرين'
        WHERE id = rec.policy_id
        AND status = 'active';

        UPDATE installments
        SET status = 'overdue'
        WHERE id = rec.id;

        IF NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.entity_id = rec.policy_id
            AND n.type = 'policy_suspended'
            AND n.user_id = rec.owner_id
        ) THEN
            INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
            VALUES (
                rec.owner_id,
                'policy_suspended',
                'تم إيقاف الوصل تلقائياً',
                'تم إيقاف الوصل رقم ' || rec.policy_number || ' لتأخر السداد أكثر من شهرين',
                'policy',
                rec.policy_id
            );

            IF rec.manager_id IS NOT NULL THEN
                INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
                VALUES (
                    rec.manager_id,
                    'policy_suspended',
                    'تم إيقاف وصل تلقائياً',
                    'تم إيقاف الوصل رقم ' || rec.policy_number || ' لتأخر السداد أكثر من شهرين',
                    'policy',
                    rec.policy_id
                );
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- أيضاً تحديث حالة الأقساط المتأخرة (overdue) بشكل عام دون شرط الإيقاف فقط
-- (يضمن ظهورها فوراً في تبويب "الأقساط المتأخرة" بصفحة التحصيل دون انتظار شهرين كاملين)
CREATE OR REPLACE FUNCTION update_overdue_installments()
RETURNS void AS $$
BEGIN
    UPDATE installments
    SET status = 'overdue', updated_at = now()
    WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION update_overdue_installments() FROM anon;
;
