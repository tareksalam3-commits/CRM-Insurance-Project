import { Printer } from 'lucide-react';
import type { Branch } from '../../../features/branches/types';

interface PrintSetupModalProps {
  branchName: string;
  setBranchName: (name: string) => void;
  printBranches: Branch[];
  printClosingDate: string;
  setPrintClosingDate: (date: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

// مودال إدخال اسم الفرع وتاريخ التقفيل قبل الطباعة
export function PrintSetupModal({
  branchName,
  setBranchName,
  printBranches,
  printClosingDate,
  setPrintClosingDate,
  onClose,
  onConfirm,
}: PrintSetupModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-sm animate-fadeIn" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4 text-center">بيانات التقرير المطبوع</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">اسم الفرع</label>
              <select
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="input-field w-full"
                autoFocus
              >
                <option value="" disabled>اختر الفرع...</option>
                {printBranches.map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">تاريخ التقفيل</label>
              <input
                type="date"
                value={printClosingDate}
                onChange={(e) => setPrintClosingDate(e.target.value)}
                className="input-field w-full"
              />
            </div>
          </div>
          <div className="flex justify-center gap-3 mt-6">
            <button onClick={onClose} className="btn btn-secondary">إلغاء</button>
            <button
              onClick={onConfirm}
              disabled={!branchName.trim() || !printClosingDate}
              className="btn btn-primary"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
