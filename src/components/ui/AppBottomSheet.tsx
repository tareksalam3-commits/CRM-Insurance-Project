import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { AppDialog } from './AppDialog';

interface AppBottomSheetProps {
  title: ReactNode;
  /** يُترك تنسيقه للصفحة المستدعية (يختلف قليلاً بين استخدام وآخر) */
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * شيت إجراءات سفلي عام (رأس بعنوان وعنوان فرعي وزر إغلاق + مساحة أمان أسفل
 * الشيت). استُخرج من الأنماط المتطابقة فى مودالات "المزيد" بصفحات التحصيل،
 * العملاء والوثائق. قائمة الأزرار وشروط ظهورها تبقى فى كل صفحة كما كانت
 * تمامًا — هذا المكوّن يحمل الغلاف المرئى فقط دون أى منطق عمل.
 */
export function AppBottomSheet({ title, subtitle, onClose, children }: AppBottomSheetProps) {
  return (
    <AppDialog onClose={onClose} className="max-w-sm animate-fadeIn max-h-[85dvh] overflow-y-auto">
      <div className="flex items-center justify-between p-5 border-b border-secondary-200 sticky top-0 bg-white z-10">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-secondary-900 truncate">{title}</h3>
          {subtitle}
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 shrink-0">
          <X className="w-5 h-5 text-secondary-600" />
        </button>
      </div>

      <div className="py-2">{children}</div>

      <div className="safe-area-bottom" />
    </AppDialog>
  );
}
