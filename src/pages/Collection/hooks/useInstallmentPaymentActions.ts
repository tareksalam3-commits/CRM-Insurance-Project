import { useCallback, useState } from 'react';
import { format } from 'date-fns';
import type { User } from '../../../lib/supabase';
import type { InstallmentWithRelations } from '../types';
import { processPayment, cancelPayment } from '../services/collectionService';

interface UseInstallmentPaymentActionsArgs {
  user: User | null | undefined;
  loadInstallments: () => Promise<void>;
  loadQuickStats: () => Promise<void>;
  showPolicyModal: boolean;
  selectedPolicyId: string | undefined;
  loadPolicyInstallments: (policyId: string) => Promise<void>;
}

export function useInstallmentPaymentActions({
  user,
  loadInstallments,
  loadQuickStats,
  showPolicyModal,
  selectedPolicyId,
  loadPolicyInstallments,
}: UseInstallmentPaymentActionsArgs) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentWithRelations | null>(null);
  const [paymentDateStr, setPaymentDateStr] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const handleOpenPayment = useCallback((installment: InstallmentWithRelations) => {
    setSelectedInstallment(installment);
    setPaymentDateStr(format(new Date(), 'yyyy-MM-dd'));
    setShowPaymentModal(true);
  }, []);

  // ===================================
  // تسجيل السداد
  // ===================================
  const handleProcessPayment = async () => {
    if (!selectedInstallment || !user) return;
    setProcessingPayment(true);
    try {
      await processPayment(selectedInstallment, user.id, new Date(paymentDateStr));

      setShowPaymentModal(false);
      setSelectedInstallment(null);
      // إعادة تحميل القائمة الرئيسية وبطاقات الإحصائيات
      loadInstallments();
      loadQuickStats();
      // لو مودال الوثيقة مفتوح، حدّثه هو كمان
      if (showPolicyModal && selectedPolicyId) {
        loadPolicyInstallments(selectedPolicyId);
      }
    } catch (error: any) {
      console.error('Error processing payment:', error);
      alert(error?.message || 'حدث خطأ أثناء تسجيل السداد');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleOpenCancel = useCallback((installment: InstallmentWithRelations) => {
    setSelectedInstallment(installment);
    setCancelReason('');
    setShowCancelModal(true);
  }, []);

  // ===================================
  // إلغاء السداد
  // ===================================
  const handleCancelPayment = async () => {
    if (!selectedInstallment || !user) return;
    setProcessingPayment(true);
    try {
      const { error } = await cancelPayment(selectedInstallment, user.id, cancelReason);

      if (error) {
        alert(error);
        return;
      }

      setShowCancelModal(false);
      setSelectedInstallment(null);
      setCancelReason('');
      loadInstallments();
      loadQuickStats();
      if (showPolicyModal && selectedPolicyId) {
        loadPolicyInstallments(selectedPolicyId);
      }
    } catch (error) {
      console.error('Error cancelling payment:', error);
      alert('حدث خطأ أثناء إلغاء السداد');
    } finally {
      setProcessingPayment(false);
    }
  };

  return {
    showPaymentModal,
    setShowPaymentModal,
    selectedInstallment,
    paymentDateStr,
    setPaymentDateStr,
    processingPayment,
    showCancelModal,
    setShowCancelModal,
    cancelReason,
    setCancelReason,
    handleOpenPayment,
    handleProcessPayment,
    handleOpenCancel,
    handleCancelPayment,
  };
}
