import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { createBranch } from '../services/branchesService';

export function AddBranchModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('اسم الفرع مطلوب');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await createBranch(name);
      onDone();
    } catch (err: any) {
      setError(err?.code === '23505' ? 'يوجد فرع بنفس الاسم بالفعل' : err?.message || 'حدث خطأ أثناء إضافة الفرع');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-secondary-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-secondary-900">إضافة فرع جديد</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1.5">اسم الفرع</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="مثال: فرع الإسكندرية"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-error-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-secondary-100 px-5 py-4 flex gap-2">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center" disabled={saving}>
            إلغاء
          </button>
          <button onClick={handleSave} className="btn btn-primary flex-1 justify-center" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة'}
          </button>
        </div>
      </div>
    </div>
  );
}
