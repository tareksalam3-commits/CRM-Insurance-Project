import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { dalRead } from '../lib/dataAccessLayer';

export type BrandingSettings = {
  company_name: string;
  company_logo_url: string | null;
};

const DEFAULT_BRANDING: BrandingSettings = {
  company_name: 'قناة السويس لتأمينات الحياة',
  company_logo_url: null
};

// هوك مشترك لجلب اسم/شعار الشركة، بيتقرا مرة ويتشارك بين كل الأماكن
// اللي بتعرضه (صفحة الدخول، الـ Sidebar، الـ Header، التقارير المطبوعة).
// تمر من DAL عمداً — تُستخدم فى صفحة الدخول نفسها (قبل أي مصادقة)، فلازم
// تشتغل بنفس الحماية من انقطاع الاتصال زي باقي قراءات التطبيق بدل ما تفشل
// بصمت وترجع القيم الافتراضية دايماً حتى لو فيه نسخة محفوظة أحدث.
export function useSettings() {
  const query = useQuery({
    queryKey: ['settings', 'branding'],
    queryFn: async () => {
      const result = await dalRead<BrandingSettings>(
        'settings:branding',
        async () => {
          const { data, error } = await supabase
            .from('settings')
            .select('company_name, company_logo_url')
            .maybeSingle();

          if (error) throw error;

          return {
            company_name: data?.company_name?.trim() || DEFAULT_BRANDING.company_name,
            company_logo_url: data?.company_logo_url || null
          } as BrandingSettings;
        },
        { emptyValue: DEFAULT_BRANDING },
      );
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  return {
    branding: query.data ?? DEFAULT_BRANDING,
    isLoading: query.isLoading
  };
}
