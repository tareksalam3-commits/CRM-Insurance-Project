import { useRef, useState, useEffect } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useBranchContext } from '../lib/branchContext';
import { ROLE_LABELS } from '../lib/supabase';

// سلكتور فرع صغير فى الهيدر — يظهر فقط للمستخدمين اللي عندهم أكتر من وضع
// وظيفي (أكتر من فرع). الغالبية العظمى من المستخدمين (وضع وظيفي واحد بس)
// مش هيشوفوا الكومبوننت ده إطلاقًا (بيرجع null قبل أي render فعلي).
export function BranchSelector() {
  const { branches, hasMultipleBranches, currentBranchId, setCurrentBranchId } = useBranchContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!hasMultipleBranches) return null;

  const current = branches.find((b) => b.branchId === currentBranchId);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary-100 border border-secondary-200"
        aria-label="اختيار الفرع"
      >
        <Building2 className="w-4 h-4 text-primary-600 flex-shrink-0" />
        <span className="hidden sm:inline text-sm font-medium text-secondary-900 truncate max-w-[120px]">
          {current?.branchName || 'اختر الفرع'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-secondary-500 flex-shrink-0" />
      </button>

      {open && (
        <div className="dropdown-menu min-w-[200px] left-0 right-auto">
          <div className="px-3 py-2 border-b border-secondary-100">
            <span className="text-xs font-medium text-secondary-500">الفرع الحالي</span>
          </div>
          {branches.map((b) => (
            <button
              key={b.branchId}
              onClick={() => {
                setCurrentBranchId(b.branchId);
                setOpen(false);
              }}
              className="dropdown-item w-full flex items-center justify-between gap-2"
            >
              <span className="flex flex-col items-start min-w-0">
                <span className="text-sm font-medium text-secondary-900 truncate">{b.branchName}</span>
                <span className="text-xs text-secondary-500">{ROLE_LABELS[b.role]}</span>
              </span>
              {b.branchId === currentBranchId && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
