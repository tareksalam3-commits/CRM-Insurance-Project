import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { formatCurrency } from '../business/reportsCalculator';

type RawInstallment = {
  agentId: string | null;
  agentName: string;
  customerName: string;
  policyNumber: string;
  dueDate: string;
  amount: number;
  status: 'paid' | 'unpaid';
};

// جدول تفاصيل منظّم لتقارير التحصيل: بيجمع الأقساط تحت اسم كل وكيل، وبيحط
// تحت كل وكيل إجمالي المسدد وإجمالي المتبقي غير المسدد، ثم إجمالي عام فى
// الآخر. الفلتر (statusFilter) بيحدد إيه اللي يظهر فى الجدول نفسه بس —
// لو "الكل": بتتعرض كل الأقساط وتحت كل وكيل السطرين (مسدد + غير مسدد).
// لو "مسدد" أو "غير مسدد": بتتعرض بس الأقساط المطابقة، وتحت كل وكيل سطر
// واحد بالإجمالي المطابق.
export function CollectionDetailsByAgent({
  installments,
  statusFilter,
}: {
  installments: RawInstallment[];
  statusFilter: 'all' | 'paid' | 'unpaid';
}) {
  const filtered = statusFilter === 'all'
    ? installments
    : installments.filter((i) => i.status === statusFilter);

  const groups = new Map<string, RawInstallment[]>();
  filtered.forEach((i) => {
    const key = i.agentId || i.agentName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });

  const sortedGroups = Array.from(groups.entries()).sort((a, b) =>
    a[1][0].agentName.localeCompare(b[1][0].agentName, 'ar')
  );

  const grandPaid = filtered.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const grandUnpaid = filtered.filter((i) => i.status === 'unpaid').reduce((s, i) => s + i.amount, 0);

  return (
    <div className="card print:shadow-none print:border print:break-inside-avoid">
      <h3 className="font-semibold text-secondary-900 mb-4">تفاصيل السجلات (مجمّعة حسب الوكيل)</h3>
      {sortedGroups.length > 0 ? (
        <div className="space-y-6">
          {sortedGroups.map(([agentKey, rows]) => {
            const agentPaid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
            const agentUnpaid = rows.filter((r) => r.status === 'unpaid').reduce((s, r) => s + r.amount, 0);
            return (
              <div key={agentKey} className="print:break-inside-avoid">
                <h4 className="font-semibold text-secondary-800 mb-2 border-b border-secondary-200 pb-1">
                  {rows[0].agentName}
                </h4>
                <div className="table-container print:hover:bg-transparent">
                  <table>
                    <thead>
                      <tr>
                        <th>العميل</th>
                        <th>رقم الوثيقة</th>
                        <th>التاريخ</th>
                        <th>المبلغ</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => (
                        <tr key={idx}>
                          <td>{r.customerName}</td>
                          <td>{r.policyNumber}</td>
                          <td>{format(new Date(r.dueDate), 'd MMMM yyyy', { locale: ar })}</td>
                          <td>{formatCurrency(r.amount)}</td>
                          <td>{r.status === 'paid' ? 'مسدد' : 'غير مسدد'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {statusFilter !== 'unpaid' && (
                        <tr>
                          <td colSpan={3} className="font-semibold text-success-700">إجمالي المسدد</td>
                          <td colSpan={2} className="font-semibold text-success-700">{formatCurrency(agentPaid)}</td>
                        </tr>
                      )}
                      {statusFilter !== 'paid' && (
                        <tr>
                          <td colSpan={3} className="font-semibold text-amber-700">إجمالي المتبقي غير المسدد</td>
                          <td colSpan={2} className="font-semibold text-amber-700">{formatCurrency(agentUnpaid)}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}

          <div className="pt-3 border-t-2 border-secondary-300 print:break-inside-avoid">
            <div className="flex flex-wrap gap-4">
              {statusFilter !== 'unpaid' && (
                <div className="p-3 bg-success-50 rounded-lg print:bg-white print:border">
                  <p className="text-sm text-secondary-600">إجمالي المسدد (كل الوكلاء)</p>
                  <p className="text-lg font-bold text-success-700">{formatCurrency(grandPaid)}</p>
                </div>
              )}
              {statusFilter !== 'paid' && (
                <div className="p-3 bg-amber-50 rounded-lg print:bg-white print:border">
                  <p className="text-sm text-secondary-600">إجمالي المتبقي غير المسدد (كل الوكلاء)</p>
                  <p className="text-lg font-bold text-amber-700">{formatCurrency(grandUnpaid)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-secondary-400 text-center py-6">لا توجد سجلات مطابقة لهذه الفلاتر</p>
      )}
    </div>
  );
}
