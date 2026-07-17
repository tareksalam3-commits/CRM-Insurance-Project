import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, XCircle, Trash2, User as UserIcon, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ROLE_LABELS, type UserRole } from '../../../lib/supabase';
import { getReceiptSignedUrl } from '../services/subscriptionService';
import {
  approvePayment, rejectPayment, deletePaymentRequest,
  type AdminPaymentRow, type UserLookupRow
} from '../services/adminService';
import type { SubscriptionDuration } from '../types';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(n);

const METHOD_LABELS: Record<string, string> = { instapay: 'Instapay', vodafone_cash: 'Vodafone Cash' };

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  submitted:    { label: 'قيد المراجعة', bg: 'bg-amber-50',   text: 'text-amber-700' },
  ocr_verified: { label: 'قيد المراجعة', bg: 'bg-amber-50',   text: 'text-amber-700' },
  ocr_mismatch: { label: 'قيد المراجعة', bg: 'bg-amber-50',   text: 'text-amber-700' },
  approved:     { label: 'معتمد',        bg: 'bg-success-50', text: 'text-success-700' },
  rejected:     { label: 'مرفوض',        bg: 'bg-error-50',   text: 'text-error-700' }
};

export function PaymentReviewModal({
  payment, durations, usersLookup, onClose, onDone,
}: {
  payment: AdminPaymentRow;
  durations: SubscriptionDuration[];
  usersLookup: UserLookupRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReceiptSignedUrl(payment.receipt_url).then((url) => {
      setReceiptUrl(url);
      setLoadingReceipt(false);
    });
  }, [payment.receipt_url]);

  const durationLabel = durations.find((d) => d.id === payment.duration_id)?.label || '-';
  const includedUsers = (payment.included_user_ids || [])
    .map((id) => usersLookup.find((u) => u.id === id))
    .filter(Boolean) as UserLookupRow[];
  const statusMeta = STATUS_LABELS[payment.status] || STATUS_LABELS.submitted;
  const canAct = payment.status !== 'approved';

  const handleApprove = async () => {
    setBusy(true);
    setError(null);
    try {
      await approvePayment(payment.id);
      onDone();
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء الاعتماد');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError('اكتب سبب الرفض');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rejectPayment(payment.id, rejectReason.trim());
      onDone();
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء الرفض');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('هل أنت متأكد من حذف هذا الطلب نهائياً؟')) return;
    setBusy(true);
    setError(null);
    try {
      await deletePaymentRequest(payment.id);
      onDone();
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-secondary-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-secondary-900">مراجعة طلب اشتراك</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-secondary-100 flex items-center justify-center">
                <UserIcon className="w-4.5 h-4.5 text-secondary-500" />
              </div>
              <div>
                <p className="font-semibold text-secondary-900 text-sm">{payment.payer?.name || '-'}</p>
                <p className="text-xs text-secondary-500">{ROLE_LABELS[payment.payer?.role as UserRole] || payment.payer?.role}</p>
              </div>
            </div>
            <span className={clsx('badge', statusMeta.bg, statusMeta.text)}>{statusMeta.label}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[11px] text-secondary-400">مدة الاشتراك</p>
              <p className="font-semibold text-secondary-800">{durationLabel}</p>
            </div>
            <div>
              <p className="text-[11px] text-secondary-400">وسيلة الدفع</p>
              <p className="font-semibold text-secondary-800">{METHOD_LABELS[payment.payment_method] || payment.payment_method}</p>
            </div>
            <div>
              <p className="text-[11px] text-secondary-400">المبلغ</p>
              <p className="font-bold text-success-700">{fmt(payment.amount_final)}</p>
            </div>
            <div>
              <p className="text-[11px] text-secondary-400">تاريخ الطلب</p>
              <p className="font-semibold text-secondary-800">{format(new Date(payment.created_at), 'dd/MM/yyyy HH:mm')}</p>
            </div>
            {payment.reference_number && (
              <div className="col-span-2">
                <p className="text-[11px] text-secondary-400">الرقم المرجعي</p>
                <p className="font-semibold text-secondary-800" dir="ltr">{payment.reference_number}</p>
              </div>
            )}
          </div>

          {includedUsers.length > 0 && (
            <div>
              <p className="text-[11px] text-secondary-400 mb-1.5">مشمول معه في نفس الطلب</p>
              <div className="flex flex-wrap gap-1.5">
                {includedUsers.map((u) => (
                  <span key={u.id} className="badge badge-secondary">{u.name}</span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] text-secondary-400 mb-1.5">صورة الإيصال</p>
            {loadingReceipt ? (
              <div className="h-48 rounded-xl bg-secondary-100 animate-pulse" />
            ) : receiptUrl ? (
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="block relative group">
                <img src={receiptUrl} alt="الإيصال" className="w-full max-h-72 object-contain rounded-xl border border-secondary-200 bg-secondary-50" />
                <div className="absolute top-2 left-2 bg-white/90 rounded-lg p-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-secondary-500" />
                </div>
              </a>
            ) : (
              <p className="text-sm text-secondary-400">تعذر تحميل الإيصال</p>
            )}
          </div>

          {payment.status === 'rejected' && payment.rejection_reason && (
            <div className="p-3 rounded-xl bg-error-50 text-error-700 text-sm">
              سبب الرفض السابق: {payment.rejection_reason}
            </div>
          )}

          {showRejectForm && (
            <div>
              <label className="text-sm font-semibold text-secondary-700 block mb-2">سبب الرفض</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="input-field"
                placeholder="مثال: المبلغ الموضح في الإيصال غير مطابق"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-error-50 text-error-700 text-sm">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {canAct && (
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              {!showRejectForm ? (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={busy}
                    className="btn btn-primary flex-1 justify-center"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    اعتماد
                  </button>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    disabled={busy}
                    className="btn btn-secondary flex-1 justify-center"
                  >
                    <XCircle className="w-4 h-4" />
                    رفض
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleReject}
                    disabled={busy}
                    className="btn bg-error-600 text-white hover:bg-error-700 flex-1 justify-center"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    تأكيد الرفض
                  </button>
                  <button
                    onClick={() => setShowRejectForm(false)}
                    disabled={busy}
                    className="btn btn-ghost flex-1 justify-center"
                  >
                    إلغاء
                  </button>
                </>
              )}
            </div>
          )}

          <button
            onClick={handleDelete}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 text-error-500 text-sm py-2 hover:underline"
          >
            <Trash2 className="w-4 h-4" />
            حذف الطلب نهائياً
          </button>
        </div>
      </div>
    </div>
  );
}
