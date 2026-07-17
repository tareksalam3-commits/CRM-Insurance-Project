import { Edit2, ShieldPlus, FileText, ListChecks, Printer, Trash2 } from 'lucide-react';
import { AppBottomSheet } from '../../../../components/ui/AppBottomSheet';
import type { CustomerWithRelations } from '../../types';

interface MoreActionsDialogProps {
  customer: CustomerWithRelations;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (customer: CustomerWithRelations) => void;
  onIssueNewPolicy: (customer: CustomerWithRelations) => void;
  onOpenCustomerPolicies: (customer: CustomerWithRelations) => void;
  onPrint: (customer: CustomerWithRelations) => void;
  onDeleteRequest: (customer: CustomerWithRelations) => void;
}

export function MoreActionsDialog({
  customer,
  canDelete,
  onClose,
  onEdit,
  onIssueNewPolicy,
  onOpenCustomerPolicies,
  onPrint,
  onDeleteRequest,
}: MoreActionsDialogProps) {
  return (
    <AppBottomSheet
      title={customer.name}
      subtitle={
        <p className="text-xs text-secondary-500 mt-0.5" dir="ltr">{customer.phone || '-'}</p>
      }
      onClose={onClose}
    >
      <button
        onClick={() => onEdit(customer)}
        className="dropdown-item w-full"
      >
        <Edit2 className="w-4 h-4" />
        <span>تعديل بيانات العميل</span>
      </button>
      <button
        onClick={() => onIssueNewPolicy(customer)}
        className="dropdown-item w-full"
      >
        <ShieldPlus className="w-4 h-4" />
        <span>إصدار وثيقة جديدة</span>
      </button>
      <button
        onClick={() => onOpenCustomerPolicies(customer)}
        className="dropdown-item w-full"
      >
        <FileText className="w-4 h-4" />
        <span>فتح الوثيقة الخاصة بالعميل</span>
      </button>
      <button
        onClick={() => onOpenCustomerPolicies(customer)}
        className="dropdown-item w-full"
      >
        <ListChecks className="w-4 h-4" />
        <span>عرض الأقساط والتحصيل</span>
      </button>
      <button
        onClick={() => onPrint(customer)}
        className="dropdown-item w-full"
      >
        <Printer className="w-4 h-4" />
        <span>طباعة بيانات العميل</span>
      </button>
      {canDelete ? (
        <button
          onClick={() => onDeleteRequest(customer)}
          className="dropdown-item w-full text-error-600"
        >
          <Trash2 className="w-4 h-4" />
          <span>حذف العميل</span>
        </button>
      ) : (
        <div
          className="dropdown-item w-full text-secondary-300 cursor-not-allowed"
          title="لا يمكن الحذف: يوجد وثائق مرتبطة بهذا العميل"
        >
          <Trash2 className="w-4 h-4" />
          <span>حذف العميل</span>
        </div>
      )}
    </AppBottomSheet>
  );
}
