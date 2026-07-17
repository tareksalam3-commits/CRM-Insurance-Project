import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { PageHeader } from '../../../components/layout/PageHeader';

// رأس الصفحة
export function CollectionHeader() {
  return (
    <PageHeader
      title="التحصيل والسداد"
      subtitle={`متابعة الأقساط والتحصيلات — ${format(new Date(), 'MMMM yyyy', { locale: ar })}`}
    />
  );
}
