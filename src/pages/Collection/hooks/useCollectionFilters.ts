import { useState } from 'react';
import type { QuickFilter, SubType, OwnerFilter } from '../types';

interface UseCollectionFiltersArgs {
  initialQuickFilter: QuickFilter;
  initialSubType: SubType;
}

export function useCollectionFilters({ initialQuickFilter, initialSubType }: UseCollectionFiltersArgs) {
  // فلاتر مُطبَّقة فعلياً على الاستعلام
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(initialQuickFilter);
  const [subType, setSubType]         = useState<SubType>(initialSubType);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  // مسودة الفلاتر داخل لوحة "الفلاتر" — تتغيّر فقط عبر زر "تطبيق" أو "إعادة تعيين"
  const [quickFilterDraft, setQuickFilterDraft] = useState<QuickFilter>(initialQuickFilter);
  const [subTypeDraft, setSubTypeDraft]         = useState<SubType>(initialSubType);
  const [ownerFilterDraft, setOwnerFilterDraft] = useState<OwnerFilter>('all');
  const [showFilters, setShowFilters]           = useState(false);

  const handleOpenFilters = () => {
    setQuickFilterDraft(quickFilter);
    setSubTypeDraft(subType);
    setOwnerFilterDraft(ownerFilter);
    setShowFilters(true);
  };

  // ملحوظة: إعادة تعيين الصفحة إلى 1 بعد تطبيق/إعادة تعيين الفلاتر أو اختيار
  // شريحة سريعة هي مسؤولية الطرف المُستدعي (يستدعيها مع هذه الدوال ضمن نفس
  // الحدث حتى يتم تجميعها فى نفس التحديث دفعة واحدة).
  const handleApplyFilters = () => {
    setQuickFilter(quickFilterDraft);
    setSubType(subTypeDraft);
    setOwnerFilter(ownerFilterDraft);
    setShowFilters(false);
  };

  const handleResetFilters = () => {
    setQuickFilterDraft('month');
    setSubTypeDraft('all');
    setOwnerFilterDraft('all');
    setQuickFilter('month');
    setSubType('all');
    setOwnerFilter('all');
    setShowFilters(false);
  };

  // شريحة سريعة لاختيار الفلتر مباشرة بدون فتح اللوحة
  const handleQuickFilterSelect = (id: QuickFilter) => {
    setQuickFilter(id);
    setSubType('all');
  };

  const activeFilterCount = (quickFilter !== 'month' ? 1 : 0) + (subType !== 'all' ? 1 : 0) + (ownerFilter !== 'all' ? 1 : 0);

  return {
    quickFilter,
    subType,
    ownerFilter,
    quickFilterDraft,
    setQuickFilterDraft,
    subTypeDraft,
    setSubTypeDraft,
    ownerFilterDraft,
    setOwnerFilterDraft,
    showFilters,
    handleOpenFilters,
    handleApplyFilters,
    handleResetFilters,
    handleQuickFilterSelect,
    activeFilterCount,
  };
}
