import type { HelpContent } from '../types';
import {
  dashboardHelp, dailyReportsHelp, customersHelp, policiesHelp, policyDetailHelp,
  collectionHelp, commissionsHelp, messagesHelp,
} from './operations';
import {
  usersHelp, orgStructureHelp, orgFormationHelp, reportsHelp, monthlyClosingHelp, cancellationsHelp,
} from './management';
import {
  dataImportHelp, activityLogHelp, subscriptionsAdminHelp, branchesAdminHelp, settingsHelp,
} from './system';
import { profileHelp, priceCalculatorHelp, loginHelp } from './account';

/**
 * السجل الموحّد لكل محتوى المساعدة فى التطبيق.
 * أي صفحة جديدة تُضاف للتطبيق (Route جديد فى App.tsx) يجب أن يُضاف لها
 * كائن HelpContent هنا أيضاً — راجع `scripts/check-help-coverage.mjs` الذى
 * يفشل عملية البناء (build) لو صفحة موجودة فى App.tsx وغير موجودة هنا.
 */
export const HELP_REGISTRY: HelpContent[] = [
  dashboardHelp,
  dailyReportsHelp,
  customersHelp,
  policiesHelp,
  policyDetailHelp,
  collectionHelp,
  commissionsHelp,
  messagesHelp,
  usersHelp,
  orgStructureHelp,
  reportsHelp,
  monthlyClosingHelp,
  cancellationsHelp,
  dataImportHelp,
  activityLogHelp,
  subscriptionsAdminHelp,
  branchesAdminHelp,
  settingsHelp,
  profileHelp,
  priceCalculatorHelp,
  loginHelp,
];

/** محتوى إضافي غير مرتبط بمسار مستقل (نوافذ منبثقة داخل صفحة أخرى) — يظهر فى البحث والدليل الشامل فقط */
export const HELP_SUB_CONTENT: HelpContent[] = [orgFormationHelp];

/**
 * إيجاد محتوى المساعدة الخاص بمسار (Route) معين. يدعم المسارات الديناميكية
 * (مثل /policies/:id) بمطابقة أول جزء ثابت من المسار.
 */
export function getHelpForPath(pathname: string): HelpContent | undefined {
  const exact = HELP_REGISTRY.find((h) => h.path === pathname);
  if (exact) return exact;
  // مطابقة المسارات الديناميكية: /policies/:id تُطابق /policies/123
  return HELP_REGISTRY.find((h) => {
    if (!h.path.includes(':')) return false;
    const base = h.path.split('/:')[0];
    return pathname.startsWith(base + '/');
  });
}

export interface HelpSearchResult {
  content: HelpContent;
  matchedIn: string;
  snippet: string;
}

/**
 * محرك بحث بسيط من جانب العميل عبر كل محتوى المساعدة: يبحث فى اسم الصفحة،
 * الغرض، وكل الأزرار/الحقول/الجداول/البطاقات/الفلاتر/الرسائل/الأخطاء.
 */
export function searchHelp(query: string): HelpSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: HelpSearchResult[] = [];
  const all = [...HELP_REGISTRY, ...HELP_SUB_CONTENT];

  for (const content of all) {
    if (content.title.toLowerCase().includes(q)) {
      results.push({ content, matchedIn: 'اسم الصفحة', snippet: content.title });
      continue;
    }
    if (content.purpose.toLowerCase().includes(q)) {
      results.push({ content, matchedIn: 'الغرض من الصفحة', snippet: content.purpose });
      continue;
    }
    const sections: Array<[string, typeof content.buttons]> = [
      ['زر', content.buttons], ['حقل', content.fields], ['جدول', content.tables],
      ['بطاقة/إحصائية', content.cardsAndStats], ['فلتر', content.filters],
      ['رسالة', content.messages], ['خطأ', content.errors],
    ];
    let matched = false;
    for (const [sectionName, items] of sections) {
      const hit = items?.find((i) => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
      if (hit) {
        results.push({ content, matchedIn: sectionName, snippet: hit.label });
        matched = true;
        break;
      }
    }
    if (matched) continue;
  }
  return results;
}
