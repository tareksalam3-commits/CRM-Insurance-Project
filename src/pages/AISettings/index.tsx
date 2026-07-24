import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useReconnectRefetch } from '../../hooks/useReconnectRefetch';
import { canViewSettings } from '../../lib/supabase';
import {
  Shield,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  ArrowUp,
  ArrowDown,
  PlugZap,
  Info,
} from 'lucide-react';
import clsx from 'clsx';
import { AIProviderConfigRow, AITestStatus } from './types';
import {
  fetchProviders,
  toggleProviderActive,
  updateProviderModel,
  reorderProviders,
  testProviderConnection,
} from './services/aiSettingsService';
import { OpenRouterModelsPanel } from '../../components/OpenRouterModelsPanel';

function StatusBadge({ status }: { status: AITestStatus }) {
  const map: Record<AITestStatus, { cls: string; icon: JSX.Element; label: string }> = {
    connected: { cls: 'badge-success', icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'متصل' },
    error: { cls: 'badge-error', icon: <XCircle className="w-3.5 h-3.5" />, label: 'خطأ' },
    untested: { cls: 'badge-secondary', icon: <HelpCircle className="w-3.5 h-3.5" />, label: 'لم يُختبر بعد' },
  };
  const s = map[status] ?? map.untested;
  return (
    <span className={clsx('badge gap-1', s.cls)}>
      {s.icon}
      {s.label}
    </span>
  );
}

export function AISettings() {
  const { user } = useAuth();
  const canAccess = user ? canViewSettings(user.role) : false;

  const [providers, setProviders] = useState<AIProviderConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyProviderId, setBusyProviderId] = useState<string | null>(null);
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (canAccess) load();
  }, [canAccess]);

  useReconnectRefetch(() => { if (canAccess) load(); });

  async function load() {
    setLoading(true);
    try {
      const data = await fetchProviders();
      setProviders(data);
      setModelDrafts(Object.fromEntries(data.map((p) => [p.id, p.model ?? ''])));
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'تعذّر تحميل إعدادات مزودي الذكاء الاصطناعي' });
    } finally {
      setLoading(false);
    }
  }

  async function withBusy(providerId: string, fn: () => Promise<void>) {
    setBusyProviderId(providerId);
    setMessage(null);
    try {
      await fn();
      await load();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err?.message || 'حدث خطأ غير متوقع' });
    } finally {
      setBusyProviderId(null);
    }
  }

  const handleToggleActive = (providerId: string, current: boolean) =>
    withBusy(providerId, async () => {
      await toggleProviderActive(providerId, !current);
    });

  const handleSaveModel = (providerId: string) =>
    withBusy(providerId, async () => {
      await updateProviderModel(providerId, modelDrafts[providerId]?.trim() ?? '');
      setMessage({ type: 'success', text: 'تم حفظ النموذج' });
    });

  const handleMove = (index: number, direction: -1 | 1) =>
    withBusy(providers[index].id, async () => {
      const newOrder = [...providers];
      const target = index + direction;
      if (target < 0 || target >= newOrder.length) return;
      [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
      await reorderProviders(newOrder.map((p) => p.id));
    });

  const handleTest = async (provider: AIProviderConfigRow) => {
    setBusyProviderId(provider.id);
    setMessage(null);
    try {
      await testProviderConnection(provider.id);
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'فشل اختبار الاتصال' });
    } finally {
      setBusyProviderId(null);
    }
  };

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Shield className="w-16 h-16 text-secondary-300 mb-4" />
        <p className="text-secondary-500">ليس لديك صلاحية للوصول لهذه الصفحة</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-secondary-900">إعدادات الذكاء الاصطناعي</h2>
          <p className="text-sm text-secondary-500 mt-0.5">
            إدارة مزودي الذكاء الاصطناعي وترتيب المحاولة عند الفشل (Fallback)
          </p>
        </div>
      </div>

      <div className="card flex items-start gap-3 bg-info-50 border border-info-100">
        <Info className="w-5 h-5 text-info-600 shrink-0 mt-0.5" />
        <p className="text-sm text-info-800">
          لأسباب أمنية، لا يتم تخزين أي مفتاح API داخل التطبيق أو قاعدة البيانات — فقط اسم الـ
          Secret. لتحديث قيمة مفتاح مزود، اضبطها من جهازك عبر أمر Supabase CLI:
          <code dir="ltr" className="block mt-1 bg-white/70 rounded px-2 py-1 text-xs">
            supabase secrets set SECRET_NAME=your_api_key
          </code>
        </p>
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
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((provider, index) => {
            const isBusy = busyProviderId === provider.id;

            return (
              <div key={provider.id} className="card space-y-4">
                {/* رأس الكارت */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-secondary-900">{provider.display_name}</h3>
                        <StatusBadge status={provider.last_test_status} />
                      </div>
                      <p className="text-xs text-secondary-400 mt-0.5" dir="ltr">
                        {provider.secret_name}
                      </p>
                      {provider.last_test_message && (
                        <p className="text-xs text-secondary-400 mt-0.5">{provider.last_test_message}</p>
                      )}
                    </div>
                  </div>

                  {/* أزرار الترتيب */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-secondary-400 px-1">ترتيب المحاولة: {index + 1}</span>
                    <button
                      type="button"
                      disabled={index === 0 || isBusy}
                      onClick={() => handleMove(index, -1)}
                      className="btn btn-ghost btn-sm px-2 disabled:opacity-30"
                      aria-label="نقل لأعلى"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === providers.length - 1 || isBusy}
                      onClick={() => handleMove(index, 1)}
                      className="btn btn-ghost btn-sm px-2 disabled:opacity-30"
                      aria-label="نقل لأسفل"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* التفعيل / اختبار */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleToggleActive(provider.id, provider.is_active)}
                    className={clsx('btn btn-sm', provider.is_active ? 'btn-success' : 'btn-secondary')}
                  >
                    {provider.is_active ? 'مفعّل' : 'معطّل'}
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleTest(provider)}
                    className="btn btn-sm btn-secondary"
                  >
                    {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
                    اختبار الاتصال
                  </button>
                </div>

                {/* النموذج */}
                {provider.provider === 'openrouter' ? (
                  <div className="form-group">
                    <label className="input-label">النموذج (Model)</label>
                    <p className="text-xs text-secondary-500 bg-secondary-50 rounded-lg px-3 py-2">
                      يُدار تلقائياً — النظام يختار ويبدّل بين كل النماذج المجانية المتاحة على
                      OpenRouter بدون ربط بموديل ثابت. التفاصيل والتحكم في اللوحة أدناه.
                    </p>
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="input-label">النموذج (Model)</label>
                    <div className="flex gap-2">
                      <input
                        className="input-field"
                        dir="ltr"
                        value={modelDrafts[provider.id] ?? ''}
                        onChange={(e) =>
                          setModelDrafts((prev) => ({ ...prev, [provider.id]: e.target.value }))
                        }
                        placeholder="مثال: gemini-2.5-flash"
                      />
                      <button
                        type="button"
                        disabled={isBusy || modelDrafts[provider.id] === (provider.model ?? '')}
                        onClick={() => handleSaveModel(provider.id)}
                        className="btn btn-sm btn-primary shrink-0"
                      >
                        حفظ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && providers.some((p) => p.provider === 'openrouter') && <OpenRouterModelsPanel />}
    </div>
  );
}
