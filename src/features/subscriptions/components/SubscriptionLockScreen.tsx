import { useState, useEffect, useCallback } from 'react';
import type { User } from '../../../lib/supabase';
import { ShieldOff, LogOut, Loader2, Clock, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import {
  fetchSubscriptionSettings, fetchDurations, fetchPrices,
  fetchPayableSubordinates, fetchLatestPaymentRequest
} from '../services/subscriptionService';
import type {
  SubscriptionSettings, SubscriptionDuration, SubscriptionPlanPrice, PayableSubordinate
} from '../types';
import { PaymentForm } from './PaymentForm';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(n);

// شاشة تغطي التطبيق بالكامل عند انتهاء الاشتراك (أو انتهاء الفترة التجريبية بدون
// دفع). تسمح بتسجيل الخروج فقط، ولا تسمح بالوصول لأي جزء آخر من التطبيق
// حتى يتم اعتماد اشتراك جديد.
export function SubscriptionLockScreen({
  user, status, periodEnd, onSignOut,
}: {
  user: User;
  status: string;
  periodEnd: string | null;
  onSignOut: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SubscriptionSettings | null>(null);
  const [durations, setDurations] = useState<SubscriptionDuration[]>([]);
  const [prices, setPrices] = useState<SubscriptionPlanPrice[]>([]);
  const [subordinates, setSubordinates] = useState<PayableSubordinate[]>([]);
  const [latestRequest, setLatestRequest] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d, p, subs, req] = await Promise.all([
        fetchSubscriptionSettings(),
        fetchDurations(),
        fetchPrices(),
        fetchPayableSubordinates(user.id),
        fetchLatestPaymentRequest(user.id)
      ]);
      setSettings(s);
      setDurations(d);
      setPrices(p);
      setSubordinates(subs);
      setLatestRequest(req);
    } catch (err) {
      console.error('Error loading lock screen data:', err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const ownPrice = prices.find(
    (p) => p.role === user.role && p.duration_id === (settings?.default_duration_id || durations[0]?.id)
  )?.price;

  const hasPendingRequest = latestRequest && ['submitted', 'ocr_verified', 'ocr_mismatch'].includes(latestRequest.status);

  const title = status === 'suspended' ? 'الحساب موقوف' : 'الاشتراك منتهي';

  return (
    <div className="fixed inset-0 z-[100] bg-secondary-900/95 backdrop-blur-sm overflow-y-auto" dir="rtl">
      <div className="min-h-full flex items-center justify-center p-4 py-10">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
          <div className="bg-error-600 px-6 py-6 text-center">
            <ShieldOff className="w-10 h-10 text-white mx-auto mb-2" />
            <h1 className="text-white text-xl font-bold">{title}</h1>
            {periodEnd && (
              <p className="text-error-50 text-sm mt-1">
                تاريخ الانتهاء: {format(new Date(periodEnd), 'dd/MM/yyyy')}
              </p>
            )}
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-secondary-400" />
              </div>
            ) : (
              <>
                <p className="text-sm text-secondary-500 text-center mb-6">
                  تم إيقاف استخدام النظام مؤقتاً. جدّد اشتراكك للمتابعة، ويمكنك تسجيل الخروج في أي وقت.
                </p>

                {hasPendingRequest ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-warning-50 text-warning-700 mb-6">
                    <Clock className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-sm">طلبك قيد المراجعة</p>
                      <p className="text-xs mt-0.5">تم إرسال طلب اشتراك بتاريخ {format(new Date(latestRequest.created_at), 'dd/MM/yyyy')}، بانتظار اعتماد الإدارة</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {ownPrice !== undefined && !showForm && (
                      <div className="flex items-center justify-between bg-secondary-50 rounded-xl p-4 mb-6">
                        <span className="text-sm text-secondary-500">قيمة التجديد (اشتراكك الشخصي)</span>
                        <span className="font-bold text-secondary-900">{fmt(ownPrice)}</span>
                      </div>
                    )}

                    {latestRequest?.status === 'rejected' && latestRequest.rejection_reason && !showForm && (
                      <div className="p-4 rounded-xl bg-error-50 text-error-700 text-sm mb-6">
                        تم رفض طلبك السابق: {latestRequest.rejection_reason}
                      </div>
                    )}

                    {!showForm ? (
                      <button
                        onClick={() => setShowForm(true)}
                        className="w-full bg-[#10B981] hover:bg-[#059669] text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 mb-3"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        تجديد الاشتراك الآن
                      </button>
                    ) : settings ? (
                      <div className="mb-6 text-right">
                        <PaymentForm
                          user={user}
                          settings={settings}
                          durations={durations}
                          prices={prices}
                          subordinates={subordinates}
                          onSubmitted={() => { setShowForm(false); load(); }}
                        />
                      </div>
                    ) : null}
                  </>
                )}

                <button
                  onClick={onSignOut}
                  className={clsx(
                    'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm',
                    'text-secondary-500 hover:bg-secondary-50 border border-secondary-200'
                  )}
                >
                  <LogOut className="w-4 h-4" />
                  تسجيل الخروج
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
