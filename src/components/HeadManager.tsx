import { useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';

export function HeadManager() {
  const { branding } = useSettings();

  useEffect(() => {
    // تحديث عنوان الصفحة
    if (branding.company_name) {
      document.title = branding.company_name;
    }

    // تحديث الأيقونة (Favicon)
    if (branding.company_logo_url) {
      const updateIcon = (selector: string) => {
        const link = document.querySelector(selector) as HTMLLinkElement;
        if (link) {
          link.href = branding.company_logo_url!;
        } else {
          const newLink = document.createElement('link');
          newLink.rel = selector.includes('apple') ? 'apple-touch-icon' : 'icon';
          newLink.href = branding.company_logo_url!;
          document.head.appendChild(newLink);
        }
      };

      updateIcon('link[rel="icon"]');
      updateIcon('link[rel="shortcut icon"]');
      updateIcon('link[rel="apple-touch-icon"]');
    }
  }, [branding]);

  return null;
}
