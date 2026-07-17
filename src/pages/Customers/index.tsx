import { useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';

import { CustomersHeader } from './components/CustomersHeader';
import { CustomerStatsCards } from './components/CustomerStatsCards';
import { CustomerSearch } from './components/CustomerSearch';
import { CustomerFilters } from './components/CustomerFilters';
import { CustomerList } from './components/CustomerList';
import { CustomerFormDialog } from './components/dialogs/AddCustomerDialog';
import { DeleteCustomerDialog } from './components/dialogs/DeleteCustomerDialog';
import { MoreActionsDialog } from './components/dialogs/MoreActionsDialog';
import { CustomerDetailsDialog } from './components/dialogs/CustomerDetailsDialog';
import { PolicyDetailsDialog } from './components/dialogs/PolicyDetailsDialog';

import { PayInstallmentModal } from '../../features/installments/PayInstallmentModal';
import { CancelInstallmentModal } from '../../features/installments/CancelInstallmentModal';

import { useCustomerFilters } from './hooks/useCustomerFilters';
import { useCustomers } from './hooks/useCustomers';
import { useCustomerActions } from './hooks/useCustomerActions';
import type { CustomerWithRelations } from './types';

export function Customers() {
  const { user } = useAuth();

  const isManagerRole = !!user && user.role !== 'agent' && user.role !== 'premium_agent';

  const filters = useCustomerFilters();
  const {
    searchParams, setSearchParams, page, setPage, searchQuery, localSearch, setLocalSearch,
    statusFilter, agentFilter, monthFilter,
    statusDraft, setStatusDraft, agentDraft, setAgentDraft, monthDraft, setMonthDraft,
    showFilters, setShowFilters, activeFilterCount, hasActiveFilters, monthOptions,
    handleApplyFilters, handleResetFilters, handleResetAll,
  } = filters;

  const {
    customers, agents, loading, isInitialLoading, totalCount,
    stats, statsLoading, totalPages, deletableIds,
    loadCustomers, loadStats,
  } = useCustomers(user, page, searchQuery, statusFilter, agentFilter, monthFilter);

  const actions = useCustomerActions({ user, searchParams, setSearchParams, loadCustomers, loadStats });
  const {
    showModal, editingCustomer, saving, handleOpenModal, handleCloseModal, onSubmit,
    register, handleSubmit, setValue, errors, ownerIdValue,
    deleteConfirm, setDeleteConfirm, deleting, handleDelete,
    moreMenuCustomer, setMoreMenuCustomer, handleOpenCustomerPolicies, handleIssueNewPolicy, handlePrintCustomer,
    detailsCustomer, setDetailsCustomer, showExtraInfo, setShowExtraInfo, policySummaries, handleOpenCustomerDetails,
    openPolicySummary, policyDetail, policyInstallments, loadingPolicyDetail,
    handleOpenPolicyDetails, handleClosePolicyDetails,
    selectedInstallment, showPayModal, setShowPayModal, paymentDateStr, setPaymentDateStr,
    showCancelModal, setShowCancelModal, cancelReason, setCancelReason, processingPayment,
    handleOpenPayment, handleProcessPayment, handleOpenCancel, handleCancelPayment,
  } = actions;

  // نسخة بدون معاملات من handleOpenModal لاستخدامها كمرجع ثابت (زر "إضافة
  // عميل" فى الهيدر وفى القائمة) حتى لا تتسبب فى إعادة رسم غير ضرورية
  // للقائمة الممرَّرة لها React.memo
  const openAddCustomerModal = useCallback(() => handleOpenModal(), [handleOpenModal]);

  // فتح "تعديل بيانات العميل" من داخل مودال تفاصيل العميل: بيقفل مودال
  // التفاصيل أولاً ثم يفتح مودال التعديل — نفس سلوك index.tsx الأصلي بالضبط
  const handleEditFromDetails = (customer: CustomerWithRelations) => {
    setDetailsCustomer(null);
    handleOpenModal(customer);
  };

  // إصدار وثيقة جديدة من داخل مودال تفاصيل العميل: بيقفل مودال التفاصيل أولاً
  const handleIssueNewPolicyFromDetails = (customer: CustomerWithRelations) => {
    setDetailsCustomer(null);
    handleIssueNewPolicy(customer);
  };

  // طلب حذف عميل من مودال "المزيد": بيقفل مودال المزيد ويفتح تأكيد الحذف
  const handleDeleteRequest = (customer: CustomerWithRelations) => {
    setMoreMenuCustomer(null);
    setDeleteConfirm(customer);
  };

  return (
    <div className="space-y-5 md:space-y-6 animate-fadeIn pb-6">
      {/* ===== أعلى الصفحة ===== */}
      <CustomersHeader onAddCustomer={openAddCustomerModal} />

      {/* ===== بطاقات إحصائية ===== */}
      <CustomerStatsCards stats={stats} statsLoading={statsLoading} />

      {/* ===== البحث والفلاتر ===== */}
      <div className="card space-y-3">
        <CustomerSearch
          localSearch={localSearch}
          onLocalSearchChange={setLocalSearch}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          activeFilterCount={activeFilterCount}
          isInitialLoading={isInitialLoading}
          loading={loading}
          totalCount={totalCount}
          filtersPanel={showFilters && (
            <CustomerFilters
              statusDraft={statusDraft}
              onStatusDraftChange={setStatusDraft}
              agentDraft={agentDraft}
              onAgentDraftChange={setAgentDraft}
              monthDraft={monthDraft}
              onMonthDraftChange={setMonthDraft}
              monthOptions={monthOptions}
              isManagerRole={isManagerRole}
              agents={agents}
              user={user}
              onApply={handleApplyFilters}
              onReset={handleResetFilters}
            />
          )}
        />
      </div>

      {/* ===== قائمة العملاء ===== */}
      <CustomerList
        isInitialLoading={isInitialLoading}
        customers={customers}
        hasActiveFilters={hasActiveFilters}
        onResetAll={handleResetAll}
        onAddCustomer={openAddCustomerModal}
        onOpenDetails={handleOpenCustomerDetails}
        onOpenMoreMenu={setMoreMenuCustomer}
        page={page}
        setPage={setPage}
        totalPages={totalPages}
      />

      {/* ===== مودال إضافة/تعديل عميل ===== */}
      {showModal && (
        <CustomerFormDialog
          editingCustomer={editingCustomer}
          isManagerRole={isManagerRole}
          agents={agents}
          user={user}
          register={register}
          handleSubmit={handleSubmit}
          onSubmit={onSubmit}
          errors={errors}
          ownerIdValue={ownerIdValue}
          setValue={setValue}
          saving={saving}
          onClose={handleCloseModal}
        />
      )}

      {/* ===== مودال تأكيد الحذف ===== */}
      {deleteConfirm && (
        <DeleteCustomerDialog
          deleteConfirm={deleteConfirm}
          deleting={deleting}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={handleDelete}
        />
      )}

      {/* ===== مودال "المزيد" (إجراءات البطاقة) ===== */}
      {moreMenuCustomer && (
        <MoreActionsDialog
          customer={moreMenuCustomer}
          canDelete={deletableIds.has(moreMenuCustomer.id)}
          onClose={() => setMoreMenuCustomer(null)}
          onEdit={handleOpenModal}
          onIssueNewPolicy={handleIssueNewPolicy}
          onOpenCustomerPolicies={handleOpenCustomerPolicies}
          onPrint={handlePrintCustomer}
          onDeleteRequest={handleDeleteRequest}
        />
      )}

      {/* ===== مودال تفاصيل العميل ===== */}
      {detailsCustomer && (
        <CustomerDetailsDialog
          customer={detailsCustomer}
          showExtraInfo={showExtraInfo}
          onToggleExtraInfo={() => setShowExtraInfo((v) => !v)}
          policySummaries={policySummaries}
          onClose={() => setDetailsCustomer(null)}
          onEdit={handleEditFromDetails}
          onPrint={handlePrintCustomer}
          onIssueNewPolicy={handleIssueNewPolicyFromDetails}
          onOpenPolicyDetails={handleOpenPolicyDetails}
        />
      )}

      {/* ===== بوتوم شيت: تفاصيل الوثيقة + جدول الأقساط الموحّد (Lazy Loading) ===== */}
      {openPolicySummary && (
        <PolicyDetailsDialog
          openPolicySummary={openPolicySummary}
          policyDetail={policyDetail}
          policyInstallments={policyInstallments}
          loadingPolicyDetail={loadingPolicyDetail}
          onClose={handleClosePolicyDetails}
          onPay={handleOpenPayment}
          onCancel={handleOpenCancel}
        />
      )}

      {/* ===== مودال تأكيد السداد (موحّد) ===== */}
      {showPayModal && selectedInstallment && (
        <PayInstallmentModal
          installment={selectedInstallment}
          contextLabel={{ policyNumber: openPolicySummary?.policy_number }}
          paymentDateStr={paymentDateStr}
          onPaymentDateChange={setPaymentDateStr}
          processing={processingPayment}
          onConfirm={handleProcessPayment}
          onClose={() => setShowPayModal(false)}
        />
      )}

      {/* ===== مودال إلغاء السداد (موحّد) ===== */}
      {showCancelModal && selectedInstallment && (
        <CancelInstallmentModal
          installment={selectedInstallment}
          contextLabel={{ policyNumber: openPolicySummary?.policy_number }}
          cancelReason={cancelReason}
          onCancelReasonChange={setCancelReason}
          processing={processingPayment}
          onConfirm={handleCancelPayment}
          onClose={() => setShowCancelModal(false)}
        />
      )}
    </div>
  );
}
