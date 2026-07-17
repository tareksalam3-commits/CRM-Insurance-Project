import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import type { User, Installment } from '../../../lib/supabase';

import { customerSchema, type CustomerFormData, type CustomerWithRelations, type CustomerPolicySummary } from '../types';
import {
  updateCustomer, createCustomer, deleteCustomer,
} from '../services/customersService';
import { buildCustomerPrintHtml } from '../services/customerHelpers';
import { fetchPolicyById } from '../../PolicyDetail/services/policyDetailService';
import type { PolicyWithRelations } from '../../PolicyDetail/types';
import {
  fetchInstallmentsByPolicyId, payInstallment, cancelInstallmentPayment,
  fetchInstallmentSummaryByPolicyIds, type PolicyInstallmentSummary,
} from '../../../features/installments/installmentsService';

type SetSearchParams = ReturnType<typeof useSearchParams>[1];

interface UseCustomerActionsParams {
  user: User | null | undefined;
  searchParams: URLSearchParams;
  setSearchParams: SetSearchParams;
  loadCustomers: () => Promise<void>;
  loadStats: () => Promise<void>;
}

// كل حالة وسلوك المودالات/النوافذ (إضافة/تعديل، حذف، تفاصيل العميل، تفاصيل
// الوثيقة، السداد وإلغاء السداد، الطباعة) — نفس المنطق المنقول بالضبط من
// index.tsx الأصلي.
export function useCustomerActions({
  user, searchParams, setSearchParams, loadCustomers, loadStats,
}: UseCustomerActionsParams) {
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithRelations | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CustomerWithRelations | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [moreMenuCustomer, setMoreMenuCustomer] = useState<CustomerWithRelations | null>(null);
  const [detailsCustomer, setDetailsCustomer] = useState<CustomerWithRelations | null>(null);
  const [showExtraInfo, setShowExtraInfo] = useState(false);

  // ملخص سريع (مسدد/مستحق/متأخر) لكل وثيقة — استعلام واحد فقط لكل وثائق
  // العميل عند فتح تفاصيله، بدون تحميل أي أقساط بالتفصيل (Lazy Loading
  // الفعلي للأقساط نفسها يبقى مؤجلاً لحد ما يفتح المستخدم "عرض التفاصيل")
  const [policySummaries, setPolicySummaries] = useState<Record<string, PolicyInstallmentSummary>>({});

  // ===== صفحة/بوتوم شيت تفاصيل الوثيقة المفتوحة من داخل صفحة العميل =====
  const [openPolicySummary, setOpenPolicySummary] = useState<CustomerPolicySummary | null>(null);
  const [policyDetail, setPolicyDetail] = useState<PolicyWithRelations | null>(null);
  const [policyInstallments, setPolicyInstallments] = useState<Installment[]>([]);
  const [loadingPolicyDetail, setLoadingPolicyDetail] = useState(false);

  // سداد/إلغاء سداد — نفس المنطق ونفس المكوّنات الموحّدة المستخدمة فى صفحة
  // التحصيل والسداد وصفحة تفاصيل الوثيقة
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [paymentDateStr, setPaymentDateStr] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema)
  });

  const ownerIdValue = watch('owner_id');

  // فتح مودال "إضافة عميل جديد" تلقائياً لو الرابط جاي بـ ?new=1 — مستخدَم من
  // نافذة اختيار العميل داخل نموذج إصدار الوثيقة لما ما يكونش فيه عميل مطابق
  useEffect(() => {
    if (!user) return;
    if (searchParams.get('new') !== '1') return;

    handleOpenModal();
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  const handleOpenModal = useCallback((customer?: CustomerWithRelations) => {
    setMoreMenuCustomer(null);
    if (customer) {
      setEditingCustomer(customer);
      reset({
        name: customer.name,
        national_id: customer.national_id || '',
        phone: customer.phone || '',
        address: customer.address || '',
        birth_date: customer.birth_date || '',
        occupation: customer.occupation || '',
        marital_status: customer.marital_status || undefined,
        owner_id: customer.owner_id || '',
        isManagerRole: !!user && user.role !== 'agent' && user.role !== 'premium_agent'
      });
    } else {
      setEditingCustomer(null);
      const isAgent = user?.role === 'agent' || user?.role === 'premium_agent';
      reset({
        name: '',
        national_id: '',
        phone: '',
        address: '',
        birth_date: '',
        occupation: '',
        marital_status: undefined,
        owner_id: isAgent ? user?.id : '',
        isManagerRole: !isAgent
      });
    }
    setShowModal(true);
  }, [user, reset]);

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCustomer(null);
    reset();
  };

  const onSubmit = async (data: CustomerFormData) => {
    if (!user) return;
    setSaving(true);

    // owner_id: للوكيل = نفسه دائماً، للمدير = الوكيل المختار من فريقه (مُتحقق منه بالـ schema)
    const isAgent = user.role === 'agent' || user.role === 'premium_agent';
    const finalOwnerId = isAgent ? user.id : data.owner_id;

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, data, finalOwnerId, editingCustomer);
      } else {
        await createCustomer(data, finalOwnerId, user.id);
      }

      handleCloseModal();
      loadCustomers();
      loadStats();
    } catch (error: any) {
      console.error('Error saving customer:', error);
      if (error.code === '23505') {
        alert('الرقم القومي مسجل مسبقاً');
      } else {
        alert('حدث خطأ أثناء الحفظ');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const { error } = await deleteCustomer(deleteConfirm.id);

      if (error) {
        alert(error);
        return;
      }

      setDeleteConfirm(null);
      loadCustomers();
      loadStats();
    } catch (error) {
      console.error('Error deleting customer:', error);
      alert('حدث خطأ أثناء الحذف');
    } finally {
      setDeleting(false);
    }
  };

  // فتح الوثيقة المرتبطة بالعميل — لو عنده أكتر من وثيقة بيوديه لقائمة
  // الوثائق مفلترة عليه بدل تخمين أنسبها (بدون أي منطق جديد فى صفحة الوثائق)
  const handleOpenCustomerPolicies = (customer: CustomerWithRelations) => {
    setMoreMenuCustomer(null);
    const policies = customer.policies || [];
    if (policies.length === 0) {
      alert('لا توجد وثائق مرتبطة بهذا العميل بعد');
      return;
    }
    if (policies.length === 1) {
      navigate(`/policies/${policies[0].id}`);
    } else {
      navigate(`/policies?search=${encodeURIComponent(customer.name)}`);
    }
  };

  // إصدار وثيقة جديدة لنفس العميل — بيفتح نموذج الوثائق الحالي مع تثبيت
  // العميل تلقائياً (owner_id هيتحدد من نفس وكيل العميل عند الحفظ، بدون
  // إمكانية اختيار وكيل مختلف)
  // ===================================
  // فتح تفاصيل العميل — تحميل ملخص سريع لأقساط جميع وثائقه دفعة واحدة
  // (استعلام واحد فقط، بدون تفاصيل الأقساط نفسها)
  // ===================================
  const handleOpenCustomerDetails = useCallback(async (customer: CustomerWithRelations) => {
    setDetailsCustomer(customer);
    setShowExtraInfo(false);

    const policyIds = (customer.policies || []).map((p) => p.id);
    if (policyIds.length === 0) return;

    try {
      setPolicySummaries(await fetchInstallmentSummaryByPolicyIds(policyIds));
    } catch (error) {
      console.error('Error loading policy installment summaries:', error);
    }
  }, []);

  // ===================================
  // فتح "عرض التفاصيل" لوثيقة معينة — تحميل بيانات الوثيقة الكاملة وأقساطها
  // فقط الآن (Lazy Loading)، دون تحميل أي وثيقة أخرى لنفس العميل
  // ===================================
  const handleOpenPolicyDetails = async (summary: CustomerPolicySummary) => {
    setOpenPolicySummary(summary);
    setLoadingPolicyDetail(true);
    setPolicyDetail(null);
    setPolicyInstallments([]);

    try {
      const [detail, installmentsData] = await Promise.all([
        fetchPolicyById(summary.id),
        fetchInstallmentsByPolicyId(summary.id),
      ]);
      setPolicyDetail(detail);
      setPolicyInstallments(installmentsData);
    } catch (error) {
      console.error('Error loading policy details:', error);
    } finally {
      setLoadingPolicyDetail(false);
    }
  };

  const handleClosePolicyDetails = () => {
    setOpenPolicySummary(null);
    setPolicyDetail(null);
    setPolicyInstallments([]);
  };

  const reloadOpenPolicyInstallments = async () => {
    if (!openPolicySummary) return;
    try {
      setPolicyInstallments(await fetchInstallmentsByPolicyId(openPolicySummary.id));
      // تحديث الملخص السريع على البطاقة كمان بعد السداد/إلغاء السداد
      setPolicySummaries(await fetchInstallmentSummaryByPolicyIds(
        (detailsCustomer?.policies || []).map((p) => p.id)
      ));
    } catch (error) {
      console.error('Error reloading policy installments:', error);
    }
  };

  const handleOpenPayment = (installment: Installment) => {
    setSelectedInstallment(installment);
    setPaymentDateStr(format(new Date(), 'yyyy-MM-dd'));
    setShowPayModal(true);
  };

  const handleProcessPayment = async () => {
    if (!selectedInstallment || !user) return;
    setProcessingPayment(true);
    try {
      await payInstallment(selectedInstallment, user.id, new Date(paymentDateStr));
      setShowPayModal(false);
      setSelectedInstallment(null);
      await reloadOpenPolicyInstallments();
    } catch (error: any) {
      console.error('Error processing payment:', error);
      alert(error?.message || 'حدث خطأ أثناء تسجيل السداد، حاول مرة أخرى');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleOpenCancel = (installment: Installment) => {
    setSelectedInstallment(installment);
    setCancelReason('');
    setShowCancelModal(true);
  };

  const handleCancelPayment = async () => {
    if (!selectedInstallment || !user) return;
    setProcessingPayment(true);
    try {
      const { error } = await cancelInstallmentPayment(selectedInstallment, user.id, cancelReason);
      if (error) {
        alert(error);
        return;
      }
      setShowCancelModal(false);
      setSelectedInstallment(null);
      setCancelReason('');
      await reloadOpenPolicyInstallments();
    } catch (error) {
      console.error('Error cancelling payment:', error);
      alert('حدث خطأ أثناء إلغاء السداد');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleIssueNewPolicy = (customer: CustomerWithRelations) => {
    setMoreMenuCustomer(null);
    navigate(`/policies?new_for_customer=${customer.id}`);
  };

  // طباعة بيانات العميل — عرض/طباعة محلي بالكامل على بيانات مُحمَّلة بالفعل
  // من Supabase، بدون أي استدعاء أو تعديل جديد على قاعدة البيانات
  const handlePrintCustomer = (customer: CustomerWithRelations) => {
    setMoreMenuCustomer(null);
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;

    printWindow.document.write(buildCustomerPrintHtml(customer));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return {
    // إضافة/تعديل
    showModal,
    editingCustomer,
    saving,
    handleOpenModal,
    handleCloseModal,
    onSubmit,
    register,
    handleSubmit,
    setValue,
    errors,
    ownerIdValue,

    // حذف
    deleteConfirm,
    setDeleteConfirm,
    deleting,
    handleDelete,

    // المزيد من الإجراءات
    moreMenuCustomer,
    setMoreMenuCustomer,
    handleOpenCustomerPolicies,
    handleIssueNewPolicy,
    handlePrintCustomer,

    // تفاصيل العميل
    detailsCustomer,
    setDetailsCustomer,
    showExtraInfo,
    setShowExtraInfo,
    policySummaries,
    handleOpenCustomerDetails,

    // تفاصيل الوثيقة
    openPolicySummary,
    policyDetail,
    policyInstallments,
    loadingPolicyDetail,
    handleOpenPolicyDetails,
    handleClosePolicyDetails,

    // سداد/إلغاء سداد
    selectedInstallment,
    showPayModal,
    setShowPayModal,
    paymentDateStr,
    setPaymentDateStr,
    showCancelModal,
    setShowCancelModal,
    cancelReason,
    setCancelReason,
    processingPayment,
    handleOpenPayment,
    handleProcessPayment,
    handleOpenCancel,
    handleCancelPayment,
  };
}
