import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import type { Policy } from '../../../../lib/supabase';

interface DeletePolicyDialogProps {
  deleteConfirm: Policy;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeletePolicyDialog({ deleteConfirm, deleting, onClose, onConfirm }: DeletePolicyDialogProps) {
  return (
    <ConfirmDialog
      title="تأكيد حذف الوثيقة"
      message={
        <>
          هل أنت متأكد من حذف الوثيقة رقم{' '}
          <span className="font-medium text-secondary-900">{deleteConfirm.policy_number}</span>؟
        </>
      }
      warning="لا يمكن التراجع عن هذا الإجراء، وسيتم حذف كل الأقساط المرتبطة بها."
      busy={deleting}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
