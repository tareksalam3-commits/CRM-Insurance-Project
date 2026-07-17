import { DollarSign, Layers } from 'lucide-react';

interface CollectionYearSelectorProps {
  onSelectYear1: () => void;
  onSelectYear2: () => void;
}

// ===================================
// شاشة اختيار السنة — تظهر أول ما تُفتح الصفحة، ولا يُعرض أي بيانات
// (لا سنة أولى ولا سنة ثانية) قبل ما المستخدم يختار
// ===================================
export function CollectionYearSelector({ onSelectYear1, onSelectYear2 }: CollectionYearSelectorProps) {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-secondary-900">التحصيل والسداد</h2>
        <p className="text-sm text-secondary-500 mt-1">اختر نوع التحصيل الذي تريد متابعته</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <button
          onClick={onSelectYear1}
          className="card pressable text-right hover:border-primary-400 hover:shadow-md transition-all p-6"
        >
          <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center mb-3">
            <DollarSign className="w-6 h-6 text-primary-600" />
          </div>
          <h3 className="text-lg font-bold text-secondary-900 mb-1">تحصيلات السنة الأولى</h3>
          <p className="text-sm text-secondary-500">
            الإنتاج الجديد، التحصيل الدوري، المتأخر، والمسدد — وتدخل ضمن التارجت والمحقق
          </p>
        </button>
        <button
          onClick={onSelectYear2}
          className="card pressable text-right hover:border-primary-400 hover:shadow-md transition-all p-6"
        >
          <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center mb-3">
            <Layers className="w-6 h-6 text-primary-600" />
          </div>
          <h3 className="text-lg font-bold text-secondary-900 mb-1">تحصيلات السنة الثانية</h3>
          <p className="text-sm text-secondary-500">
            متابعة وتسديد فقط للوثائق التي دخلت سنتها الثانية — لا تدخل في أي إحصائية
          </p>
        </button>
      </div>
    </div>
  );
}
