import { supabase, User, UserRole } from '../../../lib/supabase';
import { startOfMonth, format } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AgentRow } from '../types';

// ==============================
// أدوات مساعدة عامة — نطاق التحليل (Assistant Analysis Scope)
// ------------------------------
// المساعد الذكي لا يعتمد على صلاحيات الصفحة الحالية (get_user_subtree /
// RLS العادي)، وإنما يحدد "نطاق التحليل" الخاص به بناءً على الدرجة
// الوظيفية للمستخدم:
//   وكيل            → كل المراقبة التابع لها (رئيس مجموعته + كل رؤساء
//                      المجموعات والوكلاء تحت نفس المراقب)
//   رئيس مجموعة      → كل المراقبة العامة التابع لها
//   مراقب / مراقب عام → كل وحدة مدير التطوير التابع لها
//   مدير تطوير       → وحدته بالكامل
//   مدير فرع / Super Admin → الفرع بالكامل
//
// هذا الحساب بيتم بالكامل جوه قاعدة البيانات عن طريق get_assistant_scope_ids
// (SECURITY DEFINER، migration 049) - دالة مستقلة تماماً عن get_user_subtree
// المستخدمة فى صلاحيات النظام/الصفحات، فمفيش أي تأثير على صلاحيات الشاشات
// التانية. الدالة بتاخد هوية المستخدم من auth.uid() داخلياً فقط (مفيش أي
// user id بيتبعت من هنا) عشان محدش يقدر يوسّع نطاقه بنفسه.
//
// كل قراءة بيانات فعلية (مستخدمين/مدفوعات...) بتتم عبر دوال assistant_scoped_*
// المقابلة (نفس الميجريشن) بدل قراءة الجداول مباشرة، عشان نطاق التحليل الأوسع
// ده يتطبّق فعلياً جوه القاعدة، مش بس فلترة فى المتصفح على بيانات already
// مقصورة على صلاحيات الصفحة العادية.
// ==============================

export async function getScopedUserIds(user: User): Promise<string[]> {
  const result = await dalRead(
    `assistant:scope:${user.id}`,
    async () => {
      const { data, error } = await supabase.rpc('get_assistant_scope_ids');
      if (error) throw error;
      return (data as string[]) || [user.id];
    },
    { emptyValue: [user.id] },
  );
  return result.data;
}

/**
 * "المحقق" و"الهدف" الخاصين بالمستخدم، بنفس النطاق ونفس المنطق المستخدم
 * فعليًا في صفحة لوحة التحكم (Dashboard) بالظبط - get_user_subtree
 * (المرؤوسين المباشرين وتحتهم فقط)، مش "نطاق التحليل" الأوسع الخاص
 * بالمساعد (get_assistant_scope_ids).
 *
 * ليه لازم دالة منفصلة هنا: "الهدف" (target) قيمة مُدخَلة يدويًا للمستخدم
 * نفسه بس، مش قيمة بترجع لكل فريق. لو حسبنا "المحقق" على نطاق التحليل
 * الأوسع (زي باقي دوال الملف ده) وقسمناه على نفس هدف المستخدم الفردي،
 * النسبة بتطلع مبالغ فيها. ولو جمعنا هدف كل الفريق ضمن النطاق الأوسع
 * (زي ما كنا بنعمل قبل كده)، الرقم بيطلع ضخم وغريب عن اللي المستخدم متعوّد
 * يشوفه. الحل الصحيح: نفس البيانات ونفس النطاق اللي بتظهر في لوحة التحكم
 * بالظبط، عشان الرقم يتطابق مع اللي المستخدم شايفه فعليًا في التطبيق.
 */
export async function getSubtreeUserIds(user: User): Promise<string[]> {
  const result = await dalRead(
    `assistant:subtree:${user.id}`,
    async () => {
      const { data, error } = await supabase.rpc('get_user_subtree', { user_id: user.id });
      if (error) throw error;
      return (data as string[]) || [user.id];
    },
    { emptyValue: [user.id] },
  );
  return result.data;
}

interface SubtreePayment {
  amount: number;
  isFirst: boolean;
}

export async function getSubtreeScopedPayments(subtreeIds: string[], monthStartStr: string): Promise<SubtreePayment[]> {
  const result = await dalRead(
    `assistant:subtreePayments:${subtreeIds.slice().sort().join(',')}:${monthStartStr}`,
    async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('amount, installment:installment_id(is_first, policy:policy_id(owner_id))')
        .eq('payment_month', monthStartStr)
        .eq('is_cancelled', false);
      if (error) throw error;
      return (data || [])
        .filter((p: any) => subtreeIds.includes(p.installment?.policy?.owner_id))
        .map((p: any) => ({ amount: Number(p.amount), isFirst: Boolean(p.installment?.is_first) }));
    },
    { emptyValue: [] as SubtreePayment[] },
  );
  return result.data;
}

/**
 * بيرجع كل المستخدمين ضمن نطاق التحليل الخاص بالمستخدم الحالي (زي ما هو
 * محدد فوق)، مع إجمالي التحصيل/الإنتاج بتاعهم للشهر الحالي (مع تجميع أداء
 * الفروع تحتهم) - نفس منطق "أداء الفريق" لكن على نطاق التحليل الأوسع بدل
 * المرؤوسين المباشرين بس.
 *
 * ملحوظة: باراميتر userIds بيتقبل هنا فقط عشان الشكل الحالي لباقي الكود
 * (Cache keys فى الملفات اللي بتستدعي الدالة دي) - النطاق الفعلي بيتحدد
 * دايماً جوه القاعدة عن طريق get_assistant_scope_ids() (auth.uid())، مش من
 * القيمة الممرَّرة هنا.
 */
interface ScopedTeamRaw {
  teamUsers: any[];
  payments: any[];
}

async function fetchScopedTeamRaw(userIds: string[], monthStartStr: string): Promise<ScopedTeamRaw> {
  const result = await dalRead(
    `assistant:teamAchievement:${userIds.slice().sort().join(',')}:${monthStartStr}`,
    async () => {
      const { data: teamUsers, error: usersError } = await supabase.rpc('assistant_scoped_users');
      if (usersError) throw usersError;

      const { data: payments, error: paymentsError } = await supabase.rpc('assistant_scoped_payments', {
        p_payment_month: monthStartStr,
      });
      if (paymentsError) throw paymentsError;

      return { teamUsers: teamUsers || [], payments: payments || [] };
    },
    { emptyValue: { teamUsers: [], payments: [] } },
  );
  return result.data;
}

export async function getScopedTeamAchievement(userIds: string[]): Promise<AgentRow[]> {
  const monthStart = startOfMonth(new Date());
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');

  const { teamUsers, payments } = await fetchScopedTeamRaw(userIds, monthStartStr);

  if (!teamUsers) return [];

  const directAchieved = new Map<string, number>();
  (payments || []).forEach((p: any) => {
    const ownerId = p.owner_id;
    if (!ownerId) return;
    directAchieved.set(ownerId, (directAchieved.get(ownerId) || 0) + Number(p.amount));
  });

  const childrenMap = new Map<string, string[]>();
  teamUsers.forEach((u) => {
    if (u.manager_id) {
      const list = childrenMap.get(u.manager_id) || [];
      list.push(u.id);
      childrenMap.set(u.manager_id, list);
    }
  });

  const rolledUpCache = new Map<string, number>();
  const getRolledUpAchieved = (userId: string): number => {
    if (rolledUpCache.has(userId)) return rolledUpCache.get(userId)!;
    let total = directAchieved.get(userId) || 0;
    const children = childrenMap.get(userId) || [];
    for (const childId of children) {
      total += getRolledUpAchieved(childId);
    }
    rolledUpCache.set(userId, total);
    return total;
  };

  return teamUsers
    .filter((u) => u.is_active)
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role as UserRole,
      achieved: getRolledUpAchieved(u.id),
      target: u.target || 0
    }));
}
