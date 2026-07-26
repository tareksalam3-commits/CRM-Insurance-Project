/**
 * أنواع بيانات نظام "مركز المساعدة" (Help Center).
 *
 * كل صفحة فعلية فى التطبيق (بحسب `src/config/navigation.ts` و`src/App.tsx`)
 * لها كائن HelpContent واحد، مبنى فقط من عناصر موجودة فعلاً فى كود الصفحة
 * (أزرار، حقول، فلاتر، جداول، رسائل...) — بدون أي بيانات أو أمثلة وهمية.
 *
 * `sourceFiles` يوثّق المسار الحقيقي لملف/ملفات الصفحة، حتى لو حصل أي تعديل
 * مستقبلاً (زر جديد / حقل محذوف...)، يعرف أي مطور مباشرة أي جزء من هذا الملف
 * يجب تحديثه ليطابق الكود 100%. راجع أيضاً `scripts/check-help-coverage.mjs`
 * الذى يفحص تطابق الأزرار الفعلية مع ما هو موثق هنا وقت البناء (build).
 */

export interface HelpItem {
  /** اسم/تسمية العنصر كما يظهر فعلياً فى الواجهة */
  label: string;
  /** شرح وظيفته */
  description: string;
}

export interface HelpMessageItem extends HelpItem {
  /** نوع الرسالة: نجاح / خطأ / تنبيه / تأكيد */
  kind?: 'success' | 'error' | 'warning' | 'confirm' | 'info';
}

export interface HelpErrorItem extends HelpItem {
  /** الحل المقترح لهذا الخطأ تحديداً */
  resolution: string;
}

export interface HelpContent {
  /** المسار (Route) — يجب أن يطابق تعريفه فى App.tsx تماماً */
  path: string;
  /** اسم الصفحة كما يظهر فى القائمة الجانبية والعناوين */
  title: string;
  /** الغرض من الصفحة */
  purpose: string;
  /** متى تُستخدم هذه الصفحة */
  whenToUse: string;
  /** الأدوار التى يمكنها الوصول لهذه الصفحة (نص وصفي، وليس منطق صلاحيات) */
  rolesNote?: string;
  buttons?: HelpItem[];
  fields?: HelpItem[];
  tables?: HelpItem[];
  cardsAndStats?: HelpItem[];
  filters?: HelpItem[];
  messages?: HelpMessageItem[];
  errors?: HelpErrorItem[];
  /** ملاحظات إضافية خاصة بالصفحة (اختياري) */
  notes?: string[];
  /** مسار/مسارات الكود الفعلية المصدر لهذا المحتوى — للمطابقة المستقبلية */
  sourceFiles: string[];
}

export interface TourStep {
  id: string;
  /** يطابق قيمة data-tour-id على العنصر المستهدف فى الصفحة */
  targetId: string;
  title: string;
  description: string;
  /** المسار الذى يجب أن يكون المستخدم فيه لتظهر هذه الخطوة */
  path: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export interface FaqItem {
  question: string;
  answer: string;
}
