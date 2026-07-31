import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Loader2, CheckCircle2, XCircle, HelpCircle,
  Eye, EyeOff, Zap, Clock
} from 'lucide-react';
import clsx from 'clsx';
import { friendlyError } from '../../../lib/errorMessages';
import { useNotify } from '../../../lib/notify';
import {
  fetchAISettings, setAIEnabled, updateProvider, testProviderConnection,
} from '../services/aiSettingsService';
import {
  AI_PROVIDER_LABELS, AI_PROVIDER_STATUS_LABELS,
  type AIProviderConfig, type AIProviderKey, type AISettingsBundle,
} from '../types';

const STATUS_META: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  active:   { bg: 'bg-success-50', text: 'text-success-700', icon: CheckCircle2 },
  error:    { bg: 'bg-error-50',   text: 'text-error-700',   icon: XCircle },
  untested: { bg: 'bg-secondary-100', text: 'text-secondary-600', icon: HelpCircle },
  disabled: { bg: 'bg-secondary-100', text: 'text-secondary-400', icon: HelpCircle },
};

function ProviderCard({
  config, onSaved, onError,
}: {
  config: AIProviderConfig;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const notify = useNotify();
  const [enabled, setEnabled] = useState(config.enabled);
  const [priority, setPriority] = useState(config.priority);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [accountIdInput, setAccountIdInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const isCloudflare = config.provider === 'cloudflare';
  const meta = STATUS_META[config.status] ?? STATUS_META.untested;
  const StatusIcon = meta.icon;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProvider({
        provider: config.provider,
        enabled,
        priority,
        apiKey: apiKeyInput.trim() ? apiKeyInput.trim() : undefined,
        accountId: isCloudflare && accountIdInput.trim() ? accountIdInput.trim() : undefined,
      });
      setApiKeyInput('');
      setAccountIdInput('');
      notify.success('تم حفظ إعدادات المزود بنجاح');
      await onSaved();
    } catch (err) {
      onError(friendlyError(err, 'فشل حفظ إعدادات المزود'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testProviderConnection(config.provider);
      if (result.success) {
        notify.success(
          result.models_found
            ? `الاتصال ناجح — تم العثور على ${result.models_found} نموذج مجاني متاح`
            : 'الاتصال ناجح'
        );
      } else {
        notify.error(result.error || 'فشل الاتصال بالمزود');
      }
      await onSaved();
    } catch (err) {
      onError(friendlyError(err, 'فشل اختبار الاتصال'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-secondary-200 p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-secondary-900">{config.display_name}</h3>
            <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full', meta.bg, meta.text)}>
              <StatusIcon className="w-3.5 h-3.5" />
              {AI_PROVIDER_STATUS_LABELS[config.status]}
            </span>
          </div>
          {config.last_tested_at && (
            <p className="text-xs text-secondary-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              آخر اختبار: {new Date(config.last_tested_at).toLocaleString('ar-EG')}
            </p>
          )}
          {config.status === 'error' && config.last_error && (
            <p className="text-xs text-error-600 mt-1">{config.last_error}</p>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <span className="text-xs text-secondary-500">مفعّل</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 accent-primary-600"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-secondary-600 block mb-1.5">
            مفتاح API {config.has_key && <span className="text-secondary-400 font-normal">({config.key_preview})</span>}
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={config.has_key ? 'اتركه فارغاً للإبقاء على المفتاح الحالي' : 'أدخل مفتاح API'}
              className="w-full text-sm border border-secondary-200 rounded-lg px-3 py-2 pl-9 focus:outline-none focus:ring-2 focus:ring-primary-500"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-secondary-400"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isCloudflare && (
          <div>
            <label className="text-xs font-semibold text-secondary-600 block mb-1.5">
              Account ID {config.has_account_id && <span className="text-secondary-400 font-normal">(محفوظ)</span>}
            </label>
            <input
              type="text"
              value={accountIdInput}
              onChange={(e) => setAccountIdInput(e.target.value)}
              placeholder={config.has_account_id ? 'اتركه فارغاً للإبقاء على القيمة الحالية' : 'أدخل Cloudflare Account ID'}
              className="w-full text-sm border border-secondary-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              dir="ltr"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-secondary-600 block mb-1.5">الأولوية (الأقل = أعلى أولوية)</label>
          <input
            type="number"
            min={1}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value) || 1)}
            className="w-full text-sm border border-secondary-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {config.default_model && (
          <div>
            <label className="text-xs font-semibold text-secondary-600 block mb-1.5">آخر نموذج مجاني مُختار</label>
            <p className="text-sm text-secondary-700 border border-secondary-100 bg-secondary-50 rounded-lg px-3 py-2 truncate" dir="ltr">
              {config.default_model}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          حفظ
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !config.has_key}
          title={!config.has_key ? 'أدخل مفتاح API واحفظه أولاً' : ''}
          className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold rounded-lg border border-secondary-200 text-secondary-700 hover:bg-secondary-50 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          اختبار الاتصال
        </button>
      </div>
    </div>
  );
}

export function AISettingsPage() {
  const notify = useNotify();
  const [bundle, setBundle] = useState<AISettingsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingMaster, setTogglingMaster] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchAISettings();
      setBundle(data);
      setError(null);
    } catch (err) {
      setError(friendlyError(err, 'تعذر تحميل إعدادات الذكاء الاصطناعي'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sortedProviders = useMemo(
    () => [...(bundle?.providers ?? [])].sort((a, b) => a.priority - b.priority),
    [bundle]
  );

  const handleToggleMaster = async () => {
    if (!bundle) return;
    setTogglingMaster(true);
    try {
      await setAIEnabled(!bundle.settings.ai_enabled);
      notify.success(!bundle.settings.ai_enabled ? 'تم تفعيل منظومة الذكاء الاصطناعي' : 'تم تعطيل منظومة الذكاء الاصطناعي');
      await load();
    } catch (err) {
      notify.error(friendlyError(err, 'فشل تحديث حالة التفعيل'));
    } finally {
      setTogglingMaster(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="p-6 text-center">
        <p className="text-error-600">{error || 'حدث خطأ غير متوقع'}</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl border border-secondary-200 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-secondary-900">إعدادات الذكاء الاصطناعي</h1>
              <p className="text-sm text-secondary-500">إدارة مزودي الخدمة ومفاتيح API — للاستخدام فى مزايا قادمة</p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span className="text-xs font-semibold text-secondary-600">{bundle.settings.ai_enabled ? 'مفعّل' : 'معطّل'}</span>
            <input
              type="checkbox"
              checked={bundle.settings.ai_enabled}
              onChange={handleToggleMaster}
              disabled={togglingMaster}
              className="w-5 h-5 accent-primary-600"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
          <div className="bg-secondary-50 rounded-xl p-3">
            <p className="text-xs text-secondary-400 mb-1">المزود الحالي</p>
            <p className="font-semibold text-secondary-800" dir="ltr">
              {bundle.settings.active_provider ? AI_PROVIDER_LABELS[bundle.settings.active_provider] : '—'}
            </p>
          </div>
          <div className="bg-secondary-50 rounded-xl p-3">
            <p className="text-xs text-secondary-400 mb-1">النموذج الحالي</p>
            <p className="font-semibold text-secondary-800 truncate" dir="ltr">
              {bundle.settings.active_model || '—'}
            </p>
          </div>
          <div className="bg-secondary-50 rounded-xl p-3">
            <p className="text-xs text-secondary-400 mb-1">إجمالي النماذج المتاحة</p>
            <p className="font-semibold text-secondary-800" dir="ltr">
              {bundle.models.length}
            </p>
          </div>
          <div className="bg-secondary-50 rounded-xl p-3 col-span-2 sm:col-span-1">
            <p className="text-xs text-secondary-400 mb-1">آخر تحديث لقائمة النماذج</p>
            <p className="font-semibold text-secondary-800">
              {bundle.settings.models_updated_at
                ? new Date(bundle.settings.models_updated_at).toLocaleString('ar-EG')
                : 'لم يتم بعد'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-700 px-1">
          مزودو الخدمة (مرتّبون حسب الأولوية — يتم الانتقال للمزود التالي تلقائياً عند حدوث خطأ)
        </p>
        {sortedProviders.map((p) => (
          <ProviderCard
            key={p.provider}
            config={p}
            onSaved={load}
            onError={(msg) => notify.error(msg)}
          />
        ))}
      </div>
    </div>
  );
}
