import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useBranchContext } from '../../lib/branchContext';
import type { InstallmentWithRelations, QuickFilter } from './types';
import { Year2Collection } from './year2/Year2Collection';
import { PayInstallmentModal } from '../../features/installments/PayInstallmentModal';
import { CancelInstallmentModal } from '../../features/installments/CancelInstallmentModal';

import { useCollectionUrlParams } from './hooks/useCollectionUrlParams';
import { useCollectionFilters } from './hooks/useCollectionFilters';
import { useTeamMembers } from './hooks/useTeamMembers';
import { useCollectionInstallments } from './hooks/useCollectionInstallments';
import { useCollectionQuickStats } from './hooks/useCollectionQuickStats';
import { usePolicyInstallmentsModal } from './hooks/usePolicyInstallmentsModal';
import { useInstallmentPaymentActions } from './hooks/useInstallmentPaymentActions';

import { CollectionYearSelector } from './components/CollectionYearSelector';
import { CollectionHeader } from './components/CollectionHeader';
import { CollectionStats } from './components/CollectionStats';
import { CollectionTabs } from './components/CollectionTabs';
import { CollectionSearch } from './components/CollectionSearch';
import { CollectionFilters } from './components/CollectionFilters';
import { CollectionList } from './components/CollectionList';
import { MoreMenuDialog } from './components/dialogs/MoreMenuDialog';
import { DetailsDialog } from './components/dialogs/DetailsDialog';
import { PolicyInstallmentsDialog } from './components/dialogs/PolicyInstallmentsDialog';

// نوع السنة المطلوب عرضها: لازم المستخدم يختار قبل ما يشوف أي بيانات.
// السنة الأولى = النظام الحالي بالكامل (تارجت/محقق..إلخ) بدون أي تغيير.
// السنة الثانية = شاشة منفصلة تماماً لمتابعة التحصيل فقط.
type YearMode = 'year1' | 'year2';

export function Collection() {
  const { user } = useAuth();
  const { currentBranchId } = useBranchContext();

  const { initialSubType, initialQuickFilter, hasUrlNavigation } = useCollectionUrlParams();

  const [yearMode, setYearMode] = useState<YearMode | null>(hasUrlNavigation ? 'year1' : null);

  const {
    quickFilter,
    subType,
    ownerFilter,
    quickFilterDraft,
    setQuickFilterDraft,
    subTypeDraft,
    setSubTypeDraft,
    ownerFilterDraft,
    setOwnerFilterDraft,
    showFilters,
    handleOpenFilters,
    handleApplyFilters: applyFiltersState,
    handleResetFilters: resetFiltersState,
    handleQuickFilterSelect: selectQuickFilterState,
    activeFilterCount,
  } = useCollectionFilters({ initialQuickFilter, initialSubType });

  const {
    installments,
    loading,
    isInitialLoading,
    page,
    setPage,
    totalPages,
    totalCount,
    searchQuery,
    localSearch,
    setLocalSearch,
    loadInstallments,
  } = useCollectionInstallments({ user, yearMode, quickFilter, subType, ownerFilter, branchId: currentBranchId });

  // تطبيق/إعادة تعيين الفلاتر أو اختيار شريحة سريعة لازم يرجّع الصفحة لأول
  // صفحة دايماً — بيتم استدعاء الدالتين معاً هنا فى نفس الحدث حتى يتجمّعا
  // (batch) فى نفس التحديث ويحصل تحميل واحد فقط بالقيم الجديدة.
  const handleApplyFilters = () => { applyFiltersState(); setPage(1); };
  const handleResetFilters = () => { resetFiltersState(); setPage(1); };
  const handleQuickFilterSelect = (id: QuickFilter) => { selectQuickFilterState(id); setPage(1); };

  const hasActiveFilters = activeFilterCount > 0 || !!searchQuery;

  const teamMembers = useTeamMembers(user, currentBranchId);
  const { quickStats, quickStatsLoading, loadQuickStats } = useCollectionQuickStats(user, currentBranchId);

  const {
    showPolicyModal,
    setShowPolicyModal,
    selectedPolicy,
    policyInstallments,
    loadingPolicyInstallments,
    loadPolicyInstallments,
    handleOpenPolicyDetails,
  } = usePolicyInstallmentsModal();

  const {
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
  } = useInstallmentPaymentActions({
    user,
    loadInstallments,
    loadQuickStats,
    showPolicyModal,
    selectedPolicyId: selectedPolicy?.id,
    loadPolicyInstallments,
  });

  const [moreMenuInstallment, setMoreMenuInstallment] = useState<InstallmentWithRelations | null>(null);
  const [detailsView, setDetailsView] = useState<{ installment: InstallmentWithRelations; view: 'customer' | 'policy' } | null>(null);

  // ===================================
  // شاشة اختيار السنة — تظهر أول ما تُفتح الصفحة، ولا يُعرض أي بيانات
  // (لا سنة أولى ولا سنة ثانية) قبل ما المستخدم يختار
  // ===================================
  if (yearMode === null) {
    return (
      <CollectionYearSelector
        onSelectYear1={() => setYearMode('year1')}
        onSelectYear2={() => setYearMode('year2')}
      />
    );
  }

  return (
    <div className="space-y-5 md:space-y-6 animate-fadeIn pb-2">

      <CollectionHeader />

      <CollectionStats quickStats={quickStats} quickStatsLoading={quickStatsLoading} />

      <CollectionTabs yearMode={yearMode} onChange={setYearMode} />

      {yearMode === 'year2' ? (
        <Year2Collection branchId={currentBranchId} />
      ) : (
        <>
          {/* ===== البحث والفلاتر ===== */}
          <div className="card space-y-3">
            <CollectionSearch
              localSearch={localSearch}
              onLocalSearchChange={setLocalSearch}
              showFilters={showFilters}
              activeFilterCount={activeFilterCount}
              onOpenFilters={handleOpenFilters}
            />

            <CollectionFilters
              quickFilter={quickFilter}
              onQuickFilterSelect={handleQuickFilterSelect}
              showFilters={showFilters}
              quickFilterDraft={quickFilterDraft}
              onQuickFilterDraftChange={setQuickFilterDraft}
              subTypeDraft={subTypeDraft}
              onSubTypeDraftChange={setSubTypeDraft}
              teamMembers={teamMembers}
              ownerFilterDraft={ownerFilterDraft}
              onOwnerFilterDraftChange={setOwnerFilterDraft}
              currentUserId={user?.id}
              onResetFilters={handleResetFilters}
              onApplyFilters={handleApplyFilters}
              isInitialLoading={isInitialLoading}
              totalCount={totalCount}
              loading={loading}
            />
          </div>

          <CollectionList
            isInitialLoading={isInitialLoading}
            installments={installments}
            hasActiveFilters={hasActiveFilters}
            onResetSearchAndFilters={() => { setLocalSearch(''); handleResetFilters(); }}
            onPay={handleOpenPayment}
            onCancel={handleOpenCancel}
            onMore={setMoreMenuInstallment}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {/* ===== مودال تأكيد السداد (موحّد) ===== */}
      {showPaymentModal && selectedInstallment && (
        <PayInstallmentModal
          installment={selectedInstallment}
          contextLabel={{
            policyNumber: selectedInstallment.policy?.policy_number,
            customerName: selectedInstallment.policy?.customer?.name,
          }}
          paymentDateStr={paymentDateStr}
          onPaymentDateChange={setPaymentDateStr}
          processing={processingPayment}
          onConfirm={handleProcessPayment}
          onClose={() => setShowPaymentModal(false)}
        />
      )}

      {/* ===== مودال إلغاء السداد (موحّد) ===== */}
      {showCancelModal && selectedInstallment && (
        <CancelInstallmentModal
          installment={selectedInstallment}
          contextLabel={{ policyNumber: selectedInstallment.policy?.policy_number }}
          cancelReason={cancelReason}
          onCancelReasonChange={setCancelReason}
          processing={processingPayment}
          onConfirm={handleCancelPayment}
          onClose={() => setShowCancelModal(false)}
        />
      )}

      {/* ===== مودال "المزيد" — إجراءات إضافية لكل قسط ===== */}
      {moreMenuInstallment && (
        <MoreMenuDialog
          installment={moreMenuInstallment}
          onClose={() => setMoreMenuInstallment(null)}
          onShowCustomerDetails={() => { setDetailsView({ installment: moreMenuInstallment, view: 'customer' }); setMoreMenuInstallment(null); }}
          onShowPolicyDetails={() => { setDetailsView({ installment: moreMenuInstallment, view: 'policy' }); setMoreMenuInstallment(null); }}
          onOpenPolicyHistory={() => { handleOpenPolicyDetails(moreMenuInstallment.policy); setMoreMenuInstallment(null); }}
          onOpenCancel={() => { handleOpenCancel(moreMenuInstallment); setMoreMenuInstallment(null); }}
          onOpenPayment={() => { handleOpenPayment(moreMenuInstallment); setMoreMenuInstallment(null); }}
        />
      )}

      {/* ===== مودال بيانات العميل / الوثيقة ===== */}
      {detailsView && (
        <DetailsDialog
          installment={detailsView.installment}
          view={detailsView.view}
          onClose={() => setDetailsView(null)}
        />
      )}

      {/* ===== مودال جميع أقساط الوثيقة (سجل التحصيل) ===== */}
      {showPolicyModal && selectedPolicy && (
        <PolicyInstallmentsDialog
          policy={selectedPolicy}
          installments={policyInstallments}
          loading={loadingPolicyInstallments}
          onClose={() => setShowPolicyModal(false)}
          onPay={(inst) => { handleOpenPayment(inst); setShowPolicyModal(false); }}
          onCancel={(inst) => { handleOpenCancel(inst); setShowPolicyModal(false); }}
        />
      )}

    </div>
  );
}
