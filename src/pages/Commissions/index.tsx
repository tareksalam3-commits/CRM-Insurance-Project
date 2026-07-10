import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Wallet, CalendarClock, CalendarCheck2, Percent } from 'lucide-react';
import clsx from 'clsx';

import type { CommissionRow } from './types';
import { fetchCommissionSourceData } from './services/commissionsService';
import {
  computeCommissionRows,
  computeSummary,
  formatCurrency,
  COMMISSION_TYPE_LABELS,
} from './business/commissionsCalculator';

// صفحة العمولات: مستقلة تماماً عن باقي صفحات النظام — للعرض فقط، لا تُخزَّن
// أي عمولة بقاعدة البيانات، وتُحسب لحظياً اعتماداً على بيانات التحصيل
// الموجودة بالفعل (installments/payments لسنة أولى + year2_payments
// للتجديد). كل مستخدم يرى فقط عمولات الوثائق التي هو owner_id لها.
export function Commissions() {
  const { user } = useAuth();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCommissions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const selectedMonthDate = new Date(year, month - 1, 1);

      const { year1Payments, year2Payments } = await fetchCommissionSourceData(user.id, selectedMonthDate);
      const computedRows = computeCommissionRows(year1Payments, year2Payments, selectedMonth);

      // الأحدث أولاً حسب يوم الاستحقاق ثم النوع
      computedRows.sort((a, b) => a.dueDay - b.dueDay);
      setRows(computedRows);
    } catch (error) {
      console.error('Error loading commissions:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user, selectedMonth]);

  useEffect(() => {
    loadCommissions();
  }, [loadCommissions]);

  const summary = computeSummary(rows);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-secondary-900">العمولات</h1>

        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="input-field w-auto"
        />
      </div>

      {/* بطاقات الملخص */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary-500">إجمالي عمولات الشهر</p>
              <p className="text-2xl font-bold text-secondary-900 mt-1">
                {formatCurrency(summary.totalMonth)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-primary-600" />
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary-500">عمولات مستحقة يوم 20</p>
              <p className="text-2xl font-bold text-secondary-900 mt-1">
                {formatCurrency(summary.dueOn20)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-warning-100 flex items-center justify-center">
              <CalendarClock className="w-6 h-6 text-warning-600" />
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary-500">عمولات مستحقة يوم 5</p>
              <p className="text-2xl font-bold text-secondary-900 mt-1">
                {formatCurrency(summary.dueOn5)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-success-100 flex items-center justify-center">
              <CalendarCheck2 className="w-6 h-6 text-success-600" />
            </div>
          </div>
        </div>
      </div>

      {/* الجدول */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12">
            <Percent className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
            <p className="text-secondary-500">لا توجد عمولات لهذا الشهر</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>اسم العميل</th>
                  <th>رقم الوثيقة</th>
                  <th>نوع العمولة</th>
                  <th>قيمة العمولة</th>
                  <th>تستحق يوم</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.customerName}</td>
                    <td className="font-medium">{row.policyLast6}</td>
                    <td>
                      <span
                        className={clsx(
                          'badge',
                          row.type === 'year1' ? 'badge-info' : 'badge-success'
                        )}
                      >
                        {COMMISSION_TYPE_LABELS[row.type]}
                      </span>
                    </td>
                    <td className="font-semibold">{formatCurrency(row.amount)}</td>
                    <td>{row.dueDay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
