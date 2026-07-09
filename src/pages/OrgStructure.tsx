import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase, ROLE_LABELS, getRoleLevel, canViewOrgStructure, type UserRole } from '../lib/supabase';
import {
  Network, ChevronDown, ChevronUp, Users, Wallet,
  Maximize2, Minimize2, Lock
} from 'lucide-react';
import clsx from 'clsx';

// ─── types ────────────────────────────────────────────────
interface OrgUser {
  id: string;
  name: string;
  role: UserRole;
  manager_id: string | null;
  is_active: boolean;
  avatar_url: string | null;
}

interface OrgNode {
  id: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl: string | null;
  employeeCount: number;   // كل من تحته (غير مباشرين كذلك)
  totalPaid: number;       // إجمالي المسدد فى الشهر الحالي (هو + كل من تحته)
  children: OrgNode[];
}

// ─── helpers ─────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(n);

const ROLE_STYLES: Record<UserRole, { bg: string; text: string; ring: string; dot: string }> = {
  super_admin:          { bg: 'bg-secondary-800',  text: 'text-white',        ring: 'ring-secondary-300', dot: 'bg-secondary-800' },
  development_manager:  { bg: 'bg-secondary-600',  text: 'text-white',        ring: 'ring-secondary-300', dot: 'bg-secondary-600' },
  general_supervisor:   { bg: 'bg-warning-100',    text: 'text-warning-700',  ring: 'ring-warning-200',   dot: 'bg-warning-500' },
  supervisor:           { bg: 'bg-primary-100',    text: 'text-primary-700',  ring: 'ring-primary-200',   dot: 'bg-primary-500' },
  group_leader:         { bg: 'bg-info-100',       text: 'text-info-700',     ring: 'ring-info-200',      dot: 'bg-info-500' },
  agent:                { bg: 'bg-success-100',    text: 'text-success-700',  ring: 'ring-success-200',   dot: 'bg-success-500' },
  premium_agent:        { bg: 'bg-success-100',    text: 'text-success-700',  ring: 'ring-success-200',   dot: 'bg-success-500' },
};

// ─── component ────────────────────────────────────────────
export function OrgStructure() {
  const { user } = useAuth();
  const [loading, setLoading]   = useState(true);
  const [root, setRoot]         = useState<OrgNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allIds, setAllIds]     = useState<string[]>([]);

  const canView = !!user && canViewOrgStructure(user.role);

  useEffect(() => { if (user && canView) loadData(); }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. كل من تحت المستخدم الحالي (شامله هو نفسه كجذر للشجرة)
      const { data: subtreeIds } = await supabase.rpc('get_user_subtree', { user_id: user!.id });
      const ids: string[] = subtreeIds || [user!.id];

      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, role, manager_id, is_active, avatar_url')
        .in('id', ids);

      const usersMap = new Map<string, OrgUser>((usersData || []).map((u: any) => [u.id, u]));

      // 2. إجمالي المسدد لكل شخص فى الشهر الحالي فقط — مدفوعات غير ملغاة فقط
      const now = new Date();
      const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      const { data: paymentsRaw } = await supabase
        .from('payments')
        .select('amount, installment:installment_id(policy:policy_id(owner_id))')
        .eq('is_cancelled', false)
        .eq('payment_month', currentMonthStart);

      const directPaid = new Map<string, number>();
      (paymentsRaw || []).forEach((p: any) => {
        const ownerId = p.installment?.policy?.owner_id;
        if (!ownerId || !usersMap.has(ownerId)) return;
        directPaid.set(ownerId, (directPaid.get(ownerId) || 0) + Number(p.amount));
      });

      // 3. شجرة العلاقات (manager_id → children) داخل النطاق المسموح فقط
      const childrenOf = new Map<string, string[]>();
      for (const u of usersMap.values()) {
        if (!u.manager_id || !usersMap.has(u.manager_id)) continue;
        if (!childrenOf.has(u.manager_id)) childrenOf.set(u.manager_id, []);
        childrenOf.get(u.manager_id)!.push(u.id);
      }

      const buildNode = (id: string): OrgNode => {
        const u = usersMap.get(id)!;
        const childIds = childrenOf.get(id) || [];
        const children = childIds.map(buildNode);
        const employeeCount = children.reduce((s, c) => s + c.employeeCount + 1, 0);
        const totalPaid = (directPaid.get(id) || 0) + children.reduce((s, c) => s + c.totalPaid, 0);
        return {
          id: u.id, name: u.name, role: u.role, isActive: u.is_active,
          avatarUrl: u.avatar_url || null,
          employeeCount, totalPaid, children,
        };
      };

      const rootNode = buildNode(user!.id);
      setRoot(rootNode);
      setAllIds(ids);
      setExpanded(new Set([user!.id])); // الجذر فقط مفتوح بداية
    } catch (err) {
      console.error('Error loading org structure:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const expandAll   = () => setExpanded(new Set(allIds));
  const collapseAll = () => setExpanded(new Set(root ? [root.id] : []));

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Lock className="w-16 h-16 text-secondary-300 mb-4" />
        <p className="text-secondary-500">ليس لديك صلاحية للوصول لهذه الصفحة</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900 flex items-center gap-2">
            <Network className="w-5 h-5 text-primary-600" />
            الهيكل الوظيفي
          </h2>
          <p className="text-sm text-secondary-500 mt-1">
            شجرة الفريق حسب صلاحياتك — عدد الموظفين وإجمالي المسدد للشهر الحالي أمام كل اسم
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={expandAll} className="btn btn-ghost text-secondary-600">
            <Maximize2 className="w-4 h-4" />
            <span>توسيع الكل</span>
          </button>
          <button onClick={collapseAll} className="btn btn-ghost text-secondary-600">
            <Minimize2 className="w-4 h-4" />
            <span>تصغير الكل</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : root ? (
        <div className="card">
          <OrgNodeView node={root} depth={0} expanded={expanded} onToggle={toggle} />
        </div>
      ) : (
        <div className="card text-center py-12">
          <Network className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
          <p className="text-secondary-500">لا توجد بيانات لعرضها</p>
        </div>
      )}
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────
// يعرض صورة البروفايل لو موجودة، وإلا يرجع لأيقونة الحرف الأول كما كان.
// عند فشل تحميل الصورة (رابط تالف) يرجع تلقائياً لنفس الأيقونة الافتراضية.
function OrgAvatar({
  name, avatarUrl, style,
}: {
  name: string;
  avatarUrl: string | null;
  style: { bg: string; text: string; ring: string };
}) {
  const [imgError, setImgError] = useState(false);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        loading="lazy"
        decoding="async"
        className={clsx(
          'w-10 h-10 rounded-full object-cover flex-shrink-0 ring-2',
          style.ring
        )}
      />
    );
  }

  return (
    <div className={clsx(
      'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ring-2',
      style.bg, style.text, style.ring
    )}>
      {name.charAt(0)}
    </div>
  );
}

// ─── Recursive node ────────────────────────────────────────
function OrgNodeView({
  node, depth, expanded, onToggle,
}: {
  node: OrgNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const style      = ROLE_STYLES[node.role];
  const isOpen     = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div className={clsx(depth > 0 && 'mt-2')}>
      <button
        onClick={() => hasChildren && onToggle(node.id)}
        className={clsx(
          'w-full flex items-center justify-between gap-3 p-3 rounded-xl border transition-all text-right',
          hasChildren ? 'cursor-pointer hover:shadow-sm' : 'cursor-default',
          isOpen ? 'bg-white border-secondary-200' : 'bg-secondary-50 border-secondary-100'
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <OrgAvatar name={node.name} avatarUrl={node.avatarUrl} style={style} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-secondary-900 truncate">{node.name}</p>
              {!node.isActive && (
                <span className="badge badge-error text-[10px] flex-shrink-0">معطّل</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', style.dot)} />
              <span className="text-xs text-secondary-500">{ROLE_LABELS[node.role]}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-left hidden sm:flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-secondary-400" />
            <span className="text-xs text-secondary-600">{node.employeeCount}</span>
          </div>
          <div className="text-left flex items-center gap-1.5" title="إجمالي المسدد للشهر الحالي">
            <Wallet className="w-3.5 h-3.5 text-success-500" />
            <span className="text-xs sm:text-sm font-semibold text-success-700">{fmt(node.totalPaid)}</span>
          </div>
          {hasChildren && (
            isOpen
              ? <ChevronUp className="w-4 h-4 text-secondary-400 flex-shrink-0" />
              : <ChevronDown className="w-4 h-4 text-secondary-400 flex-shrink-0" />
          )}
        </div>
      </button>

      {/* عدد الموظفين على الموبايل (مخفي فوق في sm) */}
      <div className="sm:hidden flex items-center gap-1.5 px-3 mt-1">
        <Users className="w-3 h-3 text-secondary-400" />
        <span className="text-[11px] text-secondary-500">{node.employeeCount} موظف تحته</span>
      </div>

      {hasChildren && isOpen && (
        <div className="mr-5 pr-4 border-r-2 border-dashed border-secondary-200 mt-2 space-y-2">
          {node.children.map((child) => (
            <OrgNodeView key={child.id} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
