import { supabase } from './supabase';
import {
  getQueueItems,
  removeQueueItem,
  markQueueAttemptFailed,
  notifySyncStarted,
  notifySynced,
  notifyConflict,
  isOnline,
  type OfflineQueueItem,
} from './offlineQueue';
import { payInstallmentOnline, cancelInstallmentPaymentOnline } from '../features/installments/installmentsService';
import { createCustomerOnline } from '../pages/Customers/services/customersService';
import { createPolicyOnline } from '../pages/Policies/services/policiesService';
import type { Installment } from './supabase';
import type { CustomerFormData } from '../pages/Customers/types';
import type { PolicyFormData } from '../pages/Policies/types';

interface PayInstallmentPayload {
  installment: Installment;
  userId: string;
  paymentDate: string;
}

interface CancelInstallmentPayload {
  installment: Installment;
  userId: string;
  cancelReason: string;
}

interface AddCustomerPayload {
  data: CustomerFormData;
  finalOwnerId: string | undefined;
}

interface AddPolicyPayload {
  data: PolicyFormData;
  ownerId: string;
}

let syncing = false;
let initialized = false;

// المستخدم الحالي المسجل دخوله على هذا الجهاز الآن. الطابور المحلي (IndexedDB)
// مشترك على مستوى الجهاز، فممكن يكون فيه عمليات معلّقة تخص مستخدم سبق واستخدم
// نفس الجهاز وسجل خروجه قبل ما تتم مزامنتها. لازم كل مزامنة تتجاهل تماماً أي
// عملية لا تخص المستخدم المسجل دخوله حالياً - لا تُعرض ولا تُنفذ ولا تُحذف.
let currentUserId: string | null = null;

// عملية سبق تنفيذها فعلاً (تم تسجيلها فى offline_operations) — لو أُعيد
// إرسالها (مثلاً لأن التطبيق اتقفل قبل ما يمسحها من الطابور المحلي بعد
// نجاحها) بيتم تجاهلها هنا فوراً بدون أي تنفيذ تاني
async function wasAlreadyProcessed(operationId: string): Promise<boolean> {
  const { data } = await supabase
    .from('offline_operations')
    .select('operation_id')
    .eq('operation_id', operationId)
    .maybeSingle();
  return !!data;
}

async function markProcessed(
  operationId: string,
  operationType: string,
  userId: string,
  entityId?: string | null,
): Promise<void> {
  // ملحوظة: عمود user_id فى offline_operations إلزامي (NOT NULL) — عدم
  // إرساله كان يخلي كل عملية Insert هنا تفشل بصمت (supabase-js ما بيرميش
  // استثناء تلقائي هنا لأننا مش بنقرأ { error })، فسجل منع التكرار كان
  // فعلياً فاضي دايماً رغم إن الكود كان بيبدو ناجح.
  const { error } = await supabase.from('offline_operations').insert({
    operation_id: operationId,
    operation_type: operationType,
    user_id: userId,
    entity_id: entityId ?? null,
  });
  if (error) console.error('[offlineSync] markProcessed failed', error);
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505';
}

type QueueItemOutcome = 'success' | 'resolved' | 'retry';

// بترجع نتيجة العملية:
// - 'success'  : اتنفذت فعلاً بنجاح الآن.
// - 'resolved' : اتحلّت بدون تنفيذ (تكرار/تعارض) واتشالت من الطابور — مش
//                عملية "لسه معلّقة"، فمينعش استكمال باقي الطابور.
// - 'retry'    : فشل حقيقي (شبكة/سيرفر) وفضلت العملية فى الطابور — لازم
//                نوقف عند هنا ومنكملش للعملية اللي بعدها فى نفس الجولة،
//                حفاظاً على نفس ترتيب الإضافة (العملية التالية ممكن تعتمد
//                على نجاح دي، زي وثيقة على عميل لسه معلّق إضافته).
async function executeQueuedItem(item: OfflineQueueItem): Promise<QueueItemOutcome> {
  if (await wasAlreadyProcessed(item.operationId)) {
    await removeQueueItem(item.operationId);
    return 'resolved';
  }

  try {
    switch (item.type) {
      case 'pay_installment': {
        const { installment, userId, paymentDate } = item.payload as PayInstallmentPayload;

        // كشف تعارض: هل القسط ما زال قابلاً للسداد؟ (ممكن يكون اتسدد من
        // مستخدم تاني وهو الجهاز كان أوفلاين)
        const { data: fresh } = await supabase
          .from('installments')
          .select('status')
          .eq('id', installment.id)
          .maybeSingle();

        if (!fresh || fresh.status === 'paid') {
          await removeQueueItem(item.operationId);
          notifyConflict('تعذر تنفيذ عملية السداد: تم سداد هذا القسط بواسطة مستخدم آخر بالفعل.');
          return 'resolved';
        }

        await payInstallmentOnline(installment, userId, new Date(paymentDate), item.operationId);
        await markProcessed(item.operationId, item.type, item.userId, installment.id);
        await removeQueueItem(item.operationId);
        return 'success';
      }

      case 'cancel_installment': {
        const { installment, userId, cancelReason } = item.payload as CancelInstallmentPayload;

        // cancelInstallmentPaymentOnline نفسه بيتأكد إن فيه سداد فعلاً لازال
        // قائماً قبل إلغائه (وإلا بيرجّع رسالة تعارض واضحة) — بدون تكرار
        // نفس المنطق هنا
        const result = await cancelInstallmentPaymentOnline(installment, userId, cancelReason, item.operationId);
        if (result.error) {
          await removeQueueItem(item.operationId);
          notifyConflict(`تعذر تنفيذ عملية إلغاء السداد: ${result.error}`);
          return 'resolved';
        }

        await markProcessed(item.operationId, item.type, item.userId, installment.id);
        await removeQueueItem(item.operationId);
        return 'success';
      }

      case 'add_customer': {
        const { data, finalOwnerId } = item.payload as AddCustomerPayload;
        try {
          await createCustomerOnline(data, finalOwnerId);
        } catch (err) {
          if (isUniqueViolation(err)) {
            await removeQueueItem(item.operationId);
            notifyConflict('تعذر تنفيذ عملية إضافة العميل: الرقم القومي مسجل مسبقاً.');
            return 'resolved';
          }
          throw err;
        }
        await markProcessed(item.operationId, item.type, item.userId);
        await removeQueueItem(item.operationId);
        return 'success';
      }

      case 'add_policy': {
        const { data, ownerId } = item.payload as AddPolicyPayload;
        try {
          await createPolicyOnline(data, ownerId);
        } catch (err) {
          if (isUniqueViolation(err)) {
            await removeQueueItem(item.operationId);
            notifyConflict('تعذر تنفيذ عملية إضافة الوثيقة: رقم الوثيقة موجود بالفعل.');
            return 'resolved';
          }
          throw err;
        }
        await markProcessed(item.operationId, item.type, item.userId);
        await removeQueueItem(item.operationId);
        return 'success';
      }
    }
    return 'retry';
  } catch (err: any) {
    // فشل غير متوقع (شبكة/سيرفر) — تفضل العملية فى الطابور للمحاولة القادمة
    await markQueueAttemptFailed(item.operationId, err?.message || String(err));
    return 'retry';
  }
}

// ===================================
// نقطة الدخول الوحيدة لتنفيذ طابور الأوفلاين. مُحمية بعلم syncing بسيط
// حتى لا يتنفذ أكتر من Sync فى نفس الوقت (من عدة مستمعين مختلفين: online
// event، فتح التطبيق، العودة من الخلفية) — وبتبعت إشعار واحد فقط عند بدء
// المزامنة وإشعار واحد فقط بعد نجاحها (مش لكل عملية على حدة)
// ===================================
export async function processOfflineQueue(): Promise<void> {
  if (syncing || !isOnline() || !currentUserId) return;

  const allItems = await getQueueItems();
  // الطابور مشترك على مستوى الجهاز — نصفّي هنا فقط عمليات المستخدم المسجل
  // دخوله حالياً. عمليات أي مستخدم آخر تفضل فى الطابور كما هي (لا تُنفذ ولا
  // تُحذف) لحد ما هو نفسه يسجل دخوله تانى على نفس الجهاز.
  const items = allItems.filter((i) => i.userId === currentUserId);
  if (items.length === 0) return;

  syncing = true;
  notifySyncStarted();
  let succeededCount = 0;
  try {
    for (const item of items.sort((a, b) => a.createdAt - b.createdAt)) {
      if (!isOnline()) break;
      const outcome = await executeQueuedItem(item);
      if (outcome === 'success') succeededCount += 1;
      // فشل حقيقي (لسه محتاج إعادة محاولة) — نوقف الجولة دي هنا ومنكملش
      // للعمليات اللي بعدها، حفاظاً على نفس ترتيب الإضافة. هتتحاول تاني
      // (هي والباقي بعدها) فى أول محاولة مزامنة قادمة.
      if (outcome === 'retry') break;
    }
  } finally {
    syncing = false;
    if (succeededCount > 0) notifySynced();
  }
}

// يُستدعى مرة واحدة بعد تسجيل الدخول. المزامنة تعتمد فقط على 3 أحداث (لا
// Polling ولا مؤقتات تعمل باستمرار):
//   1) حدث 'online' (عودة الاتصال).
//   2) رجوع التطبيق للظهور (فتحه أو رجوعه من الخلفية) — visibilitychange.
//   3) استرجاع تركيز النافذة (focus) — يغطي حالات لا يُطلق فيها المتصفح
//      حدث 'online' بوضوح رغم عودة الشبكة فعلياً.
// فى الحالات الثلاث: المزامنة تُحاول فقط لو فيه عمليات معلّقة فعلاً
// (processOfflineQueue بترجع فوراً لو الطابور فاضي) وفيه اتصال فعلاً.
export function initOfflineSync(userId: string): void {
  // نحدّث المستخدم الحالي فى كل مرة (حتى لو الاستماع للأحداث اتسجل قبل كده)،
  // عشان لو مستخدم تانى سجل دخوله على نفس الجهاز، المزامنة تتبع هويته هو فقط.
  currentUserId = userId;

  if (initialized) {
    // المستمعين مسجلين بالفعل من أول مرة - بس نحاول مزامنة فورية بهوية
    // المستخدم الجديد لو فيه عمليات معلّقة تخصه
    if (isOnline()) void processOfflineQueue();
    return;
  }
  initialized = true;

  window.addEventListener('online', () => {
    void processOfflineQueue();
  });

  // فتح التطبيق أو الرجوع من الخلفية (Mobile PWA / Tab غير نشط) — لو فيه
  // عمليات معلّقة وفيه اتصال، نحاول المزامنة فوراً
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void processOfflineQueue();
    }
  });
  window.addEventListener('focus', () => {
    void processOfflineQueue();
  });

  if (isOnline()) {
    void processOfflineQueue();
  }
}

// تُستدعى عند تسجيل الخروج — توقف المزامنة فوراً (بدون إزالة المستمعين، فهم
// خفاف الوزن وبيرجعوا isOnline() بس) حتى لا تنفذ أي عملية معلّقة بلا مستخدم
// مسجل دخوله فعلياً وقت الطلب.
export function stopOfflineSync(): void {
  currentUserId = null;
}
