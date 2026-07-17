-- Bucket خاص وغير عام لإيصالات الاشتراكات (مستندات مالية حساسة)
INSERT INTO storage.buckets (id, name, public)
VALUES ('subscription-receipts', 'subscription-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- كل مستخدم يرفع إيصالاته في مجلد باسم الـ user_id بتاعه فقط
DROP POLICY IF EXISTS "subscription_receipts_upload_own" ON storage.objects;
CREATE POLICY "subscription_receipts_upload_own" ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'subscription-receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- القراءة: صاحب الإيصال نفسه أو Super Admin بس (عشان المراجعة)
DROP POLICY IF EXISTS "subscription_receipts_select_own_or_admin" ON storage.objects;
CREATE POLICY "subscription_receipts_select_own_or_admin" ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'subscription-receipts'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
        )
    );
