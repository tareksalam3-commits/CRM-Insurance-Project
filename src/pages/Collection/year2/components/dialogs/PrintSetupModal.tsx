import { X, Printer } from 'lucide-react';
import type { PrintPeriodType } from '../../types';

interface PrintSetupModalProps {
  printPeriodType: PrintPeriodType;
  setPrintPeriodType: (type: PrintPeriodType) => void;
  printDateStr: string;
  setPrintDateStr: (date: string) => void;
  printLoading: boolean;
  onGenerate: () => void;
  onClose: () => void;
}

// ===== مودال إعداد الطباعة =====
export function PrintSetupModal({
  printPeriodType, setPrintPeriodType, printDateStr, setPrintDateStr, printLoading, onGenerate, onClose,
}: PrintSetupModalProps) {
  return (
    <div className="modal-overlay print:hidden" onClick={onClose}>
      <div className="modal-content max-w-md animate-fadeIn" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">طباعة تقرير تحصيل السنة الثانية</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="form-group">
            <label className="input-label">نوع الفترة</label>
            <select
              value={printPeriodType}
              onChange={(e) => setPrintPeriodType(e.target.value as PrintPeriodType)}
              className="input-field"
            >
              <option value="month">شهر</option>
              <option value="quarter">ربع سنة</option>
              <option value="year">سنة</option>
            </select>
          </div>
          <div className="form-group">
            <label className="input-label">تاريخ داخل الفترة المطلوبة</label>
            <input
              type="date"
              value={printDateStr}
              onChange={(e) => setPrintDateStr(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="btn btn-secondary">إلغاء</button>
            <button onClick={onGenerate} disabled={printLoading} className="btn btn-primary">
              {printLoading
                ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>جاري الإعداد...</span></>
                : <><Printer className="w-4 h-4" /><span>طباعة</span></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
