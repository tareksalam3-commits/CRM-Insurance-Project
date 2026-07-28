import { useMemo, useState } from 'react';
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AppDialog } from '../../../components/ui/AppDialog';
import { IMPORT_COLUMNS, type ParsedRow } from '../types';
import { revalidateRow, type ImportAgent } from '../services/dataImportService';

interface RowEditModalProps {
  row: ParsedRow;
  agents: ImportAgent[];
  onCancel: () => void;
  onSave: (updatedRow: ParsedRow) => void;
}

// مودال تعديل صف واحد من صفوف المعاينة قبل الاستيراد. أي تعديل بيتحقق منه
// فوراً (نفس قواعد التحقق المستخدمة عند تحليل الملف لأول مرة) من غير
// الحاجة لإعادة رفع الملف كله، عشان تصحيح خطأ بسيط (تاريخ، رقم، اسم وكيل)
// يبقى سريع ومباشر.
export function RowEditModal({ row, agents, onCancel, onSave }: RowEditModalProps) {
  const [values, setValues] = useState<Record<string, any>>({ ...row.raw });

  const preview = useMemo(
    () => revalidateRow({ ...row, raw: values }, agents),
    [values, row, agents]
  );

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <AppDialog className="animate-fadeIn max-w-2xl w-full max-h-[85vh] flex flex-col">
      <div className="flex items-center justify-between p-5 border-b border-secondary-200 flex-shrink-0">
        <h3 className="text-lg font-semibold text-secondary-900">
          تعديل الصف رقم {row.rowNumber}
        </h3>
        <button onClick={onCancel} className="p-2 rounded-lg hover:bg-secondary-100">
          <X className="w-5 h-5 text-secondary-600" />
        </button>
      </div>

      <div className="p-5 space-y-4 overflow-y-auto flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {IMPORT_COLUMNS.map((col) => (
            <div key={col.key} className="form-group">
              <label className="input-label">
                {col.header}{col.required && ' *'}
              </label>
              <input
                value={values[col.key] ?? ''}
                onChange={(e) => handleChange(col.key, e.target.value)}
                className="input-field"
                dir={col.key === 'phone' || col.key === 'national_id' ? 'ltr' : undefined}
              />
            </div>
          ))}
        </div>

        {preview.clientError ? (
          <div className="flex items-start gap-2 bg-error-50 border border-error-200 text-error-700 rounded-lg p-3 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{preview.clientError}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-success-50 border border-success-200 text-success-700 rounded-lg p-3 text-sm">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>الصف صحيح وجاهز للاستيراد</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 p-5 border-t border-secondary-200 flex-shrink-0">
        <button onClick={onCancel} className="btn btn-secondary">إلغاء</button>
        <button onClick={() => onSave(preview)} className="btn btn-primary">
          حفظ التعديل
        </button>
      </div>
    </AppDialog>
  );
}
