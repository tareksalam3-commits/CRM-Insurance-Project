import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase, type ActivityLog as ActivityLogEntry, type ActionType } from '../lib/supabase';
import {
  Search,
  History,
  ChevronLeft,
  ChevronRight,
  User,
  FileText,
  Settings,
  LogIn,
  LogOut,
  UserPlus,
  UserCheck,
  UserX,
  FilePlus,
  Pause,
  Play,
  XCircle,
  DollarSign,
  Lock,
  Unlock,
  Shield
} from 'lucide-react';
import { format } from 'date-fns';

const ACTION_CONFIG: Record<ActionType, { label: string; icon: any; color: string }> = {
  login: { label: 'تسجيل دخول', icon: LogIn, color: 'text-info-600 bg-info-100' },
  logout: { label: 'تسجيل خروج', icon: LogOut, color: 'text-secondary-600 bg-secondary-100' },
  user_create: { label: 'إنشاء مستخدم', icon: UserPlus, color: 'text-success-600 bg-success-100' },
  user_update: { label: 'تعديل مستخدم', icon: UserCheck, color: 'text-warning-600 bg-warning-100' },
  user_delete: { label: 'حذف مستخدم', icon: UserX, color: 'text-error-600 bg-error-100' },
  user_transfer: { label: 'نقل مستخدم', icon: User, color: 'text-info-600 bg-info-100' },
  user_disable: { label: 'تعطيل مستخدم', icon: UserX, color: 'text-error-600 bg-error-100' },
  user_enable: { label: 'تفعيل مستخدم', icon: UserCheck, color: 'text-success-600 bg-success-100' },
  customer_create: { label: 'إنشاء عميل', icon: UserPlus, color: 'text-success-600 bg-success-100' },
  customer_update: { label: 'تعديل عميل', icon: UserCheck, color: 'text-warning-600 bg-warning-100' },
  customer_delete: { label: 'حذف عميل', icon: UserX, color: 'text-error-600 bg-error-100' },
  policy_create: { label: 'إصدار وثيقة', icon: FilePlus, color: 'text-success-600 bg-success-100' },
  policy_update: { label: 'تعديل وثيقة', icon: FileText, color: 'text-warning-600 bg-warning-100' },
  policy_suspend: { label: 'إيقاف وثيقة', icon: Pause, color: 'text-warning-600 bg-warning-100' },
  policy_reactivate: { label: 'إعادة تفعيل وثيقة', icon: Play, color: 'text-success-600 bg-success-100' },
  policy_cancel: { label: 'إلغاء وثيقة', icon: XCircle, color: 'text-error-600 bg-error-100' },
  payment_create: { label: 'تسجيل سداد', icon: DollarSign, color: 'text-success-600 bg-success-100' },
  payment_cancel: { label: 'إلغاء سداد', icon: XCircle, color: 'text-error-600 bg-error-100' },
  month_close: { label: 'تقفيل شهر', icon: Lock, color: 'text-primary-600 bg-primary-100' },
  month_open: { label: 'فتح شهر', icon: Unlock, color: 'text-warning-600 bg-warning-100' },
  settings_update: { label: 'تعديل إعدادات', icon: Settings, color: 'text-warning-600 bg-warning-100' },
  role_update: { label: 'تعديل صلاحية', icon: Shield, color: 'text-warning-600 bg-warning-100' },
  target_update: { label: 'تعديل تارجت', icon: DollarSign, color: 'text-warning-600 bg-warning-100' },
  year2_payment_create: { label: 'تحصيل سنة ثانية', icon: DollarSign, color: 'text-success-600 bg-success-100' },
  year2_payment_cancel: { label: 'إلغاء تحصيل سنة ثانية', icon: XCircle, color: 'text-error-600 bg-error-100' }
};

export function ActivityLog() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [localSearch, setLocalSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionType | 'all'>('all');
  const pageSize = 20;

  useEffect(() => {
    if (user) {
      loadLogs();
    }
  }, [user, page, searchQuery, actionFilter]);

  // تأخير بسيط (debounce) لتقليل عدد طلبات البحث أثناء الكتابة
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        setSearchQuery(localSearch);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('activity_logs')
        .select('*, user:user_id(name, email)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (actionFilter !== 'all') {
        query = query.eq('action_type', actionFilter);
      }

      // ملحوظة: Supabase/PostgREST لا يدعم فلترة .or() على أعمدة من علاقة
      // متداخلة (user.name/email). سابقاً كان الكود يجيب صفحة واحدة بس
      // (range) ثم يفلترها محلياً بعد كده — وده غلط لأنه يفوّت أي نتيجة
      // في صفحات تانية وكمان عدد الصفحات (totalPages) بيفضل غير صحيح.
      // الحل: نجيب أولاً آي-ديهات المستخدمين المطابقين للاسم/الإيميل، ثم
      // نفلتر السجلات بيهم على مستوى الداتابيز قبل الترقيم.
      if (searchQuery.trim()) {
        const term = searchQuery.trim();
        const { data: matchedUsers } = await supabase
          .from('users')
          .select('id')
          .or(`name.ilike.%${term}%,email.ilike.%${term}%`);

        const userIds = (matchedUsers || []).map((u) => u.id);
        if (userIds.length === 0) {
          setLogs([]);
          setTotalPages(1);
          setLoading(false);
          return;
        }
        query = query.in('user_id', userIds);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      setLogs((data as ActivityLogEntry[]) || []);
      setTotalPages(Math.ceil((count || 0) / pageSize));
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionConfig = (action: ActionType) => {
    return ACTION_CONFIG[action] || { label: action, icon: History, color: 'bg-secondary-100' };
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">سجل العمليات</h2>
          <p className="text-sm text-secondary-500 mt-1">
            سجل جميع العمليات داخل النظام
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="بحث باسم المستخدم..."
                className="input-field pr-10"
              />
            </div>
          </div>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value as ActionType | 'all');
              setPage(1);
            }}
            className="input-field w-auto"
          >
            <option value="all">جميع العمليات</option>
            <optgroup label="المستخدمون">
              <option value="user_create">إنشاء مستخدم</option>
              <option value="user_update">تعديل مستخدم</option>
              <option value="user_disable">تعطيل مستخدم</option>
              <option value="user_enable">تفعيل مستخدم</option>
            </optgroup>
            <optgroup label="العملاء">
              <option value="customer_create">إنشاء عميل</option>
              <option value="customer_update">تعديل عميل</option>
              <option value="customer_delete">حذف عميل</option>
            </optgroup>
            <optgroup label="الوثائق">
              <option value="policy_create">إصدار وثيقة</option>
              <option value="policy_update">تعديل وثيقة</option>
              <option value="policy_suspend">إيقاف وثيقة</option>
              <option value="policy_cancel">إلغاء وثيقة</option>
            </optgroup>
            <optgroup label="السداد">
              <option value="payment_create">تسجيل سداد</option>
              <option value="payment_cancel">إلغاء سداد</option>
            </optgroup>
            <optgroup label="تحصيل السنة الثانية">
              <option value="year2_payment_create">تحصيل سنة ثانية</option>
              <option value="year2_payment_cancel">إلغاء تحصيل سنة ثانية</option>
            </optgroup>
            <optgroup label="التقفيل">
              <option value="month_close">تقفيل شهر</option>
              <option value="month_open">فتح شهر</option>
            </optgroup>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <History className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
            <p className="text-secondary-500">لا يوجد سجل عمليات</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {logs.map((log) => {
                const config = getActionConfig(log.action_type);
                const Icon = config.icon;
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-4 p-4 bg-secondary-50 rounded-lg"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${config.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-secondary-900">
                          {config.label}
                        </p>
                        <p className="text-xs text-secondary-400 flex-shrink-0">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                      <p className="text-sm text-secondary-600 mt-1">
                        بواسطة: {(log as any).user?.name || 'غير معروف'}
                      </p>
                      {log.entity_type && (
                        <p className="text-xs text-secondary-400 mt-1">
                          {log.entity_type}
                          {log.entity_id && ` - ${log.entity_id.slice(0, 8)}...`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-secondary-200">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-ghost disabled:opacity-50"
                >
                  <ChevronRight className="w-5 h-5" />
                  <span>السابق</span>
                </button>
                <span className="text-sm text-secondary-600">
                  صفحة {page} من {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn btn-ghost disabled:opacity-50"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
