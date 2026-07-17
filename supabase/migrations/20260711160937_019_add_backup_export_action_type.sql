-- إضافة نوع عملية جديد لتسجيل عمليات تصدير النسخة الاحتياطية في سجل العمليات
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'backup_export';
