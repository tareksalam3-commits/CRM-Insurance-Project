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
} from 'lucide-react';
import { UserRole, canManageUsers, canViewOrgStructure, canViewSettings } from '../lib/supabase';

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
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'operations',
    label: 'العمليات',
    icon: Home,
    items: [
      { path: '/',                 label: 'الرئيسية',        icon: LayoutDashboard },
      { path: '/customers',        label: 'العملاء',          icon: Users },
      { path: '/policies',         label: 'الوثائق',          icon: FileText },
      { path: '/collection',       label: 'التحصيل والسداد',  icon: CreditCard },
      { path: '/commissions',      label: 'العمولات',         icon: Percent },
    ],
  },
  {
    key: 'management',
    label: 'الإدارة',
    icon: Users,
    items: [
      { path: '/users',           label: 'إدارة المستخدمين', icon: Users,       isVisible: canManageUsers },
      { path: '/org-structure',   label: 'الهيكل الوظيفي',   icon: Network,     isVisible: canViewOrgStructure },
      { path: '/reports',         label: 'التقارير الشاملة', icon: BarChart3 },
      { path: '/monthly-closing', label: 'إقفال الشهر',      icon: CalendarCheck },
    ],
  },
  {
    key: 'system',
    label: 'النظام',
    icon: Settings,
    items: [
      { path: '/data-import',        label: 'استيراد البيانات',        icon: Upload },
      { path: '/activity-log',       label: 'سجل العمليات',            icon: History },
      { path: '/subscriptions-admin', label: 'الاشتراكات',             icon: Wallet,   isVisible: canViewSettings },
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

// عناصر الوصول السريع في Bottom Navigation (الموبايل) — 4 عناصر ثابتة + "المزيد"
// (المزيد يُضاف يدوياً فى Sidebar.tsx لأنه يفتح الـ Drawer وليس Route). لم تتغير.
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { path: '/',           label: 'الرئيسية', icon: LayoutDashboard },
  { path: '/customers',  label: 'العملاء',   icon: Users },
  { path: '/collection', label: 'التحصيل',   icon: CreditCard },
  { path: '/policies',   label: 'الوثائق',   icon: FileText },
];

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
      const items = entry.group.items.filter((item) => (item.isVisible ? item.isVisible(role) : true));
      return items.length > 0 ? { kind: 'group', group: { ...entry.group, items } } : null;
    })
    .filter((entry): entry is NavLayoutEntry => entry !== null);
}
