import { useState } from 'react';
import type { Policy, Installment } from '../../../lib/supabase';
import { fetchPolicyInstallments } from '../services/collectionService';

export function usePolicyInstallmentsModal() {
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy]   = useState<Policy | null>(null);
  const [policyInstallments, setPolicyInstallments] = useState<Installment[]>([]);
  const [loadingPolicyInstallments, setLoadingPolicyInstallments] = useState(false);

  const loadPolicyInstallments = async (policyId: string) => {
    setLoadingPolicyInstallments(true);
    try {
      setPolicyInstallments(await fetchPolicyInstallments(policyId));
    } catch (error) {
      console.error('Error loading policy installments:', error);
      alert('حدث خطأ أثناء تحميل الأقساط');
    } finally {
      setLoadingPolicyInstallments(false);
    }
  };

  const handleOpenPolicyDetails = (policy: Policy) => {
    setSelectedPolicy(policy);
    setShowPolicyModal(true);
    loadPolicyInstallments(policy.id);
  };

  return {
    showPolicyModal,
    setShowPolicyModal,
    selectedPolicy,
    policyInstallments,
    loadingPolicyInstallments,
    loadPolicyInstallments,
    handleOpenPolicyDetails,
  };
}
