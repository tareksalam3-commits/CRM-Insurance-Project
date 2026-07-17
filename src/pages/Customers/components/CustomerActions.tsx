import { Eye, MoreVertical } from 'lucide-react';
import type { CustomerWithRelations } from '../types';

interface CustomerActionsProps {
  customer: CustomerWithRelations;
  onViewDetails: (customer: CustomerWithRelations) => void;
  onOpenMoreMenu: (customer: CustomerWithRelations) => void;
}

export function CustomerActions({ customer, onViewDetails, onOpenMoreMenu }: CustomerActionsProps) {
  return (
    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-secondary-100">
      <button
        onClick={(e) => { e.stopPropagation(); onViewDetails(customer); }}
        className="btn btn-secondary btn-sm flex-1"
      >
        <Eye className="w-4 h-4" />
        <span>التفاصيل</span>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onOpenMoreMenu(customer); }}
        className="btn btn-secondary btn-sm touch-target"
        title="المزيد"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
}
