import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import type { CustomerWithRelations } from '../../types';

interface DeleteCustomerDialogProps {
  deleteConfirm: CustomerWithRelations;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteCustomerDialog({ deleteConfirm, deleting, onClose, onConfirm }: DeleteCustomerDialogProps) {
  return (
    <ConfirmDialog
      title="تأكيد الحذف"
      message={
        <>
          هل أنت متأكد من حذف العميل{' '}
          <span className="font-medium text-secondary-900">{deleteConfirm.name}</span>؟
          لا يمكن التراجع عن هذا الإجراء.
        </>
      }
      busy={deleting}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
