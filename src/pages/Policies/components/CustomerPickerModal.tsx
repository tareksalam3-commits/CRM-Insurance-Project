import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Phone, FileText, User, UserPlus, Inbox, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import clsx from 'clsx';

import { searchCustomersForPicker, type CustomerPickerItem } from '../services/policiesService';

interface CustomerPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (customer: CustomerPickerItem) => void;
}

const SEARCH_DEBOUNCE_MS = 250;

export function CustomerPickerModal({ isOpen, onClose, onSelect }: CustomerPickerModalProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<CustomerPickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const requestTokenRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // إعادة الضبط فى كل مرة تُفتح فيها النافذة، وتحميل أحدث العملاء فوراً
  useEffect(() => {
    if (!isOpen) return;
    setSearchTerm('');
    setErrorMsg(null);
    runSearch('');
  }, [isOpen]);

  // بحث لحظي مع Debounce — يعمل على الاسم/الهاتف/الرقم القومي، ومرتّب دائماً
  // من الأحدث إضافةً للأقدم (نفس ترتيب runSearch الافتراضي)
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => runSearch(searchTerm), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, isOpen]);

  const runSearch = async (term: string) => {
    const token = ++requestTokenRef.current;
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await searchCustomersForPicker(term);
      // تجاهل النتيجة لو فيه بحث أحدث تم إرساله بعدها (منع سباق الاستجابات)
      if (token !== requestTokenRef.current) return;
      setResults(data);
    } catch (error) {
      console.error('Error searching customers:', error);
      if (token !== requestTokenRef.current) return;
      setErrorMsg('حدث خطأ أثناء تحميل العملاء');
      setResults([]);
    } finally {
      if (token === requestTokenRef.current) setLoading(false);
    }
  };

  const handleAddNewCustomer = () => {
    onClose();
    navigate('/customers?new=1');
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay z-[60]" onClick={onClose}>
      <div
        className="modal-content max-w-lg flex flex-col animate-slideUp sm:animate-fadeIn"
        style={{ height: 'min(85dvh, 640px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* رأس النافذة + مربع البحث */}
        <div className="p-4 sm:p-5 border-b border-secondary-200 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-secondary-900">اختيار العميل</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-secondary-100"
            >
              <X className="w-5 h-5 text-secondary-600" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-secondary-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              ref={inputRef}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم، رقم الهاتف، أو الرقم القومي"
              className="input-field pr-9"
              type="text"
              inputMode="search"
            />
          </div>
        </div>

        {/* قائمة العملاء */}
        <div className="overflow-y-auto flex-1 scrollbar-thin">
          {loading && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-secondary-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">جاري التحميل...</span>
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
              <p className="text-sm text-error-600">{errorMsg}</p>
              <button
                type="button"
                onClick={() => runSearch(searchTerm)}
                className="btn btn-secondary btn-sm"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-secondary-100 flex items-center justify-center">
                <Inbox className="w-6 h-6 text-secondary-400" />
              </div>
              <p className="text-sm text-secondary-500">لا يوجد عميل مطابق.</p>
              <button
                type="button"
                onClick={handleAddNewCustomer}
                className="btn btn-primary btn-sm mt-1"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة عميل جديد</span>
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-secondary-100">
              {results.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(customer)}
                    className="pressable w-full text-right px-4 sm:px-5 py-3.5 hover:bg-secondary-50 transition-colors flex items-start gap-3"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-secondary-900 truncate">{customer.name}</span>
                        <span className="text-[11px] text-secondary-400 shrink-0">
                          {format(new Date(customer.created_at), 'd MMM yyyy', { locale: ar })}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-secondary-500">
                        {customer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {customer.phone}
                          </span>
                        )}
                        {customer.current_policy_number && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {customer.current_policy_number}
                          </span>
                        )}
                        {customer.owner_name && (
                          <span className={clsx('flex items-center gap-1')}>
                            <User className="w-3 h-3" />
                            {customer.owner_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="safe-area-bottom shrink-0" />
      </div>
    </div>
  );
}
