-- إضافة أنواع أحداث جديدة لسجل النشاط (activity_logs) خاصة ببنية الذكاء
-- الاصطناعي الجديدة. يجب أن تكون هذه القيم فى ملف Migration منفصل عن أي
-- ملف يستخدمها فوراً (نفس أسلوب add_backup_export_action_type.sql وغيره)
-- لأن PostgreSQL لا يسمح باستخدام قيمة enum جديدة فى نفس الـ transaction
-- التى أُضيفت فيها.

ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'ai_settings_update';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'ai_provider_update';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'ai_provider_test';
