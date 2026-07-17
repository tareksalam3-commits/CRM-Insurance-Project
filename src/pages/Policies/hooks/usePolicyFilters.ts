import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

// فلاتر وبحث صفحة الوثائق — نفس المنطق المنقول بالضبط من index.tsx الأصلي:
// فلاتر "مُطبَّقة" منفصلة عن "مسودة" الفلاتر (تتغير فقط عبر زر تطبيق/إعادة
// تعيين)، وبحث محلي (localSearch) بيتزامن مع رابط الصفحة (searchParams) بعد
// تأخير 300ms. رقم الصفحة (page) موجود هنا لأن كل تغيير فى البحث أو الفلاتر
// هو اللي بيعيد ضبطه لـ 1 (نفس مكان setPage(1) فى الكود الأصلي).
export function usePolicyFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const searchQuery = searchParams.get('search') || '';
  const [localSearch, setLocalSearch] = useState(searchQuery);

  // فلاتر مُطبَّقة فعلياً على الاستعلام (تتغير فقط عبر زر "تطبيق" أو "إعادة تعيين")
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  // مسودة الفلاتر — القيم المختارة في الواجهة قبل الضغط على "تطبيق"
  const [statusDraft, setStatusDraft] = useState<string>('all');
  const [typeDraft, setTypeDraft] = useState<string>('all');
  const [monthDraft, setMonthDraft] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0) + (monthFilter !== 'all' ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0 || !!searchQuery;

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ value: format(d, 'yyyy-MM'), label: format(d, 'LLLL yyyy', { locale: ar }) });
    }
    return opts;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        if (localSearch) {
          setSearchParams({ search: localSearch });
        } else {
          setSearchParams({});
        }
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearch]);

  const handleApplyFilters = () => {
    setStatusFilter(statusDraft);
    setTypeFilter(typeDraft);
    setMonthFilter(monthDraft);
    setPage(1);
  };

  const handleResetFilters = useCallback(() => {
    setStatusDraft('all');
    setTypeDraft('all');
    setMonthDraft('all');
    setStatusFilter('all');
    setTypeFilter('all');
    setMonthFilter('all');
    setPage(1);
  }, []);

  const handleResetAll = useCallback(() => {
    handleResetFilters();
    setLocalSearch('');
    setSearchParams({});
  }, [handleResetFilters, setSearchParams]);

  return {
    searchParams,
    setSearchParams,
    page,
    setPage,
    searchQuery,
    localSearch,
    setLocalSearch,
    statusFilter,
    typeFilter,
    monthFilter,
    statusDraft,
    setStatusDraft,
    typeDraft,
    setTypeDraft,
    monthDraft,
    setMonthDraft,
    showFilters,
    setShowFilters,
    activeFilterCount,
    hasActiveFilters,
    monthOptions,
    handleApplyFilters,
    handleResetFilters,
    handleResetAll,
  };
}
