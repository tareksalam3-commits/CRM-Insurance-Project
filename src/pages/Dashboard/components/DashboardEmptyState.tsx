import { TrendingUp } from 'lucide-react';

export function DashboardEmptyState() {
  return (
    <div className="card bg-secondary-50/60 border-dashed flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-secondary-100 flex items-center justify-center flex-shrink-0">
        <TrendingUp className="w-6 h-6 text-secondary-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-secondary-700">لا يوجد نشاط مسجل بعد هذا الشهر</p>
        <p className="text-xs text-secondary-500 mt-0.5">
          ابدأ بإضافة عميل أو وثيقة جديدة وستظهر إحصائياتك هنا تلقائيًا
        </p>
      </div>
    </div>
  );
}
