import { useSearchParams } from 'react-router-dom';
import type { QuickFilter, SubType } from '../types';

interface CollectionUrlParams {
  initialSubType: SubType;
  initialQuickFilter: QuickFilter;
  hasUrlNavigation: boolean;
}

// روابط لوحة التحكم القديمة كانت بتستخدم ?tab=new_production أو ?tab=periodic
// — بنحوّلها هنا لنفس الفلتر السريع الجديد المقابل تماماً بدون أي فرق فى النتيجة
//
// Navigation ذكي من لوحة التحكم: بطاقات "الأقساط المستحقة/المسددة/المتأخرة"
// بتفتح الصفحة دي مباشرة مع نفس الفلتر المقابل عبر ?quickFilter=
export function useCollectionUrlParams(): CollectionUrlParams {
  const [searchParams] = useSearchParams();

  const tabFromUrl = searchParams.get('tab');
  const initialSubType: SubType =
    tabFromUrl === 'new_production' ? 'new' : tabFromUrl === 'periodic' ? 'periodic' : 'all';

  const quickFilterFromUrl = searchParams.get('quickFilter');
  const initialQuickFilter: QuickFilter =
    quickFilterFromUrl === 'overdue' ? 'overdue' : quickFilterFromUrl === 'paid' ? 'paid' : 'month';

  const hasUrlNavigation = !!tabFromUrl || !!quickFilterFromUrl;

  return { initialSubType, initialQuickFilter, hasUrlNavigation };
}
