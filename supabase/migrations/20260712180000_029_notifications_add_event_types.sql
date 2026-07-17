-- توسيع أنواع الإشعارات لتغطية كل أحداث النظام المطلوب تفعيلها
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'user_created';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'user_updated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'user_disabled';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'user_enabled';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'user_deleted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'customer_created';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'policy_created';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'policy_cancelled';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'month_closing_upcoming';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'month_closing_completed';
