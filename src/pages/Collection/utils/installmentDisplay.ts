import { differenceInCalendarDays, startOfMonth } from 'date-fns';
import type { InstallmentWithRelations } from '../types';

export interface InstallmentDisplayInfo {
  dueDate: Date;
  isPaid: boolean;
  // "متأخر" فقط لو تاريخ الاستحقاق كان في شهر سابق (قبل بداية الشهر
  // الحالي) — نفس حد فلتر "المتأخر" بالضبط في collectionService.
  // أي قسط مستحق خلال الشهر الحالي (حتى لو فات يومه) يفضل "مستحق"
  // طول الشهر ولا يتحول لـ "متأخر" إلا في الشهر التالي.
  isOverdue: boolean;
  dayLabel: string;
  badgeClass: string;
  statusLabel: string;
}

export function getInstallmentDisplayInfo(installment: InstallmentWithRelations): InstallmentDisplayInfo {
  const dueDate = new Date(installment.due_date);
  const daysDiff = differenceInCalendarDays(dueDate, new Date());
  const isPaid = installment.status === 'paid';
  const isOverdue = !isPaid && dueDate < startOfMonth(new Date());

  let dayLabel = '';
  if (!isPaid) {
    if (isOverdue) dayLabel = `متأخر ${Math.abs(daysDiff)} يوم`;
    else if (daysDiff === 0) dayLabel = 'مستحق اليوم';
    else if (daysDiff > 0) dayLabel = `متبقي ${daysDiff} يوم`;
    else dayLabel = `مستحق منذ ${Math.abs(daysDiff)} يوم`;
  }

  const badgeClass = isPaid ? 'badge-success' : isOverdue ? 'badge-error' : 'badge-warning';
  const statusLabel = isPaid ? 'تم السداد' : isOverdue ? 'متأخر' : 'مستحق';

  return { dueDate, isPaid, isOverdue, dayLabel, badgeClass, statusLabel };
}
