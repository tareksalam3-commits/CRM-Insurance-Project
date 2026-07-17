import { useState } from 'react';
import clsx from 'clsx';

// ─── Avatar ──────────────────────────────────────────────
// يعرض صورة البروفايل لو موجودة، وإلا يرجع لأيقونة الحرف الأول.
// عند فشل تحميل الصورة (رابط تالف) يرجع تلقائياً لنفس الأيقونة الافتراضية.
export function OrgAvatar({
  name, avatarUrl, style,
}: {
  name: string;
  avatarUrl: string | null;
  style: { bg: string; text: string; ring: string };
}) {
  const [imgError, setImgError] = useState(false);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        loading="lazy"
        decoding="async"
        className={clsx('w-11 h-11 rounded-full object-cover flex-shrink-0 ring-2', style.ring)}
      />
    );
  }

  return (
    <div className={clsx(
      'w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ring-2',
      style.bg, style.text, style.ring
    )}>
      {name.charAt(0)}
    </div>
  );
}
