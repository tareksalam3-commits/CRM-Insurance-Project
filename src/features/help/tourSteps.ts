import type { TourStep } from './types';

/**
 * خطوات الجولة التعريفية الأولى. كل خطوة تستهدف عنصراً حقيقياً موجوداً
 * بالفعل فى الواجهة عبر خاصية data-tour-id (أُضيفت للعنصر المقابل فى
 * Header.tsx / Sidebar.tsx). أي تغيير فى مكان/اسم هذه العناصر يجب أن
 * ينعكس هنا وفى الملفين المذكورين معاً.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome-logo',
    targetId: 'sidebar-brand',
    title: 'أهلاً بك فى النظام',
    description: 'هذه جولة سريعة تعرّفك على أهم عناصر التطبيق. يمكنك تخطيها أو إعادتها فى أي وقت لاحقاً من صفحة "دليل المستخدم".',
    path: '/',
    placement: 'bottom',
  },
  {
    id: 'nav-sections',
    targetId: 'sidebar-nav',
    title: 'القائمة الجانبية',
    description: 'من هنا تتنقل بين كل صفحات النظام، مقسّمة إلى أقسام: العمليات، الإدارة، النظام، والحساب. الأقسام التى تظهر لك تعتمد على دورك وصلاحياتك.',
    path: '/',
    placement: 'left',
  },
  {
    id: 'header-search',
    targetId: 'header-search',
    title: 'البحث السريع',
    description: 'ابحث عن أي عميل بالاسم مباشرة من أي صفحة فى النظام.',
    path: '/',
    placement: 'bottom',
  },
  {
    id: 'header-notifications',
    targetId: 'header-notifications',
    title: 'الإشعارات',
    description: 'تصلك هنا كل التنبيهات المهمة: أقساط مستحقة، وثائق متأخرة، تقفيل الشهر، وغيرها.',
    path: '/',
    placement: 'bottom',
  },
  {
    id: 'header-messages',
    targetId: 'header-messages',
    title: 'الرسائل',
    description: 'تواصل مباشرة مع زملائك، أو انضم لغرفة الفريق الجماعية من هنا.',
    path: '/',
    placement: 'bottom',
  },
  {
    id: 'header-profile',
    targetId: 'header-profile',
    title: 'حسابك الشخصي',
    description: 'من هنا تصل لملفك الشخصي، إعدادات الأمان، وتسجيل الخروج.',
    path: '/',
    placement: 'bottom',
  },
  {
    id: 'header-help',
    targetId: 'header-help',
    title: 'مركز المساعدة',
    description: 'هذا الزر (؟) موجود أعلى كل صفحة فى التطبيق. اضغط عليه فى أي وقت لعرض شرح مفصّل خاص بالصفحة التى تتصفحها حالياً فقط.',
    path: '/',
    placement: 'bottom',
  },
];
