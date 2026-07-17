import { ROLE_LABELS, type UserRole } from '../../lib/supabase';
import type { RosterUser } from '../OrgStructure';

// ─── ترتيب مستويات "تشكيل الجهاز الإنتاجي" ─────────────────
// 0: المراقب العام   1: المراقبون   2: رؤساء المجموعات   3: الوكلاء (أسماء فقط)
// أي درجة إدارية أعلى (مدير تطوير / مدير عام النظام) لا تُعتبر مستوى في التشكيل،
// وبيتم تخطّيها تلقائياً للنزول لأقرب مستوى فعلي تحته.
const TIER_ROLES: (UserRole | UserRole[])[] = [
  'general_supervisor',
  'supervisor',
  'group_leader',
  ['agent', 'premium_agent'],
];

function tierOf(role: UserRole): number {
  return TIER_ROLES.findIndex((t) => (Array.isArray(t) ? t.includes(role) : t === role));
}

export interface OrgChartNode {
  id: string;
  name: string;
  roleLabel: string;
  tier: number;
  children: OrgChartNode[];
}

// يجمع أقرب مجموعة معرّفات من الدرجات المطلوبة انطلاقًا من مجموعة نقاط بداية،
// متخطّياً أي درجات وسيطة لا تنتمي لهذه الدرجات (مثل درجات إدارية أعلى)
function collectByRoles(
  startIds: string[],
  targetRoles: UserRole[],
  roster: Map<string, RosterUser>,
  childrenMap: Map<string, string[]>,
): string[] {
  const result: string[] = [];
  const queue = [...startIds];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = roster.get(id);
    if (!node) continue;
    if (targetRoles.includes(node.role)) {
      result.push(id);
    } else {
      (childrenMap.get(id) || []).forEach((c) => queue.push(c));
    }
  }
  return result;
}

function buildNode(
  id: string,
  roster: Map<string, RosterUser>,
  childrenMap: Map<string, string[]>,
): OrgChartNode | null {
  const node = roster.get(id);
  if (!node) return null;
  const tier = tierOf(node.role);
  if (tier === -1) return null;

  if (tier === 3) {
    // الوكلاء: أوراق نهائية بلا أبناء (تُعرض كأسماء فقط في قائمة رأسية)
    return { id, name: node.name, roleLabel: '', tier, children: [] };
  }

  const nextTier = TIER_ROLES[tier + 1];
  const nextRoles = Array.isArray(nextTier) ? nextTier : [nextTier];
  const childIds = collectByRoles(childrenMap.get(id) || [], nextRoles, roster, childrenMap);

  let children = childIds
    .map((cid) => buildNode(cid, roster, childrenMap))
    .filter((n): n is OrgChartNode => n !== null);

  // ترتيب الوكلاء أبجديًا لسهولة القراءة (المستويات الإدارية تحافظ على ترتيب تحميلها)
  if (tier === 2) {
    children = children.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  return { id, name: node.name, roleLabel: ROLE_LABELS[node.role], tier, children };
}

// يبحث عن كل "رؤوس" التشكيل القابلة للعرض بدءًا من نقطة الجذر (المستخدم الحالي)،
// نازلاً عبر أي درجات إدارية أعلى ليست جزءًا من التشكيل نفسه
function findHeads(
  rootId: string,
  roster: Map<string, RosterUser>,
  childrenMap: Map<string, string[]>,
): OrgChartNode[] {
  const node = roster.get(rootId);
  if (!node) return [];

  if (tierOf(node.role) !== -1) {
    const built = buildNode(rootId, roster, childrenMap);
    return built ? [built] : [];
  }

  const childIds = childrenMap.get(rootId) || [];
  return childIds.flatMap((cid) => findHeads(cid, roster, childrenMap));
}

/**
 * يبني شجرة "تشكيل الجهاز الإنتاجي" بالكامل من البيانات المحمّلة فعليًا في صفحة
 * الهيكل الوظيفي (roster + childrenMap)، وهي نفس البيانات المطبّقة عليها صلاحيات
 * المستخدم الحالي (subtree) — فلا يظهر في التقرير إلا ما يملك صلاحية رؤيته بالفعل.
 */
export function buildOrgChart(
  rootId: string,
  roster: Map<string, RosterUser>,
  childrenMap: Map<string, string[]>,
): OrgChartNode[] {
  return findHeads(rootId, roster, childrenMap);
}

// إحصائيات مساعدة لضبط حجم الخط/المسافات تلقائيًا حسب حجم التشكيل
export function countChartEntities(heads: OrgChartNode[]): { boxes: number; agents: number } {
  let boxes = 0;
  let agents = 0;
  const walk = (n: OrgChartNode) => {
    if (n.tier === 3) { agents++; return; }
    boxes++;
    n.children.forEach(walk);
  };
  heads.forEach(walk);
  return { boxes, agents };
}
