import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { fetchMyBranches, type MyBranchMembership } from './myBranches';
import { filterVisibleMemberships } from './branchVisibility';

// ===================================
// "سياق الفرع" (Branch Context) — المرحلة الثانية من دعم تعدد الفروع.
//
// المبدأ الأساسي: مستخدم عنده وضع وظيفي واحد بس (الحالة الطبيعية لغالبية
// المستخدمين) يفضل يشتغل بالظبط زي ما كان قبل هذه المرحلة — من غير ما
// يشوف أي سلكتور فرع أو أي فرق فى تجربة الاستخدام إطلاقًا. الـ Context ده
// بيحسب currentBranchId تلقائيًا فى الحالة دي، وبيسيب عرض السلكتور (فى
// الهيدر) مقصور فقط على المستخدمين اللي عندهم أكتر من وضع وظيفي.
//
// اختيار "الفرع الحالي" لمستخدم متعدد الفروع بيتحفظ فى الـ session
// (sessionStorage) بس — مش localStorage — عشان يتصفّر تلقائيًا لو المستخدم
// قفل التبويب/المتصفح، مطابقةً للمطلوب حرفيًا ("يحفظ اختيار الفرع الحالي
// فى الـ session").
// ===================================

function sessionKey(userId: string): string {
  return `crm:current-branch:${userId}`;
}

interface BranchContextValue {
  /** كل الفروع اللي المستخدم الحالي عضو فيها (helper fetchMyBranches تحت) */
  branches: MyBranchMembership[];
  /** true فقط لو عنده أكتر من وضع وظيفي — ده الشرط الوحيد لإظهار أي سلكتور */
  hasMultipleBranches: boolean;
  /** لسه بيحمّل بيانات الفروع بتاعة المستخدم */
  loading: boolean;
  /** الفرع الحالي المختار (أو الفرع الوحيد تلقائيًا لو عنده وضع واحد بس) */
  currentBranchId: string | null;
  /** لاستخدام سلكتور الفرع بس — بيحفظ الاختيار فى الـ session */
  setCurrentBranchId: (branchId: string) => void;
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<MyBranchMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBranchId, setCurrentBranchIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setBranches([]);
      setCurrentBranchIdState(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchMyBranches(user.id).then((allRoles) => {
      if (cancelled) return;
      // إخفاء "الفرع الرئيسي" عن أي حد غير سوبر أدمن — حتى من ضمن أوضاعه
      // الوظيفية بتاعته هو نفسه، فمش هيشوفه كخيار فى السلكتور ولا يتحسب كجزء
      // من "عنده أكتر من فرع" أصلاً.
      const roles = filterVisibleMemberships(allRoles, user.role);
      setBranches(roles);

      if (user.role === 'super_admin') {
        // السوبر أدمن مش موظف فعلي فى أي فرع — عضويته فى "الفرع الرئيسي"
        // مجرد placeholder تقني (backfill/RLS) مش وضع وظيفي حقيقي. لو سبناه
        // ياخد نفس مسار "وضع واحد بس" تحت، هيتقيّد بفرعه الوحيد ده وهيشوف
        // بس نفسه (مفيش حد تاني عضو فى الفرع الرئيسي)، فبيفقد رؤية كل باقي
        // الفروع الفعلية. currentBranchId = null يرجّعه لسلوك get_user_subtree
        // الأصلي العابر للفروع (كل من تحته فى الهرم بغض النظر عن الفرع) —
        // يعني يشوف إنتاج وبيانات كل الفروع دايمًا بشكل افتراضي.
        setCurrentBranchIdState(null);
        setLoading(false);
        return;
      }

      if (roles.length <= 1) {
        // وضع وظيفي واحد بس (أو صفر - حالة نادرة جدًا، قبل أي backfill):
        // فرع تلقائي بدون أي اختيار فى الواجهة.
        setCurrentBranchIdState(roles[0]?.branchId ?? null);
      } else {
        // أكتر من وضع وظيفي: نرجع لآخر اختيار محفوظ فى الـ session لنفس
        // المستخدم لو لسه صالح (لسه من ضمن فروعه)، وإلا الفرع الأساسي
        // (is_primary)، وإلا أول فرع فى القائمة.
        let saved: string | null = null;
        try {
          saved = sessionStorage.getItem(sessionKey(user.id));
        } catch {
          // بيئة بدون sessionStorage (نادر) — نتجاهل ونكمل بالقيمة الافتراضية
        }
        const validSaved = saved && roles.some((r) => r.branchId === saved) ? saved : null;
        const primary = roles.find((r) => r.isPrimary)?.branchId ?? null;
        setCurrentBranchIdState(validSaved ?? primary ?? roles[0].branchId);
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const setCurrentBranchId = (branchId: string) => {
    setCurrentBranchIdState(branchId);
    if (user) {
      try {
        sessionStorage.setItem(sessionKey(user.id), branchId);
      } catch {
        // تجاهل فشل الحفظ (بيئة بدون sessionStorage) — الاختيار هيفضل شغال
        // فى نفس الجلسة الحالية على الأقل عن طريق الـ state
      }
    }
  };

  const value = useMemo<BranchContextValue>(
    () => ({
      branches,
      hasMultipleBranches: branches.length > 1,
      loading,
      currentBranchId,
      setCurrentBranchId,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, loading, currentBranchId],
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranchContext(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (ctx === undefined) {
    throw new Error('useBranchContext must be used within a BranchProvider');
  }
  return ctx;
}
