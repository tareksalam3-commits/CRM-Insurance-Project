import { useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useBranchContext } from '../../lib/branchContext';
import type { Policy } from '../../lib/supabase';

import { PoliciesHeader } from './components/PoliciesHeader';
import { PoliciesStats } from './components/PoliciesStats';
import { PoliciesSearch } from './components/PoliciesSearch';
import { PoliciesFilters } from './components/PoliciesFilters';
import { PoliciesList } from './components/PoliciesList';
import { PolicyFormDialog } from './components/dialogs/PolicyFormDialog';
import { DeletePolicyDialog } from './components/dialogs/DeletePolicyDialog';
import { MoreActionsDialog } from './components/dialogs/MoreActionsDialog';
import { CustomerPickerModal } from './components/CustomerPickerModal';

import { usePolicyFilters } from './hooks/usePolicyFilters';
import { usePolicies } from './hooks/usePolicies';
import { usePolicyActions } from './hooks/usePolicyActions';

export function Policies() {
  const { user } = useAuth();
  const { currentBranchId } = useBranchContext();

  const filters = usePolicyFilters();
  const {
    searchParams, setSearchParams, page, setPage, searchQuery, localSearch, setLocalSearch,
    statusFilter, typeFilter, monthFilter,
    statusDraft, setStatusDraft, typeDraft, setTypeDraft, monthDraft, setMonthDraft,
    showFilters, setShowFilters, activeFilterCount, hasActiveFilters, monthOptions,
    handleApplyFilters, handleResetFilters, handleResetAll,
  } = filters;

  const {
    policies, loading, isInitialLoading, totalCount,
    stats, statsLoading, totalPages, deletableIds,
    loadPolicies, loadStats,
  } = usePolicies(user, page, searchQuery, statusFilter, typeFilter, monthFilter, currentBranchId);

  const actions = usePolicyActions({ user, searchParams, setSearchParams, loadPolicies, loadStats });
  const {
    showModal, editingPolicy, saving, handleOpenModal, handleCloseModal, onSubmit,
    register, handleSubmit, errors,
    deleteConfirm, setDeleteConfirm, deleting, handleDeletePolicy,
    moreMenuPolicy, setMoreMenuPolicy, handleStatusChange, handlePrintPolicy,
    presetCustomerId, selectedCustomer, showCustomerPicker, setShowCustomerPicker, handleSelectCustomer,
    customerDefaultsLocked,
    navigate,
  } = actions;

  // نسخ ثابتة من الدوال الممرَّرة لقائمة الوثائق (React.memo) حتى لا تتسبب
  // إعادة إنشائها فى كل Render فى إعادة رسم كل البطاقات بلا داعٍ
  const openAddPolicyModal = useCallback(() => handleOpenModal(), [handleOpenModal]);
  const goToPolicyDetails = useCallback((policy: Policy) => navigate(`/policies/${policy.id}`), [navigate]);

  // فتح تفاصيل الوثيقة — نفس التنقل الموجود فى الكارت وفى مودال "المزيد"
  // (تسجيل سداد / عرض الأقساط كلاهما بيودّي لنفس صفحة تفاصيل الوثيقة)
  const handleGoToPolicy = (policy: Policy) => {
    setMoreMenuPolicy(null);
    navigate(`/policies/${policy.id}`);
  };

  // طلب حذف وثيقة من مودال "المزيد": بيقفل مودال المزيد ويفتح تأكيد الحذف
  const handleDeleteRequest = (policy: Policy) => {
    setMoreMenuPolicy(null);
    setDeleteConfirm(policy);
  };

  const handleOpenActivityLog = () => {
    setMoreMenuPolicy(null);
    navigate('/activity-log');
  };

  return (
    <div className="space-y-5 md:space-y-6 animate-fadeIn pb-6">
      {/* ===== أعلى الصفحة ===== */}
      <PoliciesHeader onAddPolicy={openAddPolicyModal} />

      {/* ===== بطاقات إحصائية ===== */}
      <PoliciesStats stats={stats} statsLoading={statsLoading} />

      {/* ===== البحث والفلاتر ===== */}
      <div className="card space-y-3">
        <PoliciesSearch
          localSearch={localSearch}
          onLocalSearchChange={setLocalSearch}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          activeFilterCount={activeFilterCount}
          isInitialLoading={isInitialLoading}
          loading={loading}
          totalCount={totalCount}
          filtersPanel={showFilters && (
            <PoliciesFilters
              statusDraft={statusDraft}
              onStatusDraftChange={setStatusDraft}
              typeDraft={typeDraft}
              onTypeDraftChange={setTypeDraft}
              monthDraft={monthDraft}
              onMonthDraftChange={setMonthDraft}
              monthOptions={monthOptions}
              onApply={handleApplyFilters}
              onReset={handleResetFilters}
            />
          )}
        />
      </div>

      {/* ===== قائمة الوثائق ===== */}
      <PoliciesList
        isInitialLoading={isInitialLoading}
        policies={policies}
        hasActiveFilters={hasActiveFilters}
        onResetAll={handleResetAll}
        onAddPolicy={openAddPolicyModal}
        onOpenDetails={goToPolicyDetails}
        onOpenMoreMenu={setMoreMenuPolicy}
        page={page}
        setPage={setPage}
        totalPages={totalPages}
      />

      {/* ===== مودال إصدار/تعديل وثيقة ===== */}
      {showModal && (
        <PolicyFormDialog
          editingPolicy={editingPolicy}
          presetCustomerId={presetCustomerId}
          selectedCustomer={selectedCustomer}
          customerDefaultsLocked={customerDefaultsLocked}
          onOpenCustomerPicker={() => setShowCustomerPicker(true)}
          register={register}
          handleSubmit={handleSubmit}
          onSubmit={onSubmit}
          errors={errors}
          saving={saving}
          onClose={handleCloseModal}
        />
      )}

      {/* ===== مودال اختيار العميل ===== */}
      <CustomerPickerModal
        isOpen={showCustomerPicker}
        onClose={() => setShowCustomerPicker(false)}
        onSelect={handleSelectCustomer}
      />

      {/* ===== مودال تأكيد حذف الوثيقة ===== */}
      {deleteConfirm && (
        <DeletePolicyDialog
          deleteConfirm={deleteConfirm}
          deleting={deleting}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={handleDeletePolicy}
        />
      )}

      {/* ===== مودال "المزيد" (إجراءات البطاقة) ===== */}
      {moreMenuPolicy && (
        <MoreActionsDialog
          policy={moreMenuPolicy}
          canDelete={deletableIds.has(moreMenuPolicy.id)}
          onClose={() => setMoreMenuPolicy(null)}
          onEdit={handleOpenModal}
          onGoToPolicy={handleGoToPolicy}
          onPrint={handlePrintPolicy}
          onReactivate={(policy) => handleStatusChange(policy, 'active')}
          onCancelPolicy={(policy) => handleStatusChange(policy, 'cancelled')}
          onDeleteRequest={handleDeleteRequest}
          onOpenActivityLog={handleOpenActivityLog}
        />
      )}
    </div>
  );
}
