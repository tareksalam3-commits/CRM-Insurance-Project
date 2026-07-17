import { useState } from 'react';
import { Shield } from 'lucide-react';
import clsx from 'clsx';
import { useSettings } from '../hooks/useSettings';

// شعار الشركة: بيعرض الصورة لو موجودة ومظبوطة، وبيرجع لأيقونة Shield تلقائياً
// لو مفيش رابط شعار أو الرابط فشل يفتح (بدل ما تفضل الصفحة مكسورة)
export function BrandMark({ className = 'w-8 h-8' }: { className?: string }) {
  const { branding } = useSettings();
  const [imgFailed, setImgFailed] = useState(false);

  if (branding.company_logo_url && !imgFailed) {
    return (
      <img
        src={branding.company_logo_url}
        alt={branding.company_name}
        className={clsx(className, 'object-contain rounded-md flex-shrink-0')}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return <Shield className={clsx(className, 'text-primary-600 flex-shrink-0')} />;
}
