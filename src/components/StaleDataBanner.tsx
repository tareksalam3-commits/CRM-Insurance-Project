import { WifiOff } from 'lucide-react';
import type { DalStatus } from '../lib/dataAccessLayer';

interface Props {
  status: DalStatus;
  cachedAt: number | null;
}

function minutesAgoLabel(cachedAt: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - cachedAt) / 60000));
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes === 1) return 'دقيقة واحدة';
  return `منذ ${minutes} دقيقة`;
}

// ===================================
// بانر رفيع اختياري: تعرضه أي صفحة أعلى محتواها لو حابة توضّح للمستخدم
// إن البيانات المعروضة مش محدّثة لحظياً (offline-cache / error-cache).
// لا يُستخدم لحالة offline-empty — تلك تُعرض عبر NoConnectionState
// الموجود بالفعل بدل المحتوى بالكامل.
// ===================================
export function StaleDataBanner({ status, cachedAt }: Props) {
  if (status !== 'offline-cache' && status !== 'error-cache') return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-secondary-100 text-secondary-600 text-xs px-3 py-2 mb-3">
      <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
      <span>
        تُعرض بيانات محفوظة {cachedAt ? minutesAgoLabel(cachedAt) : ''} بسبب انقطاع الاتصال بالخادم.
      </span>
    </div>
  );
}
