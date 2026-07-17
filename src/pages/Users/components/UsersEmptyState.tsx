import { UserPlus, Users as UsersIcon, SearchX } from 'lucide-react';

interface UsersEmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
  onAddUser: () => void;
}

export function UsersEmptyState({ hasFilters, onClearFilters, onAddUser }: UsersEmptyStateProps) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4 animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-secondary-100 flex items-center justify-center mb-4">
          <SearchX className="w-8 h-8 text-secondary-400" />
        </div>
        <p className="font-medium text-secondary-700">لا توجد نتائج مطابقة</p>
        <p className="text-sm text-secondary-500 mt-1 max-w-xs">
          جرّب تعديل كلمة البحث أو تغيير الفلتر المستخدم
        </p>
        <button onClick={onClearFilters} className="btn btn-secondary btn-sm mt-4">
          إعادة تعيين الفلاتر
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4 animate-fadeIn">
      <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
        <UsersIcon className="w-8 h-8 text-primary-400" />
      </div>
      <p className="font-medium text-secondary-700">لا يوجد مستخدمون بعد</p>
      <p className="text-sm text-secondary-500 mt-1 max-w-xs">
        ابدأ بإضافة أول مستخدم لإدارة فريقك وصلاحياته
      </p>
      <button onClick={onAddUser} className="btn btn-primary btn-sm mt-4">
        <UserPlus className="w-4 h-4" />
        <span>إضافة مستخدم</span>
      </button>
    </div>
  );
}
