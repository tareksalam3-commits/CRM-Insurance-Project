import { Eye, MoreVertical } from 'lucide-react';
import type { Policy } from '../../../lib/supabase';

interface PolicyActionsProps {
  policy: Policy;
  onViewDetails: (policy: Policy) => void;
  onOpenMoreMenu: (policy: Policy) => void;
}

export function PolicyActions({ policy, onViewDetails, onOpenMoreMenu }: PolicyActionsProps) {
  return (
    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-secondary-100">
      <button
        onClick={(e) => { e.stopPropagation(); onViewDetails(policy); }}
        className="btn btn-secondary btn-sm flex-1"
      >
        <Eye className="w-4 h-4" />
        <span>التفاصيل</span>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onOpenMoreMenu(policy); }}
        className="btn btn-secondary btn-sm touch-target"
        title="المزيد"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
}
