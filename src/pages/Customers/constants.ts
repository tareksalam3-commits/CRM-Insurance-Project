import { POLICY_STATUS_LABELS } from '../../lib/supabase';

export const STATUS_DOT_CLASS: Record<string, string> = {
  active: 'bg-success-500',
  cancelled: 'bg-error-500',
  no_policy: 'bg-warning-500'
};

export const STATUS_BADGE_CLASS: Record<string, string> = {
  active: 'badge-success',
  cancelled: 'badge-error',
  no_policy: 'badge-warning'
};

export const STATUS_LABEL: Record<string, string> = {
  ...POLICY_STATUS_LABELS,
  no_policy: 'قيد الإصدار'
};
