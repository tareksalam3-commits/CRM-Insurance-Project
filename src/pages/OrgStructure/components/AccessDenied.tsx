import { Lock } from 'lucide-react';

export function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh]">
      <Lock className="w-16 h-16 text-secondary-300 mb-4" />
      <p className="text-secondary-500">ليس لديك صلاحية للوصول لهذه الصفحة</p>
    </div>
  );
}
