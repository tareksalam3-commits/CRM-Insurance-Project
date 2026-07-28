// دالة مركزية لترجمة أخطاء قاعدة البيانات/الشبكة إلى رسالة عربية آمنة
// وواضحة للمستخدم، بدل عرض تفاصيل تقنية داخلية (أسماء أعمدة، RLS،
// رسائل Postgres بالإنجليزي...) زي ما كانت بتتعرض فى أماكن متفرقة من التطبيق.
//
// الاستخدام: استبدلوا أي `error?.message || 'رسالة افتراضية'` بـ
// `friendlyError(error, 'رسالة افتراضية تخص هذه الشاشة تحديداً')`

interface ErrorLike {
  message?: string;
  code?: string;
}

// كل قاعدة هنا: جزء من رسالة الخطأ الأصلية (بالإنجليزي، زي ما بترجعها
// Supabase/Postgres) → الرسالة العربية المناسبة للمستخدم.
// الترتيب مهم: أول تطابق بيكسب.
const KNOWN_PATTERNS: Array<{ match: string; arabic: string }> = [
  { match: 'invalid login credentials', arabic: 'بيانات الدخول غير صحيحة' },
  { match: 'user not found', arabic: 'المستخدم غير موجود' },
  { match: 'already registered', arabic: 'البريد الإلكتروني مسجل مسبقاً' },
  { match: 'duplicate key', arabic: 'هذا السجل موجود بالفعل' },
  { match: 'row-level security', arabic: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' },
  { match: 'permission denied', arabic: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' },
  { match: 'jwt expired', arabic: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى' },
  { match: 'bucket not found', arabic: 'خطأ في إعداد النظام، يرجى التواصل مع الدعم الفني' },
  { match: 'mime type', arabic: 'صيغة الملف غير مدعومة' },
  { match: 'exceeded the maximum', arabic: 'حجم الملف أكبر من المسموح به' },
  { match: 'failed to fetch', arabic: 'تعذر الاتصال بالخادم، تحقق من اتصال الإنترنت' },
  { match: 'network', arabic: 'تعذر الاتصال بالخادم، تحقق من اتصال الإنترنت' },
];

// أكواد Postgres الشائعة (ثابتة عبر كل قواعد بيانات Postgres، مش نص حر)
const KNOWN_CODES: Record<string, string> = {
  '23505': 'هذا السجل موجود بالفعل',
  '23503': 'لا يمكن تنفيذ العملية لوجود بيانات مرتبطة بهذا السجل',
  '23502': 'يوجد حقل مطلوب لم يتم تعبئته',
  '42501': 'ليس لديك صلاحية لتنفيذ هذا الإجراء',
};

/**
 * يترجم أي خطأ (من Supabase أو الشبكة أو أي مصدر آخر) إلى رسالة عربية
 * آمنة ومفهومة للمستخدم. لا يعرض أبداً نص الخطأ التقني الخام.
 *
 * @param error الخطأ اللي حصل (أي نوع — عادة من catch)
 * @param fallback رسالة عامة تخص الشاشة الحالية، تُستخدم لو مفيش تطابق معروف
 */
export function friendlyError(
  error: unknown,
  fallback = 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى'
): string {
  const err = error as ErrorLike | null | undefined;

  if (err?.code && KNOWN_CODES[err.code]) {
    return KNOWN_CODES[err.code];
  }

  const rawMessage = typeof err?.message === 'string' ? err.message : '';
  const lowerMessage = rawMessage.toLowerCase();

  for (const { match, arabic } of KNOWN_PATTERNS) {
    if (lowerMessage.includes(match)) {
      return arabic;
    }
  }

  // التفاصيل التقنية الكاملة لازم تتسجل فى الـ console للمطور (للتشخيص)،
  // لكن أبداً متتعرضش للمستخدم النهائي
  if (rawMessage) {
    console.error('[friendlyError] رسالة خطأ غير مصنّفة:', rawMessage);
  }

  return fallback;
}
