import { Plus } from 'lucide-react';
import { PageHeader } from '../../../components/layout/PageHeader';

interface CustomersHeaderProps {
  onAddCustomer: () => void;
}

export function CustomersHeader({ onAddCustomer }: CustomersHeaderProps) {
  return (
    <PageHeader
      title="العملاء"
      titleSuffix="طلبات التأمين"
      subtitle="إدارة بيانات العملاء ومتابعة وثائقهم"
      action={
        <button
          onClick={onAddCustomer}
          className="btn btn-primary w-full sm:w-auto shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة عميل</span>
        </button>
      }
    />
  );
}