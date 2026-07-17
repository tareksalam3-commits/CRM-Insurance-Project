import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type BrandingSettings = {
  company_name: string;
  company_logo_url: string | null;
};

const DEFAULT_BRANDING: BrandingSettings = {
  company_name: 'نظام CRM التأمينات',
  company_logo_url: null
};

// هوك مشترك لجلب اسم/شعار الشركة، بيتقرا مرة ويتشارك بين كل الأماكن
// اللي بتعرضه (صفحة الدخول، الـ Sidebar، الـ Header، التقارير المطبوعة)
export function useSettings() {
  const query = useQuery({
    queryKey: ['settings', 'branding'],
    queryFn: async () => {
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
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  return {
    branding: query.data ?? DEFAULT_BRANDING,
    isLoading: query.isLoading
  };
}
