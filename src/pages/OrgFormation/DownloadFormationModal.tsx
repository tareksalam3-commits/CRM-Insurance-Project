import { useState } from 'react';
import { X, FileDown, Calendar } from 'lucide-react';

interface DownloadFormationModalProps {
  onClose: () => void;
  onPreview: (branchName: string, asOfDate: string) => void;
}

const todayStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export function DownloadFormationModal({ onClose, onPreview }: DownloadFormationModalProps) {
  const [branchName, setBranchName] = useState('');
  const [asOfDate, setAsOfDate] = useState(todayStr());

  const handlePreview = () => {
    onPreview(branchName.trim(), asOfDate);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-sm animate-fadeIn" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
              <FileDown className="w-5 h-5 text-primary-600" />
            </div>
            <h3 className="text-lg font-semibold text-secondary-900">تنزيل التشكيل</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1.5">اسم الفرع</label>
            <input
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="اكتب اسم الفرع"
              className="input-field"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1.5">اعتبارًا من</label>
            <div className="relative">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-secondary-400 pointer-events-none" />
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="input-field pr-10"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              إلغاء
            </button>
            <button type="button" onClick={handlePreview} className="btn btn-primary flex-1">
              <FileDown className="w-4 h-4" />
              <span>معاينة PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
