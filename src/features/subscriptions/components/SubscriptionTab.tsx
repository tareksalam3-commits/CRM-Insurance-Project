import { useState, useEffect, useCallback } from 'react';
import type { User } from '../../../lib/supabase';
import {
  CreditCard, Clock, CalendarCheck, CalendarX, RefreshCcw, Loader2,
  ShieldCheck, ShieldAlert, ShieldOff, Hourglass
} from 'lucide-react';
import clsx from 'clsx';
import { format, differenceInCalendarDays } from 'date-fns';
import {
  fetchSubscriptionSettings, fetchDurations, fetchPrices,
  fetchMySubscription, fetchPayableSubordinates, fetchLatestPaymentRequest
} from '../services/subscriptionService';
import type {
  SubscriptionSettings, SubscriptionDuration, SubscriptionPlanPrice,
  MySubscription, PayableSubordinate
} from '../types';
import { PaymentForm } from './PaymentForm';

const STATUS_META: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  trial:            { label: 'فترة تجريبية مجانية', bg: 'bg-blue-50',    text: 'text-blue-700',    icon: Hourglass },
  active:           { label: 'اشتراك نشط',          bg: 'bg-emerald-50', text: 'text-emerald-700', icon: ShieldCheck },
  expired:          { label: 'اشتراك منتهي',        bg: 'bg-red-50',     text: 'text-red-700',     icon: ShieldOff },
  pending_payment:  { label: 'بانتظار الاشتراك',     bg: 'bg-amber-50',   text: 'text-amber-700',   icon: ShieldAlert },
  suspended:        { label: 'اشتراك موقوف',         bg: 'bg-slate-100',  text: 'text-slate-600',   icon: ShieldOff }
};

const REQUEST_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  submitted:     { label: 'قيد المراجعة', bg: 'bg-amber-50', text: 'text-amber-700' },
  ocr_verified:  { label: 'قيد المراجعة', bg: 'bg-amber-50', text: 'text-amber-700' },
  ocr_mismatch:  { label: 'قيد المراجعة', bg: 'bg-amber-50', text: 'text-amber-700' },
  approved:      { label: 'تم الاعتماد', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  rejected:      { label: 'مرفوض',       bg: 'bg-red-50',     text: 'text-red-700' }
};

export function SubscriptionTab({ user }: { user: User }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SubscriptionSettings | null>(null);
  const [durations, setDurations] = useState<SubscriptionDuration[]>([]);
  const [prices, setPrices] = useState<SubscriptionPlanPrice[]>([]);
  const [mySub, setMySub] = useState<MySubscription | null>(null);
  const [subordinates, setSubordinates] = useState<PayableSubordinate[]>([]);
  const [latestRequest, setLatestRequest] = useState<any>(null);
  const [showPaymentFlow, setShowPaymentFlow] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d, p, sub, subs, req] = await Promise.all([
        fetchSubscriptionSettings(),
        fetchDurations(),
        fetchPrices(),
        fetchMySubscription(user.id),
        fetchPayableSubordinates(user.id),
        fetchLatestPaymentRequest(user.id)
      ]);
      setSettings(s);
      setDurations(d);
      setPrices(p);
      setMySub(sub);
      setSubordinates(subs);
      setLatestRequest(req);
    } catch (err) {
      console.error('Error loading subscription data:', err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-[#10B981]" />
      </div>
    );
  }

  if (!mySub || !settings) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center text-slate-400">
        تعذر تحميل بيانات الاشتراك
      </div>
    );
  }

  const meta = STATUS_META[mySub.status] || STATUS_META.expired;
  const StatusIcon = meta.icon;
  const periodEnd = mySub.status === 'trial' ? mySub.trial_end_date : mySub.current_period_end;
  const remainingDays = periodEnd ? differenceInCalendarDays(new Date(periodEnd), new Date()) : null;
  const durationLabel = durations.find((d) => d.id === mySub.duration_id)?.label;

  const hasPendingRequest = latestRequest && ['submitted', 'ocr_verified', 'ocr_mismatch'].includes(latestRequest.status);
  const needsAction = mySub.status === 'expired' || mySub.status === 'pending_payment';

  return (
    <div className="space-y-6">
      {/* بطاقة حالة الاشتراك */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-[#E6F7F1] rounded-lg text-[#10B981]">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">الاشتراك</h3>
            <p className="text-sm text-slate-400">حالة اشتراكك الحالية وتفاصيل التجديد</p>
          </div>
        </div>

        <div className={clsx('flex items-center gap-3 p-4 rounded-xl mb-6', meta.bg)}>
          <StatusIcon className={clsx('w-6 h-6 flex-shrink-0', meta.text)} />
          <div>
            <p className={clsx('font-bold', meta.text)}>{meta.label}</p>
            {durationLabel && mySub.status === 'active' && (
              <p className="text-xs text-slate-500 mt-0.5">مدة الاشتراك: {durationLabel}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {periodEnd && (
            <>
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-slate-400">تاريخ الانتهاء</p>
                  <p className="text-sm font-bold text-slate-800">{format(new Date(periodEnd), 'dd/MM/yyyy')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-slate-400">الأيام المتبقية</p>
                  <p className={clsx('text-sm font-bold', remainingDays !== null && remainingDays <= 7 ? 'text-red-600' : 'text-slate-800')}>
                    {remainingDays !== null ? Math.max(0, remainingDays) : '-'} يوم
                  </p>
                </div>
              </div>
            </>
          )}
          {!periodEnd && (
            <div className="flex items-center gap-2 col-span-2">
              <CalendarX className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <p className="text-sm text-slate-500">لا يوجد اشتراك ساري حالياً</p>
            </div>
          )}
        </div>

        {hasPendingRequest && (
          <div className={clsx('mt-6 p-4 rounded-xl flex items-center justify-between', REQUEST_STATUS_META[latestRequest.status].bg)}>
            <span className={clsx('text-sm font-semibold', REQUEST_STATUS_META[latestRequest.status].text)}>
              طلبك الأخير: {REQUEST_STATUS_META[latestRequest.status].label}
            </span>
            <span className="text-xs text-slate-400">{format(new Date(latestRequest.created_at), 'dd/MM/yyyy')}</span>
          </div>
        )}

        {latestRequest?.status === 'rejected' && latestRequest.rejection_reason && (
          <div className="mt-3 p-4 rounded-xl bg-red-50 text-red-700 text-sm">
            سبب الرفض: {latestRequest.rejection_reason}
          </div>
        )}

        {!hasPendingRequest && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowPaymentFlow((v) => !v)}
              className={clsx(
                'px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all',
                needsAction
                  ? 'bg-[#10B981] hover:bg-[#059669] text-white shadow-lg shadow-[#10B981]/20'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-[#10B981]/40 hover:text-[#10B981]'
              )}
            >
              <RefreshCcw className="w-5 h-5" />
              {showPaymentFlow ? 'إخفاء نموذج الدفع' : 'تجديد الاشتراك'}
            </button>
          </div>
        )}
      </div>

      {/* نموذج الدفع */}
      {showPaymentFlow && !hasPendingRequest && settings.subscriptions_enabled && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <h4 className="font-bold text-slate-800 mb-6">تجديد / دفع الاشتراك</h4>
          <PaymentForm
            user={user}
            settings={settings}
            durations={durations}
            prices={prices}
            subordinates={subordinates}
            onSubmitted={() => { setShowPaymentFlow(false); loadAll(); }}
          />
        </div>
      )}

      {!settings.subscriptions_enabled && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center text-sm text-slate-400">
          نظام الاشتراكات متوقف مؤقتاً من الإدارة
        </div>
      )}
    </div>
  );
}
