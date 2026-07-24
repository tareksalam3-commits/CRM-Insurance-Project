import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Policy, PolicyType, PaymentMethod, User } from '../../../lib/supabase';

import { policySchema, type PolicyFormData } from '../types';
import {
  fetchPolicyById, countPaidInstallments, updatePolicy, createPolicy,
  deletePolicySafe, changePolicyStatus, fetchCustomerForPicker, type CustomerPickerItem,
} from '../services/policiesService';
import { computeDefaultPolicyStartDate } from '../business/policyDateDefaults';
import { buildPolicyPrintHtml } from '../services/policyHelpers';

type SetSearchParams = ReturnType<typeof useSearchParams>[1];

interface UsePolicyActionsParams {
  user: User | null | undefined;
  searchParams: URLSearchParams;
  setSearchParams: SetSearchParams;
  loadPolicies: () => Promise<void>;
  loadStats: () => Promise<void>;
}

// كل حالة وسلوك المودالات/النوافذ (إصدار/تعديل الوثيقة، اختيار العميل، حذف،
// تغيير الحالة، الطباعة) — نفس المنطق المنقول بالضبط من index.tsx الأصلي.
export function usePolicyActions({
  user, searchParams, setSearchParams, loadPolicies, loadStats,
}: UsePolicyActionsParams) {
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [moreMenuPolicy, setMoreMenuPolicy] = useState<Policy | null>(null);

  // لو الصفحة اتفتحت من صفحة العملاء بزرار "إصدار وثيقة جديدة"، بيتثبّت
  // العميل هنا فيتقفل حقل اختيار العميل فى النموذج على نفس العميل (فلا يظهر
  // وكيل تاني ولا يُطلب إدخال بياناته تانى)
  const [presetCustomerId, setPresetCustomerId] = useState<string | null>(null);

  // العميل المختار حالياً فى نموذج إصدار/تعديل الوثيقة — بيانات العرض فقط
  // (اسم، هاتف، آخر وثيقة...)؛ القيمة الفعلية المحفوظة هى customer_id داخل النموذج
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerPickerItem | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors }
  } = useForm<PolicyFormData>({
    resolver: zodResolver(policySchema)
  });

  // فتح مودال التعديل تلقائياً لو الرابط جاي من صفحة تفاصيل الوثيقة بزرار
  // "تعديل" (?edit=<policyId>) — بنجيب الوثيقة مباشرة لأنها ممكن ما تكونش
  // ظاهرة في الصفحة الحالية من القائمة (فلترة/ترقيم صفحات مختلف)
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || !user) return;

    (async () => {
      try {
        const policyToEdit = await fetchPolicyById(editId);
        handleOpenModal(policyToEdit);
      } catch (error) {
        console.error('Error loading policy for edit:', error);
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete('edit');
        setSearchParams(next);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  // فتح مودال "إصدار وثيقة جديدة" تلقائياً وتثبيت العميل، لو الصفحة اتفتحت
  // من صفحة العملاء (?new_for_customer=<customerId>) — بيانات العميل نفسه
  // متسجلة بالفعل فمفيش داعي لإدخالها تانى، وبيفضل مرتبط بنفس وكيله دايماً
  // لأن owner_id بيتحدد تلقائياً من بيانات العميل عند الحفظ (onSubmit)
  useEffect(() => {
    const newForCustomerId = searchParams.get('new_for_customer');
    if (!newForCustomerId || !user) return;

    (async () => {
      try {
        const customer = await fetchCustomerForPicker(newForCustomerId);
        setSelectedCustomer(customer);
        setEditingPolicy(null);
        reset({
          policy_number: '',
          customer_id: newForCustomerId,
          policy_type: 'quadruple',
          start_date: computeDefaultPolicyStartDate(),
          // مبلغ التأمين وطريقة السداد يترصدوا تلقائياً من بيانات "طلب
          // التأمين" المسجلة مع العميل (راجع customer_defaults_locked فى
          // PolicyFormDialog) — لو العميل قديم ومفيهوش هذه البيانات، بيرجع
          // لنفس القيم الافتراضية القديمة عشان الحقل يفضل قابل للتعديل يدوياً
          payment_method: (customer?.payment_method as PaymentMethod) || 'monthly',
          premium_amount: '' as any,
          sum_assured: customer?.insurance_amount ?? ('' as any),
          notes: '',
          isEditingPolicy: false
        });
        setPresetCustomerId(newForCustomerId);
        setShowModal(true);
      } catch (error) {
        console.error('Error preparing new policy for customer:', error);
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete('new_for_customer');
        setSearchParams(next);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  const handleOpenModal = useCallback((policy?: Policy) => {
    setMoreMenuPolicy(null);
    setPresetCustomerId(null);
    if (policy) {
      setEditingPolicy(policy);
      // بنجيب بيانات عميل الوثيقة الحالية لعرضها فى زر اختيار العميل
      // (بدون تحميل قائمة العملاء كاملة)
      setSelectedCustomer(null);
      fetchCustomerForPicker(policy.customer_id)
        .then((customer) => setSelectedCustomer(customer))
        .catch((error) => console.error('Error loading policy customer:', error));
      reset({
        policy_number: policy.policy_number,
        customer_id: policy.customer_id,
        policy_type: policy.policy_type as PolicyType,
        start_date: policy.start_date,
        payment_method: policy.payment_method as PaymentMethod,
        premium_amount: policy.premium_amount,
        sum_assured: policy.sum_assured ?? ('' as any),
        notes: policy.notes || '',
        isEditingPolicy: true
      });
    } else {
      setEditingPolicy(null);
      setSelectedCustomer(null);
      reset({
        policy_number: '',
        customer_id: '',
        policy_type: 'quadruple',
        // يُعاد احتسابه تلقائياً في كل مرة يُفتح فيها نموذج "إصدار وثيقة
        // جديدة" حسب تاريخ اليوم، ولا يُحتفظ بآخر تاريخ تم استخدامه
        start_date: computeDefaultPolicyStartDate(),
        payment_method: 'monthly',
        premium_amount: '' as any,
        sum_assured: '' as any,
        notes: '',
        isEditingPolicy: false
      });
    }
    setShowModal(true);
  }, [reset]);

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPolicy(null);
    setPresetCustomerId(null);
    setSelectedCustomer(null);
    setShowCustomerPicker(false);
    reset();
  };

  const handleSelectCustomer = (customer: CustomerPickerItem) => {
    setSelectedCustomer(customer);
    setValue('customer_id', customer.id, { shouldValidate: true });

    // عند إصدار وثيقة جديدة (مش تعديل وثيقة موجودة)، وكان عند العميل بيانات
    // "طلب تأمين" محفوظة، بنعبّي مبلغ التأمين وطريقة السداد تلقائياً منها
    // بدل إدخالهما يدوياً تانى — نفس الحقلين بيتقفلوا للعرض فقط فى
    // PolicyFormDialog (customerDefaultsLocked). لو العميل مفيهوش هذه
    // البيانات (عميل قديم قبل إضافة الميزة)، الحقول تفضل زي ما هي قابلة
    // للتعديل يدوياً بدون أي تغيير فى السلوك القديم.
    if (!editingPolicy && customer.insurance_amount != null && customer.payment_method) {
      setValue('sum_assured', customer.insurance_amount, { shouldValidate: true });
      setValue('payment_method', customer.payment_method as PaymentMethod, { shouldValidate: true });
    }

    setShowCustomerPicker(false);
  };

  // مبلغ التأمين وطريقة السداد بيبقوا للعرض فقط (مقفولين) فى نموذج "إصدار
  // وثيقة جديدة" لو العميل المختار عنده بيانات "طلب تأمين" محفوظة —
  // بيتقفلوا لحماية القيمة اللي اترصدت تلقائياً من التعديل غير المقصود. ما
  // بيتفعلش أثناء تعديل وثيقة موجودة أصلاً (نفس السلوك القديم زي ما هو).
  const customerDefaultsLocked =
    !editingPolicy && !!selectedCustomer && selectedCustomer.insurance_amount != null && !!selectedCustomer.payment_method;

  const onSubmit = async (data: PolicyFormData) => {
    if (!user) return;
    setSaving(true);

    try {
      if (editingPolicy) {
        const oldData = editingPolicy;

        const fieldsAffectingInstallments =
          data.premium_amount !== Number(oldData.premium_amount) ||
          data.payment_method !== oldData.payment_method ||
          data.start_date !== oldData.start_date;

        if (fieldsAffectingInstallments) {
          const paidCount = await countPaidInstallments(editingPolicy.id);

          if (paidCount > 0) {
            const confirmed = window.confirm(
              `تنبيه: يوجد ${paidCount} قسط مدفوع مسبقاً في هذه الوثيقة بالقيمة/الموعد القديم.\n\n` +
              `تعديل قيمة القسط الصافي أو طريقة السداد أو تاريخ البداية لن يغيّر الأقساط المدفوعة بالفعل (لحماية السجل المالي) — التعديل سيُطبَّق فقط على الأقساط القادمة (غير المسددة).\n\n` +
              `هل تريد المتابعة؟`
            );
            if (!confirmed) {
              setSaving(false);
              return;
            }
          }
        }

        await updatePolicy(editingPolicy.id, data, oldData);
      } else {
        const policyOwnerId = selectedCustomer?.owner_id || user.id;

        await createPolicy(data, policyOwnerId, user.id);
      }

      handleCloseModal();
      loadPolicies();
      loadStats();
    } catch (error: any) {
      console.error('Error saving policy:', error);
      const msg: string = error?.message || '';
      if (error.code === '23505' && msg.includes('policy_number')) {
        alert('رقم الوثيقة مسجل مسبقاً');
      } else if (error.code === '23505') {
        alert('حدث تعارض في البيانات أثناء الحفظ، برجاء المحاولة مرة أخرى');
      } else {
        alert('حدث خطأ أثناء الحفظ');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePolicy = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const { error } = await deletePolicySafe(deleteConfirm.id, deleteConfirm);

      if (error) {
        alert(error);
        return;
      }

      setDeleteConfirm(null);
      loadPolicies();
      loadStats();
    } catch (error) {
      console.error('Error deleting policy:', error);
      alert('حدث خطأ أثناء حذف الوثيقة');
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (policy: Policy, newStatus: 'active' | 'cancelled') => {
    setMoreMenuPolicy(null);
    try {
      await changePolicyStatus(policy, newStatus);
      loadPolicies();
      loadStats();
    } catch (error) {
      console.error('Error changing policy status:', error);
      alert('حدث خطأ أثناء تغيير الحالة');
    }
  };

  // طباعة بيانات الوثيقة — إجراء عرض/طباعة محلي بالكامل على بيانات مُحمَّلة
  // بالفعل من Supabase، بدون أي استدعاء أو تعديل جديد على قاعدة البيانات
  const handlePrintPolicy = (policy: Policy) => {
    setMoreMenuPolicy(null);
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;

    printWindow.document.write(buildPolicyPrintHtml(policy));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return {
    showModal,
    editingPolicy,
    saving,
    handleOpenModal,
    handleCloseModal,
    onSubmit,
    register,
    handleSubmit,
    setValue,
    errors,

    deleteConfirm,
    setDeleteConfirm,
    deleting,
    handleDeletePolicy,

    moreMenuPolicy,
    setMoreMenuPolicy,
    handleStatusChange,
    handlePrintPolicy,

    presetCustomerId,
    selectedCustomer,
    showCustomerPicker,
    setShowCustomerPicker,
    handleSelectCustomer,
    customerDefaultsLocked,

    navigate,
  };
}
