import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { ROLE_LABELS, type UserRole } from '../../../lib/supabase';
import {
  Wallet, Search, Lock, Users, FileClock, Settings2, Settings, Tags
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import {
  fetchAllSubscriptions, fetchAllPaymentRequests, fetchUsersLookup, fetchAllPlanPrices,
  type AdminSubscriptionRow, type AdminPaymentRow, type UserLookupRow, type AdminPlanPriceRow
} from '../services/adminService';
import { fetchDurations, fetchSubscriptionSettings } from '../services/subscriptionService';
import type { SubscriptionDuration, SubscriptionStatus, SubscriptionSettings } from '../types';
import { PaymentReviewModal } from '../components/PaymentReviewModal';
import { ManualSubscriptionModal } from '../components/ManualSubscriptionModal';
import { SubscriptionSettingsModal } from '../components/SubscriptionSettingsModal';
import { SubscriptionPricesModal } from '../components/SubscriptionPricesModal';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(n);

const STATUS_META: Record<SubscriptionStatus, { label: string; bg: string; text: string }> = {
  trial:           { label: 'تجربة',        bg: 'bg-info-50',    text: 'text-info-700' },
  active:          { label: 'نشط',          bg: 'bg-success-50', text: 'text-success-700' },
  expired:         { label: 'منتهي',        bg: 'bg-error-50',   text: 'text-error-700' },
  pending_payment: { label: 'بانتظار الدفع', bg: 'bg-warning-50', text: 'text-warning-700' },
  suspended:       { label: 'موقوف',        bg: 'bg-secondary-100', text: 'text-secondary-600' }
};

const REQUEST_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  submitted:    { label: 'قيد المراجعة', bg: 'bg-warning-50', text: 'text-warning-700' },
  ocr_verified: { label: 'قيد المراجعة', bg: 'bg-warning-50', text: 'text-warning-700' },
  ocr_mismatch: { label: 'قيد المراجعة', bg: 'bg-warning-50', text: 'text-warning-700' },
  approved:     { label: 'معتمد',        bg: 'bg-success-50', text: 'text-success-700' },
  rejected:     { label: 'مرفوض',        bg: 'bg-error-50',   text: 'text-error-700' }
};

type ViewMode = 'subscriptions' | 'requests';
type SubFilter = 'all' | SubscriptionStatus;
type ReqFilter = 'pending' | 'approved' | 'rejected' | 'all';

export function SubscriptionsAdminPage() {
  const { user } = useAuth();
  const canView = user?.role === 'super_admin';

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('requests');
  const [subs, setSubs] = useState<AdminSubscriptionRow[]>([]);
  const [requests, setRequests] = useState<AdminPaymentRow[]>([]);
  const [durations, setDurations] = useState<SubscriptionDuration[]>([]);
  const [usersLookup, setUsersLookup] = useState<UserLookupRow[]>([]);
  const [settings, setSettings] = useState<SubscriptionSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [prices, setPrices] = useState<AdminPlanPriceRow[]>([]);
  const [showPrices, setShowPrices] = useState(false);

  const [subFilter, setSubFilter] = useState<SubFilter>('all');
  const [reqFilter, setReqFilter] = useState<ReqFilter>('pending');
  const [search, setSearch] = useState('');

  const [reviewingPayment, setReviewingPayment] = useState<AdminPaymentRow | null>(null);
  const [managingSub, setManagingSub] = useState<AdminSubscriptionRow | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, d, u, st, pr] = await Promise.all([
        fetchAllSubscriptions(),
        fetchAllPaymentRequests(),
        fetchDurations(),
        fetchUsersLookup(),
        fetchSubscriptionSettings(),
        fetchAllPlanPrices()
      ]);
      setSubs(s);
      setRequests(r);
      setDurations(d);
      setUsersLookup(u);
      setSettings(st);
      setPrices(pr);
    } catch (err) {
      console.error('Error loading subscriptions admin data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) loadAll(); }, [canView, loadAll]);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    subs.forEach((s) => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });
    const pendingRequests = requests.filter((r) => ['submitted', 'ocr_verified', 'ocr_mismatch'].includes(r.status)).length;
    return { total: subs.length, byStatus, pendingRequests };
  }, [subs, requests]);

  const filteredSubs = useMemo(() => {
    let list = subs;
    if (subFilter !== 'all') list = list.filter((s) => s.status === subFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.users?.name?.toLowerCase().includes(q));
    return list;
  }, [subs, subFilter, search]);

  const filteredRequests = useMemo(() => {
    let list = requests;
    if (reqFilter === 'pending') list = list.filter((r) => ['submitted', 'ocr_verified', 'ocr_mismatch'].includes(r.status));
    else if (reqFilter !== 'all') list = list.filter((r) => r.status === reqFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.payer?.name?.toLowerCase().includes(q));
    return list;
  }, [requests, reqFilter, search]);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-secondary-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary-600" />
            الاشتراكات
          </h2>
          <p className="text-sm text-secondary-500 mt-1">مراجعة طلبات الدفع والتحكم في اشتراكات المستخدمين</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowPrices(true)}
            className="btn btn-secondary flex-1 sm:flex-initial justify-center"
          >
            <Tags className="w-4 h-4" />
            <span>أسعار الاشتراكات</span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="btn btn-secondary flex-1 sm:flex-initial justify-center"
          >
            <Settings className="w-4 h-4" />
            <span>إعدادات الدفع</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : (
        <>
          {/* إحصائيات سريعة */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="kpi-card">
              <p className="text-xs text-secondary-500">إجمالي الاشتراكات</p>
              <p className="text-xl font-bold text-secondary-900 mt-1">{stats.total}</p>
            </div>
            <div className="kpi-card">
              <p className="text-xs text-secondary-500">نشطة</p>
              <p className="text-xl font-bold text-success-700 mt-1">{stats.byStatus.active || 0}</p>
            </div>
            <div className="kpi-card">
              <p className="text-xs text-secondary-500">تجريبية</p>
              <p className="text-xl font-bold text-info-700 mt-1">{stats.byStatus.trial || 0}</p>
            </div>
            <div className="kpi-card">
              <p className="text-xs text-secondary-500">منتهية / موقوفة</p>
              <p className="text-xl font-bold text-error-700 mt-1">{(stats.byStatus.expired || 0) + (stats.byStatus.suspended || 0)}</p>
            </div>
            <div className="kpi-card">
              <p className="text-xs text-secondary-500">طلبات قيد المراجعة</p>
              <p className="text-xl font-bold text-warning-700 mt-1">{stats.pendingRequests}</p>
            </div>
          </div>

          {/* تبديل العرض */}
          <div className="flex gap-2 border-b border-secondary-200">
            <button
              onClick={() => { setView('requests'); setSearch(''); }}
              className={clsx(
                'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5',
                view === 'requests' ? 'border-primary-600 text-primary-700' : 'border-transparent text-secondary-500'
              )}
            >
              <FileClock className="w-4 h-4" />
              طلبات الدفع
              {stats.pendingRequests > 0 && <span className="badge badge-warning">{stats.pendingRequests}</span>}
            </button>
            <button
              onClick={() => { setView('subscriptions'); setSearch(''); }}
              className={clsx(
                'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5',
                view === 'subscriptions' ? 'border-primary-600 text-primary-700' : 'border-transparent text-secondary-500'
              )}
            >
              <Users className="w-4 h-4" />
              اشتراكات المستخدمين
            </button>
          </div>

          {/* أدوات البحث والفلترة */}
          <div className="card">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث بالاسم..."
                  className="input-field pr-10"
                />
              </div>
              {view === 'requests' ? (
                <select value={reqFilter} onChange={(e) => setReqFilter(e.target.value as ReqFilter)} className="input-field w-auto">
                  <option value="pending">قيد المراجعة</option>
                  <option value="approved">معتمدة</option>
                  <option value="rejected">مرفوضة</option>
                  <option value="all">الكل</option>
                </select>
              ) : (
                <select value={subFilter} onChange={(e) => setSubFilter(e.target.value as SubFilter)} className="input-field w-auto">
                  <option value="all">الكل</option>
                  <option value="trial">تجريبي</option>
                  <option value="active">نشط</option>
                  <option value="expired">منتهي</option>
                  <option value="pending_payment">بانتظار الدفع</option>
                  <option value="suspended">موقوف</option>
                </select>
              )}
            </div>
          </div>

          {/* محتوى طلبات الدفع */}
          {view === 'requests' && (
            <div className="space-y-3">
              {filteredRequests.length === 0 ? (
                <div className="card text-center py-12 text-secondary-400">لا توجد طلبات مطابقة</div>
              ) : (
                filteredRequests.map((r) => {
                  const meta = REQUEST_STATUS_META[r.status] || REQUEST_STATUS_META.submitted;
                  const durationLabel = durations.find((d) => d.id === r.duration_id)?.label;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setReviewingPayment(r)}
                      className="card w-full text-right hover:shadow-md transition-shadow flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-secondary-900 truncate">{r.payer?.name || '-'}</p>
                          <span className={clsx('badge', meta.bg, meta.text)}>{meta.label}</span>
                        </div>
                        <p className="text-xs text-secondary-500">
                          {ROLE_LABELS[r.payer?.role as UserRole] || r.payer?.role} · {durationLabel} ·{' '}
                          {format(new Date(r.created_at), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <span className="font-bold text-success-700 flex-shrink-0">{fmt(r.amount_final)}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* محتوى اشتراكات المستخدمين */}
          {view === 'subscriptions' && (
            <div className="space-y-3">
              {filteredSubs.length === 0 ? (
                <div className="card text-center py-12 text-secondary-400">لا توجد نتائج مطابقة</div>
              ) : (
                filteredSubs.map((s) => {
                  const meta = STATUS_META[s.status];
                  const periodEnd = s.status === 'trial' ? s.trial_end_date : s.current_period_end;
                  return (
                    <div key={s.id} className="card flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-secondary-900 truncate">{s.users?.name || '-'}</p>
                          <span className={clsx('badge', meta.bg, meta.text)}>{meta.label}</span>
                          {!s.users?.is_active && <span className="badge badge-error text-[10px]">معطّل</span>}
                        </div>
                        <p className="text-xs text-secondary-500">
                          {ROLE_LABELS[s.users?.role as UserRole] || s.users?.role}
                          {periodEnd && ` · حتى ${format(new Date(periodEnd), 'dd/MM/yyyy')}`}
                        </p>
                      </div>
                      <button
                        onClick={() => setManagingSub(s)}
                        className="btn btn-ghost text-secondary-600 flex-shrink-0"
                      >
                        <Settings2 className="w-4 h-4" />
                        <span className="hidden sm:inline">تحكم</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      {reviewingPayment && (
        <PaymentReviewModal
          payment={reviewingPayment}
          durations={durations}
          usersLookup={usersLookup}
          onClose={() => setReviewingPayment(null)}
          onDone={() => { setReviewingPayment(null); loadAll(); }}
        />
      )}

      {managingSub && (
        <ManualSubscriptionModal
          row={managingSub}
          durations={durations}
          onClose={() => setManagingSub(null)}
          onDone={() => { setManagingSub(null); loadAll(); }}
        />
      )}

      {showSettings && settings && (
        <SubscriptionSettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onDone={() => { setShowSettings(false); loadAll(); }}
        />
      )}

      {showPrices && (
        <SubscriptionPricesModal
          prices={prices}
          durations={durations}
          onClose={() => setShowPrices(false)}
          onDone={() => { setShowPrices(false); loadAll(); }}
        />
      )}
    </div>
  );
}
