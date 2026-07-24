import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useReconnectRefetch } from '../../hooks/useReconnectRefetch';
import { useBranchContext } from '../../lib/branchContext';
import { POLICY_TYPE_LABELS, type PolicyType } from '../../lib/supabase';
import { ArrowRight, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

import type { CancellationSummary, CancellationDetailRow } from './types';
import { loadCancellationSummary } from './services/cancellationService';

type SortKey = 'customerName' | 'startDate' | 'cancelledDate' | 'monthsElapsed' | 'totalPaidBeforeCancellation' | 'premiumAmount';
type MonthsBucket = 'all' | 'lt6' | '6to12' | '12to18';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export function Cancellations() {
  const { user } = useAuth();
  const { currentBranchId } = useBranchContext();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<CancellationSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [policyTypeFilter, setPolicyTypeFilter] = useState<'all' | PolicyType>('all');
  const [monthsBucket, setMonthsBucket] = useState<MonthsBucket>('all');
  const [sortKey, setSortKey] = useState<SortKey>('cancelledDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, currentBranchId]);

  useReconnectRefetch(() => { if (user) loadData(); });

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await loadCancellationSummary({ id: user.id, name: user.name, role: user.role }, currentBranchId);
      setSummary(result);
    } catch (error) {
      console.error('Error loading cancellations summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filteredRows = useMemo(() => {
    if (!summary) return [];
    const term = searchTerm.trim().toLowerCase();

    let rows = summary.rows.filter((r) => {
      if (policyTypeFilter !== 'all' && r.policyType !== policyTypeFilter) return false;

      if (monthsBucket === 'lt6' && !(r.monthsElapsed < 6)) return false;
      if (monthsBucket === '6to12' && !(r.monthsElapsed >= 6 && r.monthsElapsed < 12)) return false;
      if (monthsBucket === '12to18' && !(r.monthsElapsed >= 12 && r.monthsElapsed < 18)) return false;

      if (!term) return true;
      return (
        r.customerName.toLowerCase().includes(term) ||
        r.policyNumberLast6.toLowerCase().includes(term) ||
        r.agentName.toLowerCase().includes(term) ||
        r.groupLeaderName.toLowerCase().includes(term) ||
        r.supervisorName.toLowerCase().includes(term) ||
        r.generalSupervisorName.toLowerCase().includes(term)
      );
    });

    rows = [...rows].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'ar') * dir;
    });

    return rows;
  }, [summary, searchTerm, policyTypeFilter, monthsBucket, sortKey, sortDir]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="w-3.5 h-3.5 text-secondary-300" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-primary-600" />
      : <ArrowDown className="w-3.5 h-3.5 text-primary-600" />;
  };

  const columns: { key: SortKey | null; label: string }[] = [
    { key: null, label: 'اسم العميل' },
    { key: null, label: 'رقم الوثيقة' },
    { key: null, label: 'الوكيل' },
    { key: null, label: 'رئيس المجموعة' },
    { key: null, label: 'المراقب' },
    { key: null, label: 'المراقب العام' },
    { key: 'startDate', label: 'تاريخ البداية' },
    { key: 'cancelledDate', label: 'تاريخ الإلغاء' },
    { key: 'monthsElapsed', label: 'عدد الأشهر' },
    { key: 'totalPaidBeforeCancellation', label: 'الأقساط المسددة قبل الإلغاء' },
    { key: 'premiumAmount', label: 'قيمة القسط الصافي' },
    { key: null, label: 'نوع الوثيقة' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-secondary-100"
        >
          <ArrowRight className="w-5 h-5 text-secondary-600" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-secondary-900">تفاصيل الإلغاءات</h2>
          <p className="text-sm text-secondary-500 mt-1">
            الوثائق التي دخلت في حساب مؤشر نسبة الإلغاءات لسنة {summary?.year || new Date().getFullYear()}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="kpi-card border-r-4 border-r-error-500">
              <p className="text-sm text-secondary-500">نسبة الإلغاءات</p>
              <p className="text-2xl font-bold text-error-600 mt-1">
                {summary?.cancellationRate ?? 0}%
              </p>
            </div>
            <div className="kpi-card border-r-4 border-r-error-500">
              <p className="text-sm text-secondary-500">قيمة الإلغاءات</p>
              <p className="text-2xl font-bold text-error-600 mt-1">
                {formatCurrency(summary?.cancelledValue || 0)}
              </p>
            </div>
            <div className="kpi-card">
              <p className="text-sm text-secondary-500">إجمالي الأقساط المسددة هذا العام</p>
              <p className="text-2xl font-bold text-secondary-900 mt-1">
                {formatCurrency(summary?.totalCollected || 0)}
              </p>
            </div>
          </div>

          <div className="card">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ابحث باسم العميل، الوكيل، رقم الوثيقة..."
                  className="input-field pr-10 w-full"
                />
              </div>

              <select
                value={policyTypeFilter}
                onChange={(e) => setPolicyTypeFilter(e.target.value as any)}
                className="input-field w-auto"
              >
                <option value="all">كل أنواع الوثائق</option>
                {Object.entries(POLICY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>

              <select
                value={monthsBucket}
                onChange={(e) => setMonthsBucket(e.target.value as MonthsBucket)}
                className="input-field w-auto"
              >
                <option value="all">كل المدد</option>
                <option value="lt6">أقل من 6 أشهر</option>
                <option value="6to12">من 6 إلى أقل من 12 شهر</option>
                <option value="12to18">من 12 إلى أقل من 18 شهر</option>
              </select>
            </div>

            {filteredRows.length === 0 ? (
              <p className="text-center text-secondary-400 py-10">
                لا توجد وثائق مطابقة ضمن مؤشر نسبة الإلغاءات
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-secondary-200">
                      {columns.map((col) => (
                        <th
                          key={col.label}
                          className="text-right py-2 px-3 text-secondary-500 font-medium whitespace-nowrap"
                        >
                          {col.key ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(col.key as SortKey)}
                              className="inline-flex items-center gap-1 hover:text-secondary-800"
                            >
                              {col.label}
                              <SortIcon column={col.key as SortKey} />
                            </button>
                          ) : (
                            col.label
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row: CancellationDetailRow) => (
                      <tr
                        key={row.policyId}
                        className="border-b border-secondary-100 hover:bg-secondary-50"
                      >
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">{row.customerName}</td>
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">{row.policyNumberLast6}</td>
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">{row.agentName || '-'}</td>
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">{row.groupLeaderName || '-'}</td>
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">{row.supervisorName || '-'}</td>
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">{row.generalSupervisorName || '-'}</td>
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">
                          {format(new Date(row.startDate), 'd MMM yyyy', { locale: ar })}
                        </td>
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">
                          {format(new Date(row.cancelledDate), 'd MMM yyyy', { locale: ar })}
                        </td>
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">{row.monthsElapsed}</td>
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">
                          {formatCurrency(row.totalPaidBeforeCancellation)}
                        </td>
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">
                          {formatCurrency(row.premiumAmount)}
                        </td>
                        <td className="py-2 px-3 text-secondary-700 whitespace-nowrap">
                          {POLICY_TYPE_LABELS[row.policyType] || row.policyType}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
