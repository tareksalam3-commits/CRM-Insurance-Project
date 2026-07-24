import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Percent,
  Calculator,
  Network,
  BarChart3,
  CalendarCheck,
  Upload,
  History,
  Wallet,
  Settings,
  Sparkles,
  User,
  Home,
  Shield,
  ClipboardList,
  MessageSquare,
  Building2,
} from 'lucide-react';
import { UserRole, canManageUsers, canViewOrgStructure, canViewSettings, canManageBranches, getRoleLevel } from '../lib/supabase';

// الوكيل والوسيط الحر (المستوى 6) هما آخر مستوى فى الهيكل، وليس لهم أي
// صفحات إدارية أو نظامية. تُستخدم هذه الدالة لإخفاء قسمي "الإدارة" و"النظام"
// بالكامل عن الوكيل، بغض النظر عن صلاحيات العناصر الفردية بداخلهما.
export function isNotAgent(role: UserRole): boolean {
  return getRoleLevel(role) <= 5;
}

// Super Admin لا يظهر داخل نظام الرسائل ولا يمكن مراسلته إطلاقاً (حسب متطلبات
// النظام)، لذلك تُخفى الصفحة عنه بالكامل من القائمة، مع حماية الـ Route نفسه.
export function canAccessMessages(role: UserRole): boolean {
  return role !== 'super_admin';
}

// صفحة "تقارير العمل اليومية" غير متاحة لدور "وسيط حر" (premium_agent)
// إطلاقاً — لا تظهر له فى القائمة، ولا يمكنه الوصول إليها حتى لو كتب
// الرابط مباشرة (محمية أيضاً على مستوى الـ Route فى App.tsx).
export function canAccessDailyReports(role: UserRole): boolean {
  return role !== 'premium_agent';
}

// "غرفة الفريق": الغرفة الجماعية الوحيدة بالنظام. متاحة لجميع الأدوار بلا
// استثناء — بما فيهم Super Admin الذى لا يرسل رسائل فيها (لا يظهر كمشارك)
// لكنه الوحيد القادر على رؤيتها بالكامل ومراقبة كل الرسائل داخلها.
// ملحوظة: غرفة الفريق لم تعد صفحة مستقلة، بل أصبحت مدمجة داخل صفحة "الرسائل"
// (كعنصر مثبّت أعلى قائمة المحادثات)، لذلك تُستخدم هذه الدالة الآن فقط لإظهار
// أو إخفاء ذلك العنصر المثبّت داخل الصفحة، وليس كعنصر تنقّل منفصل.
export function canAccessTeamRoom(_role: UserRole): boolean {
  return true;
}

// صفحة "الرسائل" أصبحت تحتوي على كل من المحادثات المباشرة وغرفة الفريق معاً.
// لذلك يجب أن تكون الصفحة مرئية ومتاحة لأي مستخدم يملك صلاحية أي منهما —
// وعلى رأسهم Super Admin الذى لا يصل لصلاحية canAccessMessages لكنه يحتاج
// الوصول لغرفة الفريق التى أصبحت الآن داخل نفس الصفحة.
export function canAccessMessagesPage(role: UserRole): boolean {
  return canAccessMessages(role) || canAccessTeamRoom(role);
}

// ==========================================================================
// مصدر واحد موحّد لتعريف صفحات وتنقل التطبيق (Sidebar + Bottom Nav + العناوين)
// أي تعديل على الصفحات (اسم / أيقونة / صلاحية) يتم هنا فقط، ويظهر تلقائياً
// في كل مكان بالتطبيق (لا تكرار للتعريفات). لا يوجد هنا أي تغيير في الـ
// Routes أو الصلاحيات الفعلية — فقط استخدام دوال الصلاحيات الموجودة بالفعل
// في lib/supabase.ts.
// ==========================================================================

export type NavItem = {
  /** المسار (Route) — يجب أن يطابق تعريف Route في App.tsx تماماً، لم يتغير */
  path: string;
  /** الاسم الرسمي للصفحة، يُستخدم فى الـ Sidebar والعناوين وكل مكان آخر */
  label: string;
  /** عنوان فرعي قصير اختياري يظهر بجوار الاسم فى القائمة الجانبية بخط أخف
   *  ولون أفتح (بدون منافسة الاسم الأساسي بصرياً) — لتوضيح الصفحة فقط */
  subLabel?: string;
  icon: LucideIcon;
  /** لو غير معرّفة، الصفحة تظهر للجميع. لم يتم تغيير أي منطق صلاحيات موجود. */
  isVisible?: (role: UserRole) => boolean;
};

export type NavGroupKey = 'operations' | 'management' | 'system' | 'account';

export type NavGroup = {
  key: NavGroupKey;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  /** لو غير معرّفة، القسم يظهر للجميع (حسب صلاحيات عناصره الفردية فقط). */
  isVisible?: (role: UserRole) => boolean;
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'operations',
    label: 'العمليات',
    icon: Home,
    items: [
      { path: '/',                 label: 'الرئيسية',        icon: LayoutDashboard },
      { path: '/daily-reports',    label: 'تقارير العمل اليومية', icon: ClipboardList, isVisible: canAccessDailyReports },
      { path: '/customers',        label: 'العملاء',          subLabel: 'طلبات التأمين', icon: Users },
      { path: '/policies',         label: 'الوثائق',          icon: FileText },
      { path: '/collection',       label: 'التحصيل والسداد',  icon: CreditCard },
      { path: '/commissions',      label: 'العمولات',         icon: Percent },
      { path: '/messages',         label: 'الرسائل',          icon: MessageSquare, isVisible: canAccessMessagesPage },
    ],
  },
  {
    key: 'management',
    label: 'الإدارة',
    icon: Users,
    isVisible: isNotAgent,
    items: [
      { path: '/users',           label: 'إدارة المستخدمين', icon: Users,       isVisible: canManageUsers },
      { path: '/org-structure',   label: 'الهيكل الوظيفي',   icon: Network,     isVisible: canViewOrgStructure },
      { path: '/reports',         label: 'مؤشرات الأداء والإحصائيات', icon: BarChart3 },
      { path: '/monthly-closing', label: 'إقفال الشهر',      icon: CalendarCheck },
    ],
  },
  {
    key: 'system',
    label: 'النظام',
    icon: Settings,
    isVisible: isNotAgent,
    items: [
      { path: '/data-import',        label: 'استيراد البيانات',        icon: Upload },
      { path: '/activity-log',       label: 'سجل العمليات',            icon: History },
      { path: '/subscriptions-admin', label: 'الاشتراكات',             icon: Wallet,   isVisible: canViewSettings },
      { path: '/branches',            label: 'إدارة الفروع',           icon: Building2, isVisible: canManageBranches },
      { path: '/settings',            label: 'إعدادات النظام',         icon: Settings, isVisible: canViewSettings },
      { path: '/ai-settings',         label: 'إعدادات الذكاء الاصطناعي', icon: Sparkles, isVisible: canViewSettings },
    ],
  },
  {
    key: 'account',
    label: 'الحساب',
    icon: User,
    items: [
      { path: '/profile', label: 'الملف الشخصي', icon: User },
    ],
  },
];

// صفحة "حاسبة الأسعار" — عنصر مستقل خارج كل الأقسام (بناءً على طلب مباشر)،
// يظهر فى الـ Sidebar كرابط منفرد بين قسم "العمليات" وقسم "الإدارة" مباشرة،
// بدون طي/فتح وبدون الحاجة لفتح أي قسم للوصول له.
export const PRICE_CALCULATOR_ITEM: NavItem = {
  path: '/price-calculator', label: 'حاسبة الأسعار', icon: Calculator,
};

// ترتيب العرض الكامل فى الـ Sidebar: قسم ثم عنصر مستقل ثم باقي الأقسام.
// هذا هو المصدر الوحيد الذى يعتمد عليه Sidebar.tsx لرسم القائمة بالترتيب الصحيح.
export type NavLayoutEntry =
  | { kind: 'group'; group: NavGroup }
  | { kind: 'standalone'; item: NavItem };

export const NAV_LAYOUT: NavLayoutEntry[] = [
  { kind: 'group', group: NAV_GROUPS[0] },       // العمليات
  { kind: 'standalone', item: PRICE_CALCULATOR_ITEM }, // حاسبة الأسعار (مستقلة)
  { kind: 'group', group: NAV_GROUPS[1] },       // الإدارة
  { kind: 'group', group: NAV_GROUPS[2] },       // النظام
  { kind: 'group', group: NAV_GROUPS[3] },       // الحساب
];

// عناصر الوصول السريع في Bottom Navigation (الموبايل) + "المزيد"
// (المزيد يُضاف يدوياً فى Sidebar.tsx لأنه يفتح الـ Drawer وليس Route).
// الترتيب الأساسي (وكيل / وسيط حر / رئيس مجموعة — المستوى 5 فما فوق):
//   الرئيسية، العملاء، الوثائق، التحصيل، الحاسبة (5 عناصر)
// المراقب فما فوق (المستوى 4 فأقل) يضاف له عنصر "المؤشرات" قبل الحاسبة مباشرة:
//   الرئيسية، العملاء، الوثائق، التحصيل، المؤشرات، الحاسبة (6 عناصر)
export function getBottomNavItems(role: UserRole): NavItem[] {
  const items: NavItem[] = [
    { path: '/',           label: 'الرئيسية', icon: LayoutDashboard },
    { path: '/customers',  label: 'العملاء',   icon: Users },
    { path: '/policies',   label: 'الوثائق',   icon: FileText },
    { path: '/collection', label: 'التحصيل',   icon: CreditCard },
  ];

  if (getRoleLevel(role) <= 4) {
    items.push({ path: '/reports', label: 'المؤشرات', icon: BarChart3 });
  }

  items.push({ path: PRICE_CALCULATOR_ITEM.path, label: 'الحاسبة', icon: Calculator });

  return items;
}

// خريطة عناوين الصفحات (Page Titles / Breadcrumbs) مبنية تلقائياً من نفس
// التعريف أعلاه حتى لا يتكرر أي اسم صفحة فى أكثر من مكان.
export const PAGE_TITLES: Record<string, string> = [...NAV_GROUPS.flatMap((g) => g.items), PRICE_CALCULATOR_ITEM].reduce(
  (acc, item) => {
    acc[item.path] = item.label;
    return acc;
  },
  {} as Record<string, string>
);

/** الأيقونة الاحتياطية (Fallback) المستخدمة فى شعار الدرج عند عدم توفر شعار الشركة */
export const FALLBACK_BRAND_ICON = Shield;

/**
 * يرجع ترتيب العرض الكامل (أقسام + العنصر المستقل) بعد تطبيق الصلاحيات:
 * - أي قسم أصبح فارغاً بالكامل يُحذف تماماً.
 * - العنصر المستقل يُحذف لو صاحب الدور مالوش صلاحية عليه (حالياً متاح للجميع).
 */
export function getVisibleNavLayout(role: UserRole): NavLayoutEntry[] {
  return NAV_LAYOUT
    .map((entry): NavLayoutEntry | null => {
      if (entry.kind === 'standalone') {
        if (entry.item.isVisible && !entry.item.isVisible(role)) return null;
        return entry;
      }
      if (entry.group.isVisible && !entry.group.isVisible(role)) return null;
      const items = entry.group.items.filter((item) => (item.isVisible ? item.isVisible(role) : true));
      return items.length > 0 ? { kind: 'group', group: { ...entry.group, items } } : null;
    })
    .filter((entry): entry is NavLayoutEntry => entry !== null);
}