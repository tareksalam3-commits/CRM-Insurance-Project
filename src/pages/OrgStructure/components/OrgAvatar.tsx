import { useState } from 'react';
import clsx from 'clsx';

// ─── Avatar ──────────────────────────────────────────────
// يعرض صورة البروفايل لو موجودة، وإلا يرجع لأيقونة الحرف الأول.
// عند فشل تحميل الصورة (رابط تالف) يرجع تلقائياً لنفس الأيقونة الافتراضية.
export function OrgAvatar({
  name, avatarUrl, style, compact = false,
}: {
  name: string;
  avatarUrl: string | null;
  style: { bg: string; text: string; ring: string };
  // compact: للمستويات العميقة جداً في شجرة الهيكل (بطاقات الوكلاء/الأفراد
  // الصغيرة)، بيصغّر الأفاتار شوية عشان يسيب مساحة أكتر للاسم جوه الكارت
  // الضيق من غير ما يأثر على أي استخدام تاني للأفاتار في الموقع.
  compact?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const sizeClasses = compact ? 'w-5 h-5 sm:w-11 sm:h-11' : 'w-6 h-6 sm:w-11 sm:h-11';

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        loading="lazy"
        decoding="async"
        className={clsx(sizeClasses, 'rounded-full object-cover flex-shrink-0 ring-2', style.ring)}
      />
    );
  }

  return (
    <div className={clsx(
      sizeClasses,
      'rounded-full flex items-center justify-center text-[9px] sm:text-sm font-bold flex-shrink-0 ring-2',
      style.bg, style.text, style.ring
    )}>
      {name.charAt(0)}
    </div>
  );
}
