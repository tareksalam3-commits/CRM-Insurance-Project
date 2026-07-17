import { useState, useMemo, useRef } from 'react';
import { ROLE_LABELS, type User, type UserRole } from '../../../lib/supabase';
import {
  Loader2, CheckCircle2, XCircle, Copy, Check, Camera, Image as ImageIcon, Users
} from 'lucide-react';
import clsx from 'clsx';
import type {
  SubscriptionDuration, SubscriptionPlanPrice, SubscriptionSettings,
  PayableSubordinate, SubscriptionPaymentMethodKey
} from '../types';
import { uploadReceipt, submitPaymentRequest } from '../services/subscriptionService';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(n);

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
      <div>
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className="font-bold text-slate-800 text-sm" dir="ltr">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-[#10B981] hover:border-[#10B981]/40"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function PaymentForm({
  user, settings, durations, prices, subordinates, onSubmitted,
}: {
  user: User;
  settings: SubscriptionSettings;
  durations: SubscriptionDuration[];
  prices: SubscriptionPlanPrice[];
  subordinates: PayableSubordinate[];
  onSubmitted: () => void;
}) {
  const [durationId, setDurationId] = useState<string>(
    settings.default_duration_id || durations[0]?.id || ''
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<SubscriptionPaymentMethodKey | null>(
    settings.instapay_enabled ? 'instapay' : settings.vodafone_cash_enabled ? 'vodafone_cash' : null
  );
  const [referenceNumber, setReferenceNumber] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getPrice = (role: UserRole, durId: string) =>
    prices.find((p) => p.role === role && p.duration_id === durId)?.price || 0;

  const ownPrice = useMemo(() => getPrice(user.role, durationId), [prices, durationId, user.role]);

  const subordinatesByRole = useMemo(() => {
    const groups: Record<string, PayableSubordinate[]> = {};
    subordinates.forEach((s) => {
      if (!groups[s.role]) groups[s.role] = [];
      groups[s.role].push(s);
    });
    return groups;
  }, [subordinates]);

  const total = useMemo(() => {
    let sum = ownPrice;
    selectedIds.forEach((id) => {
      const sub = subordinates.find((s) => s.user_id === id);
      if (sub) sum += getPrice(sub.role, durationId);
    });
    return sum;
  }, [ownPrice, selectedIds, subordinates, durationId, prices]);

  const toggleSubordinate = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'يرجى اختيار ملف صورة صالح' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'حجم الصورة يجب أن يكون أقل من 8 ميجابايت' });
      return;
    }
    setMessage(null);
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    setMessage(null);

    if (!method) {
      setMessage({ type: 'error', text: 'اختر وسيلة الدفع' });
      return;
    }
    if (!durationId) {
      setMessage({ type: 'error', text: 'اختر مدة الاشتراك' });
      return;
    }
    if (!receiptFile) {
      setMessage({ type: 'error', text: 'ارفع صورة إيصال التحويل' });
      return;
    }
    if (!referenceNumber.trim()) {
      setMessage({ type: 'error', text: 'أدخل الرقم المرجعي لعملية التحويل' });
      return;
    }

    setSubmitting(true);
    try {
      const receiptPath = await uploadReceipt(user.id, receiptFile);

      await submitPaymentRequest({
        payerUserId: user.id,
        includedUserIds: Array.from(selectedIds),
        durationId,
        paymentMethod: method,
        amountOriginal: total,
        amountFinal: total,
        receiptPath,
        referenceNumber: referenceNumber.trim()
      });

      setMessage({ type: 'success', text: 'تم إرسال طلب الاشتراك بنجاح، بانتظار مراجعة الإدارة' });
      setReceiptFile(null);
      setReceiptPreview(null);
      setReferenceNumber('');
      onSubmitted();
    } catch (err: any) {
      console.error('Error submitting subscription payment:', err);
      setMessage({ type: 'error', text: err?.message || 'حدث خطأ أثناء إرسال الطلب' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* مدة الاشتراك */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">مدة الاشتراك</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {durations.map((d) => {
            const price = getPrice(user.role, d.id);
            const isSelected = durationId === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDurationId(d.id)}
                className={clsx(
                  'text-right p-4 rounded-xl border-2 transition-all',
                  isSelected ? 'border-[#10B981] bg-[#E6F7F1]' : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <p className="font-bold text-slate-800">{d.label}</p>
                <p className="text-xs text-slate-500 mt-1">اشتراكك الشخصي: {fmt(price)}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* التابعون القابل دفع اشتراكهم */}
      {subordinates.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-slate-400" />
            تابعوك — اختر من تحب دفع اشتراكه معك
          </p>
          <p className="text-xs text-slate-400 mb-3">اختيار أي رئيس مجموعة يفعّل جميع وكلائه تلقائياً بدون رسوم إضافية</p>
          <div className="space-y-4">
            {Object.entries(subordinatesByRole).map(([role, list]) => (
              <div key={role}>
                <p className="text-xs font-semibold text-slate-400 mb-2">{ROLE_LABELS[role as UserRole]}</p>
                <div className="space-y-2">
                  {list.map((s) => {
                    const price = getPrice(s.role, durationId);
                    const checked = selectedIds.has(s.user_id);
                    return (
                      <label
                        key={s.user_id}
                        className={clsx(
                          'flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                          checked ? 'border-[#10B981] bg-[#E6F7F1]/50' : 'border-slate-200 hover:border-slate-300'
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSubordinate(s.user_id)}
                            className="w-4 h-4 accent-[#10B981] flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                            {s.subscription_status === 'active' && (
                              <span className="text-[10px] text-emerald-600">مشترك حالياً</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-bold text-slate-600 flex-shrink-0">{fmt(price)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* الإجمالي */}
      <div className="bg-slate-800 rounded-xl px-5 py-4 flex items-center justify-between">
        <span className="text-slate-300 text-sm">الإجمالي المطلوب</span>
        <span className="text-white text-xl font-bold">{fmt(total)}</span>
      </div>

      {/* وسيلة الدفع */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">وسيلة الدفع</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {settings.instapay_enabled && (
            <button
              type="button"
              onClick={() => setMethod('instapay')}
              className={clsx(
                'p-4 rounded-xl border-2 font-bold text-sm transition-all',
                method === 'instapay' ? 'border-[#10B981] bg-[#E6F7F1] text-[#059669]' : 'border-slate-200 text-slate-600'
              )}
            >
              Instapay
            </button>
          )}
          {settings.vodafone_cash_enabled && (
            <button
              type="button"
              onClick={() => setMethod('vodafone_cash')}
              className={clsx(
                'p-4 rounded-xl border-2 font-bold text-sm transition-all',
                method === 'vodafone_cash' ? 'border-[#10B981] bg-[#E6F7F1] text-[#059669]' : 'border-slate-200 text-slate-600'
              )}
            >
              Vodafone Cash
            </button>
          )}
        </div>

        {method === 'instapay' && (
          <div className="space-y-2">
            <CopyField label="اسم المستفيد" value={settings.instapay_name || '-'} />
            <CopyField label="رقم التحويل" value={settings.instapay_number || '-'} />
          </div>
        )}
        {method === 'vodafone_cash' && (
          <div className="space-y-2">
            <CopyField label="اسم المستفيد" value={settings.vodafone_cash_name || '-'} />
            <CopyField label="رقم المحفظة" value={settings.vodafone_cash_number || '-'} />
          </div>
        )}
      </div>

      {/* رفع الإيصال */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">إيصال التحويل</p>
        {receiptPreview ? (
          <div className="relative w-40">
            <img src={receiptPreview} alt="الإيصال" className="w-40 h-40 object-cover rounded-xl border border-slate-200" />
            <button
              type="button"
              onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
              className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-white shadow border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-500"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <label className="flex-1 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-6 cursor-pointer hover:border-[#10B981]/50 hover:bg-[#E6F7F1]/30 transition-all">
              <Camera className="w-6 h-6 text-slate-400" />
              <span className="text-xs text-slate-500">التقاط صورة</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
            </label>
            <label className="flex-1 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-6 cursor-pointer hover:border-[#10B981]/50 hover:bg-[#E6F7F1]/30 transition-all">
              <ImageIcon className="w-6 h-6 text-slate-400" />
              <span className="text-xs text-slate-500">اختيار من المعرض</span>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </label>
          </div>
        )}
      </div>

      {/* الرقم المرجعي */}
      <div>
        <label className="text-sm font-semibold text-slate-700 block mb-2">الرقم المرجعي للتحويل</label>
        <input
          type="text"
          value={referenceNumber}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="اكتب الرقم المرجعي كما ظهر في تفاصيل التحويل"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all outline-none"
        />
      </div>

      {message && (
        <div className={clsx(
          'p-4 rounded-xl text-sm flex items-center gap-3',
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
        )}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {message.text}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full sm:w-auto bg-[#10B981] hover:bg-[#059669] text-white px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#10B981]/20 disabled:opacity-70"
      >
        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
        إرسال طلب الاشتراك
      </button>
    </div>
  );
}
