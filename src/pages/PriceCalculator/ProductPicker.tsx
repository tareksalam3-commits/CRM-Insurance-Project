import { useMemo, useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, PackageSearch, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

import { AppDialog } from '../../components/ui/AppDialog';
import { PRICING_VARIANTS, FAMILY_ORDER, type ProductFamily, type PricingVariant } from './pricingData';

const FAMILY_LABELS: Record<ProductFamily, string> = {
  quaternary: 'الرباعية',
  protection_investment: 'حماية واستثمار',
  mixed: 'مختلط',
  fixed_term: 'ذو أقساط',
  pension_reassurance: 'معاش واطمئنان',
};

interface ProductPickerProps {
  value: string;
  onChange: (key: string) => void;
  error?: string;
}

// ─── اختيار نوع الوثيقة: واجهة بحث وتصفح احترافية بدلاً من <select> الطويلة ───
// نفس البيانات ونفس القيم تمامًا (PRICING_VARIANTS / FAMILY_ORDER) — تحسين
// فى تجربة الاختيار فقط، بدون أى تغيير فى الأسماء أو الترتيب أو الحسابات.
export function ProductPicker({ value, onChange, error }: ProductPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => PRICING_VARIANTS.find((v) => v.key === value),
    [value]
  );

  const groupedFiltered = useMemo(() => {
    const q = query.trim();
    const groups = new Map<ProductFamily, PricingVariant[]>();
    for (const family of FAMILY_ORDER) {
      const items = PRICING_VARIANTS.filter(
        (v) => v.family === family && (!q || v.label.includes(q))
      );
      if (items.length > 0) groups.set(family, items);
    }
    return groups;
  }, [query]);

  const hasResults = groupedFiltered.size > 0;

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      // فتح لوحة المفاتيح/التركيز على البحث فور فتح الصندوق
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen]);

  function handleSelect(key: string) {
    onChange(key);
    setIsOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={clsx(
          'input-field flex items-center justify-between gap-2 text-right cursor-pointer',
          !selected && 'text-secondary-400'
        )}
      >
        <span className="truncate">{selected ? selected.label : 'اختر نوع الوثيقة...'}</span>
        <ChevronDown className="w-4 h-4 text-secondary-400 flex-shrink-0" />
      </button>

      {isOpen && (
        <AppDialog onClose={() => setIsOpen(false)} className="max-w-md animate-fadeIn max-h-[85dvh] flex flex-col">
          {/* رأس الصندوق + مربع البحث */}
          <div className="p-4 border-b border-secondary-200 sticky top-0 bg-white z-10 space-y-3 rounded-t-2xl sm:rounded-t-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-secondary-900">اختر نوع الوثيقة</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-500 text-xl leading-none"
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-secondary-400 absolute top-1/2 -translate-y-1/2 right-3.5 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن نوع الوثيقة..."
                className="input-field pr-10"
              />
            </div>
          </div>

          {/* قائمة المنتجات المجمعة */}
          <div className="overflow-y-auto flex-1 scrollbar-thin px-2 py-2">
            {!hasResults && (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-secondary-400">
                <PackageSearch className="w-8 h-8" />
                <p className="text-sm">لا توجد نتائج مطابقة للبحث</p>
              </div>
            )}

            {FAMILY_ORDER.map((family) => {
              const items = groupedFiltered.get(family);
              if (!items) return null;
              return (
                <div key={family} className="mb-2">
                  <div className="sticky top-0 bg-secondary-50 text-secondary-500 text-xs font-semibold px-3 py-1.5 rounded-lg mb-1">
                    {FAMILY_LABELS[family]}
                  </div>
                  <div className="space-y-1">
                    {items.map((v) => {
                      const active = v.key === value;
                      return (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => handleSelect(v.key)}
                          className={clsx(
                            'w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-sm text-right transition-colors duration-150',
                            active
                              ? 'bg-primary-50 text-primary-700 font-semibold ring-1 ring-primary-200'
                              : 'text-secondary-700 hover:bg-secondary-50 active:bg-secondary-100'
                          )}
                        >
                          <span className="truncate">{v.label}</span>
                          {active && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="safe-area-bottom" />
        </AppDialog>
      )}

      {error && (
        <p className="text-xs text-error-600 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
    </>
  );
}
