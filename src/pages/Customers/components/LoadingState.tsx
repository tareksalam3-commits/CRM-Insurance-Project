import { CardGridSkeleton } from '../../../components/feedback/CardGridSkeleton';

export function LoadingState() {
  return <CardGridSkeleton count={6} titleWidthClass="w-28" />;
}
