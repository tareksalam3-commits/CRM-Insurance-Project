import { useEffect, useState } from 'react';
import {
  Network,
  RefreshCw,
  Loader2,
  Star,
  EyeOff,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { OpenRouterModelRow, OpenRouterStateRow } from '../pages/AISettings/types';
import {
  fetchOpenRouterModels,
  fetchOpenRouterState,
  toggleOpenRouterModelExcluded,
  setOpenRouterPreferredModel,
  refreshOpenRouterModels,
  retestOpenRouterModels,
} from '../pages/AISettings/services/aiSettingsService';

function timeAgo(iso: string | null): string {
  if (!iso) return 'لم يحدث بعد';
  try {
    return format(new Date(iso), 'yyyy/MM/dd HH:mm');
  } catch {
    return iso;
  }
}

export function OpenRouterModelsPanel() {
  const [models, setModels] = useState<OpenRouterModelRow[]>([]);
  const [state, setState] = useState<OpenRouterStateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retesting, setRetesting] = useState(false);
  const [busyModelId, setBusyModelId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [modelsData, stateData] = await Promise.all([fetchOpenRouterModels(), fetchOpenRouterState()]);
      setModels(modelsData);
      setState(stateData);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'تعذّر تحميل بيانات نماذج OpenRouter' });
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      const result = await refreshOpenRouterModels();
      setMessage({ type: 'success', text: `تم تحديث قائمة النماذج (${result.count} نموذج مجاني)` });
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'فشل تحديث قائمة النماذج' });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRetestAll() {
    setRetesting(true);
    setMessage(null);
    try {
      const result = await retestOpenRouterModels();
      setMessage({
        type: 'success',
        text: `تم اختبار ${result.tested} نموذج — نجح ${result.succeeded}، فشل ${result.failed}`,
      });
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'فشل إعادة اختبار النماذج' });
    } finally {
      setRetesting(false);
    }
  }

  async function handleToggleExclude(model: OpenRouterModelRow) {
    setBusyModelId(model.id);
    try {
      await toggleOpenRouterModelExcluded(model.id, !model.is_excluded);
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'حدث خطأ غير متوقع' });
    } finally {
      setBusyModelId(null);
    }
  }

  async function handleTogglePreferred(model: OpenRouterModelRow) {
    setBusyModelId(model.id);
    try {
      await setOpenRouterPreferredModel(model.id, !model.is_preferred);
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'حدث خطأ غير متوقع' });
    } finally {
      setBusyModelId(null);
    }
  }

  const activeCount = models.filter((m) => !m.is_excluded).length;

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
            <Network className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-secondary-900">نماذج OpenRouter المجانية (تلقائي)</h3>
            <p className="text-xs text-secondary-500 mt-0.5">
              النظام يختار ويبدّل تلقائياً بين كل النماذج المجانية المتاحة — بدون ربط بموديل ثابت
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={retesting || loading}
            onClick={handleRetestAll}
            className="btn btn-sm btn-secondary"
          >
            {retesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            إعادة اختبار الكل
          </button>
          <button
            type="button"
            disabled={refreshing || loading}
            onClick={handleRefresh}
            className="btn btn-sm btn-primary"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            تحديث النماذج
          </button>
        </div>
      </div>

      {message && (
        <div
          className={clsx(
            'flex items-start gap-2 p-3 rounded-lg text-sm',
            message.type === 'success' ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700',
          )}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* ملخص الحالة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-secondary-50 p-3">
          <p className="text-xs text-secondary-500">عدد النماذج المتاحة</p>
          <p className="text-lg font-bold text-secondary-900 mt-1">{activeCount}</p>
        </div>
        <div className="rounded-lg bg-secondary-50 p-3">
          <p className="text-xs text-secondary-500">النموذج الحالي</p>
          <p className="text-xs font-semibold text-secondary-900 mt-1 truncate" dir="ltr" title={state?.current_model ?? ''}>
            {state?.current_model ?? 'لم يُستخدم بعد'}
          </p>
        </div>
        <div className="rounded-lg bg-secondary-50 p-3">
          <p className="text-xs text-secondary-500">آخر تحديث للقائمة</p>
          <p className="text-xs font-semibold text-secondary-900 mt-1">{timeAgo(state?.last_models_refresh_at ?? null)}</p>
        </div>
        <div className="rounded-lg bg-secondary-50 p-3">
          <p className="text-xs text-secondary-500">حالة OpenRouter</p>
          <p
            className={clsx(
              'text-xs font-semibold mt-1',
              state?.status === 'ok' ? 'text-success-700' : state?.status === 'error' ? 'text-error-700' : 'text-secondary-500',
            )}
          >
            {state?.status === 'ok' ? 'يعمل بشكل طبيعي' : state?.status === 'error' ? (state?.last_error ?? 'خطأ') : 'غير معروف'}
          </p>
        </div>
      </div>

      {/* جدول النماذج */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : models.length === 0 ? (
        <p className="text-sm text-secondary-500 text-center py-6">
          لا توجد نماذج في الكاش بعد — اضغط "تحديث النماذج" لجلب القائمة من OpenRouter.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-right text-xs text-secondary-500 border-b border-secondary-100">
                <th className="py-2 px-2 font-medium">النموذج</th>
                <th className="py-2 px-2 font-medium">نجاح</th>
                <th className="py-2 px-2 font-medium">فشل</th>
                <th className="py-2 px-2 font-medium">زمن الاستجابة</th>
                <th className="py-2 px-2 font-medium">آخر نجاح</th>
                <th className="py-2 px-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const isBusy = busyModelId === m.id;
                return (
                  <tr key={m.id} className={clsx('border-b border-secondary-50', m.is_excluded && 'opacity-50')}>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1.5">
                        {m.is_preferred && <Star className="w-3.5 h-3.5 text-warning-500 fill-warning-500 shrink-0" />}
                        <div>
                          <p className="font-medium text-secondary-900" dir="ltr">{m.id}</p>
                          {m.last_failure_reason && !m.is_excluded && (
                            <p className="text-xs text-error-500 mt-0.5 max-w-xs truncate" title={m.last_failure_reason}>
                              {m.last_failure_reason}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-success-700">{m.success_count}</td>
                    <td className="py-2 px-2 text-error-700">{m.failure_count}</td>
                    <td className="py-2 px-2 text-secondary-600">
                      {m.avg_latency_ms ? `${(m.avg_latency_ms / 1000).toFixed(1)}ث` : '—'}
                    </td>
                    <td className="py-2 px-2 text-secondary-500 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {m.last_success_at ? timeAgo(m.last_success_at) : '—'}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleTogglePreferred(m)}
                          className={clsx('btn btn-ghost btn-sm px-2', m.is_preferred && 'text-warning-600')}
                          title={m.is_preferred ? 'إلغاء التفضيل' : 'تفضيل هذا النموذج'}
                        >
                          <Star className={clsx('w-4 h-4', m.is_preferred && 'fill-warning-500')} />
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleExclude(m)}
                          className="btn btn-ghost btn-sm px-2"
                          title={m.is_excluded ? 'إعادة تفعيل النموذج' : 'استبعاد النموذج'}
                        >
                          {m.is_excluded ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
