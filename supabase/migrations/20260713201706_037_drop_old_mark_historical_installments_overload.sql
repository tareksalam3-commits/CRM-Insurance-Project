-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- حذف النسخة القديمة ذات الباراميتر الواحد من mark_historical_installments_paid
-- بعد إضافة النسخة الجديدة (uuid, uuid) فى الميجريشن السابقة — لتفادي التباس
-- الاستدعاء بين النسختين (overload).

DROP FUNCTION IF EXISTS public.mark_historical_installments_paid(uuid);
