import { Network } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="card text-center py-12">
      <Network className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
      <p className="text-secondary-500">لا توجد بيانات لعرضها</p>
    </div>
  );
}
