import { type UserRole } from '../../lib/supabase';

// تقسيم "أداء الفريق" إلى أقسام منفصلة حسب الدرجة الوظيفية (بدل قائمة واحدة
// تخلط كل الدرجات ببعضها)، بترتيب هرمي ثابت، وكل قسم بأفضل 5 فقط.
export const TEAM_PERFORMANCE_SECTIONS: { label: string; roles: UserRole[] }[] = [
  { label: 'المراقبين العموم', roles: ['general_supervisor'] },
  { label: 'المراقبين', roles: ['supervisor'] },
  { label: 'رؤساء المجموعات', roles: ['group_leader'] },
  { label: 'الوكلاء', roles: ['agent', 'premium_agent'] },
];
