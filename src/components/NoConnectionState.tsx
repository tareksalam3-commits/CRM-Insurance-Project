import { WifiOff, RefreshCw } from 'lucide-react';

interface Props {
  onRetry: () => void;
  message?: string;
}

// ===================================
// حالة "لا يوجد اتصال بالإنترنت" — تُستخدم داخل أي صفحة عندما:
// (1) مفيش اتصال بالإنترنت حالياً، و
// (2) مفيش بيانات محملة مسبقاً لعرضها (لو فيه بيانات قديمة، الأفضل
//     إنها تفضل ظاهرة زي ما هي بدل استبدالها بالرسالة دي).
//
// ملحوظة: هذا مكوّن عرض بسيط فقط (Dumb component) — كل صفحة هي اللي
// بتقرر متى تعرضه بناءً على حالتها (loading / hasData / isOnline).
// ===================================
export function NoConnectionState({ onRetry, message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="w-14 h-14 rounded-2xl bg-secondary-100 flex items-center justify-center mb-4">
        <WifiOff className="w-6 h-6 text-secondary-500" />
      </div>
      <p className="font-semibold text-secondary-900 mb-1">لا يوجد اتصال بالإنترنت</p>
      <p className="text-sm text-secondary-500 mb-5 max-w-xs">
        {message || 'تعذر تحميل البيانات. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.'}
      </p>
      <button onClick={onRetry} className="btn-primary inline-flex items-center gap-2">
        <RefreshCw className="w-4 h-4" />
        <span>إعادة المحاولة</span>
      </button>
    </div>
  );
}
