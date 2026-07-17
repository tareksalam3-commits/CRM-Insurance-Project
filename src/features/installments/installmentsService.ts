import { supabase, type Installment } from '../../lib/supabase';
import { format, startOfMonth } from 'date-fns';
import { withOfflineQueue } from '../../lib/offlineQueue';
import { dalRead } from '../../lib/dataAccessLayer';

// ===================================
// مصدر واحد لكل عمليات الأقساط الخاصة بوثيقة واحدة (تحميل / سداد / إلغاء
// سداد). تُستخدم فى: صفحة التحصيل والسداد (مودال أقساط الوثيقة)، صفحة
// تفاصيل الوثيقة، وصفحة العملاء (تفاصيل وثيقة العميل). أي تطوير أو إصلاح هنا
// ينعكس تلقائياً فى الثلاث أماكن دون أي كود مكرر.
// ===================================

// ===================================
// تحميل أقساط وثيقة واحدة فقط (Lazy Loading) — لا يجلب أي بيانات وثيقة/عميل
// مرتبطة لأن هذه الدالة تُستدعى دائماً من داخل سياق وثيقة محددة بالفعل
// ===================================
export async function fetchInstallmentsByPolicyId(policyId: string): Promise<Installment[]> {
  const result = await dalRead(
    `installments:byPolicy:${policyId}`,
    async () => {
      const { data, error } = await supabase
        .from('installments')
        .select('*')
        .eq('policy_id', policyId)
        .order('installment_number', { ascending: true });

      if (error) throw error;
      return (data as Installment[]) || [];
    },
    { emptyValue: [] as Installment[] },
  );
  return result.data;
}

// ===================================
// تسجيل السداد — نفس المنطق فى كل الشاشات: paid_at وpayment_month مبنيان
// على التاريخ اللي المستخدم اختاره (مش بالضرورة النهاردة) عشان السداد يدخل
// تارجت الشهر الصحيح لو اتسجل متأخر عن تاريخه الفعلي.
// ===================================
// ===================================
// نقطة الدخول العامة لتسجيل السداد — تُستخدم فى كل الشاشات كما هي بدون أي
// تغيير. لو مفيش إنترنت (أو الطلب فشل لسبب شبكة) بتحفظ العملية فى طابور
// الأوفلاين تلقائياً وترجع بهدوء (الشاشة تتصرف وكأن السداد نجح، مع ظهور
// إشعار "سيتم تنفيذ العملية تلقائياً عند عودة الإنترنت")، وتتنفذ فعلياً لاحقاً
// عبر offlineSync.ts (اللي بينادي payInstallmentOnline تحت مباشرة).
// ===================================
export async function payInstallment(installment: Installment, userId: string, paymentDate: Date): Promise<void> {
  const operationId = crypto.randomUUID();
  return withOfflineQueue(
    operationId,
    'pay_installment',
    { installment, userId, paymentDate: paymentDate.toISOString() },
    userId,
    (opId) => payInstallmentOnline(installment, userId, paymentDate, opId),
    undefined,
  );
}

// نستخدم دالة pay_installment_op الموجودة بالفعل فى قاعدة البيانات: بتسجّل
// الدفعة، وتتأكد إن القسط لسه قابل للسداد (منع سداد مزدوج)، وتسجّل النشاط،
// كل ده جوه معاملة واحدة، وبمفتاح idempotency (p_operation_id) بيمنع تكرار
// نفس العملية لو اتنفذت أكتر من مرة (زي إعادة محاولة بعد انقطاع الشبكة).
export async function payInstallmentOnline(
  installment: Installment,
  userId: string,
  paymentDate: Date,
  operationId: string = crypto.randomUUID(),
): Promise<void> {
  const now = new Date();
  const paidAt = new Date(paymentDate);
  paidAt.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  const paymentMonth = format(startOfMonth(paymentDate), 'yyyy-MM-dd');

  const { data, error } = await supabase.rpc('pay_installment_op', {
    p_operation_id:   operationId,
    p_installment_id: installment.id,
    p_amount:         installment.amount,
    p_paid_at:        paidAt.toISOString(),
    p_payment_month:  paymentMonth,
  });

  if (error) {
    // رسالة "الشهر مقفل" جايه من الداتابيز مباشرة (trigger) وواضحة للمستخدم زي ما هي
    throw new Error(error.message || 'حدث خطأ أثناء تسجيل السداد');
  }

  const result = data as { error?: string; conflict?: boolean } | null;
  if (result?.error) {
    throw new Error(result.error);
  }
}

// ===================================
// إلغاء السداد — يشمل إصلاح الوثائق القديمة: الأقساط "التاريخية" (مستوردة
// أو مُضافة كوثيقة قديمة) تُعتبر مسددة تلقائياً عند الإضافة دون إنشاء سجل
// سداد (payments) فعلي. إلغاء السداد لقسط زي ده لازم يرجّع القسط نفسه لحالة
// "معلّق"/"متأخر" مباشرة، بدل الاعتماد على سجل سداد غير موجود من الأساس
// (وهو السبب الجذري لرسالة "لم يتم العثور على السداد" التي كانت تظهر خطأً).
// ===================================
export async function cancelInstallmentPayment(
  installment: Installment,
  userId: string,
  cancelReason: string,
): Promise<{ error?: string }> {
  const operationId = crypto.randomUUID();
  return withOfflineQueue(
    operationId,
    'cancel_installment',
    { installment, userId, cancelReason },
    userId,
    (opId) => cancelInstallmentPaymentOnline(installment, userId, cancelReason, opId),
    {},
  );
}

// نستخدم دالة cancel_installment_payment_op الموجودة بالفعل فى قاعدة
// البيانات: هي أصلاً بتعمل كل اللي كان متكرر هنا (التحقق من الشهر المقفل،
// البحث عن الدفعة، ومعالجة حالة الأقساط "التاريخية" بنفس منطق trigger
// cancel_payment())، فبقت هنا مجرد نداء واحد بدل تكرار نفس المنطق فى الفرونت
// إند وفى قاعدة البيانات فى نفس الوقت.
export async function cancelInstallmentPaymentOnline(
  installment: Installment,
  userId: string,
  cancelReason: string,
  operationId: string = crypto.randomUUID(),
): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('cancel_installment_payment_op', {
    p_operation_id:    operationId,
    p_installment_id:  installment.id,
    p_cancel_reason:   cancelReason || 'إلغاء السداد',
  });

  if (error) throw error;

  const result = data as { error?: string } | null;
  if (result?.error) {
    return { error: result.error };
  }

  return {};
}

// ===================================
// ملخص سريع لأقساط مجموعة وثائق دفعة واحدة (مسدد/مستحق/متأخر لكل وثيقة) —
// استعلام واحد فقط بغض النظر عن عدد الوثائق، يُستخدم لعرض الملخص أعلى بطاقة
// كل وثيقة فى صفحة العملاء دون تحميل كل الأقساط بتفاصيلها (Lazy Loading
// الفعلي يبقى مؤجلاً لحد ما يفتح المستخدم "عرض التفاصيل")
// ===================================
export interface PolicyInstallmentSummary {
  paid: number;
  pending: number;
  overdue: number;
}

export async function fetchInstallmentSummaryByPolicyIds(
  policyIds: string[],
): Promise<Record<string, PolicyInstallmentSummary>> {
  if (policyIds.length === 0) return {};

  const result = await dalRead(
    `installments:summaryByPolicies:${policyIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('installments')
        .select('policy_id, status')
        .in('policy_id', policyIds);

      if (error) throw error;

      const summary: Record<string, PolicyInstallmentSummary> = {};
      for (const row of (data as { policy_id: string; status: string }[]) || []) {
        if (!summary[row.policy_id]) {
          summary[row.policy_id] = { paid: 0, pending: 0, overdue: 0 };
        }
        if (row.status === 'paid') summary[row.policy_id].paid++;
        else if (row.status === 'overdue') summary[row.policy_id].overdue++;
        else summary[row.policy_id].pending++;
      }
      return summary;
    },
    { emptyValue: {} as Record<string, PolicyInstallmentSummary> },
  );
  return result.data;
}
