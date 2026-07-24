import { useRef, useState, type KeyboardEvent } from 'react';
import {
  Calculator, RotateCcw, PlusCircle, Copy, Printer, Check, AlertCircle,
  DollarSign, Percent,
} from 'lucide-react';

import { PageHeader } from '../../components/layout/PageHeader';
import { ProductPicker } from './ProductPicker';
import {
  calculatePrice,
  validateInputs,
  formatCurrency,
  formatNumber,
  type CalculationResult,
  type ValidationErrors,
} from './pricingEngine';
import { PrintQuote } from './PrintQuote';
import { PolicyBenefits } from './PolicyBenefitsCard';
import { printWithTitle } from '../../lib/printWithTitle';

// ─── صفحة "حاسبة الأسعار" ───────────────────────────────────
// صفحة مستقلة بالكامل عن دورة عمل النظام: لا تُنشئ عميل/وثيقة/قسط/تحصيل،
// ولا ترسل أو تحفظ أي بيانات فى Supabase. كل الحسابات تتم محلياً داخل
// المتصفح اعتماداً على معادلات وثوابت مُستخرجة من ملف Individual Pricing.xlsm.
export function PriceCalculator() {
  const [age, setAge] = useState('');
  const [variantKey, setVariantKey] = useState('');
  const [sumInsured, setSumInsured] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const ageInputRef = useRef<HTMLInputElement>(null);


  function handleCalculate() {
    const validationErrors = validateInputs(age, variantKey, sumInsured);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setResult(null);
      return;
    }
    try {
      const calculated = calculatePrice({
        age: Number(age),
        variantKey,
        sumInsured: Number(sumInsured),
      });
      setResult(calculated);
    } catch (err) {
      setErrors({ variantKey: err instanceof Error ? err.message : 'حدث خطأ فى الحساب' });
      setResult(null);
    }
  }

  function handleReset() {
    setAge('');
    setVariantKey('');
    setSumInsured('');
    setErrors({});
    setResult(null);
    setCopied(false);
  }

  function handleNewCalculation() {
    handleReset();
    requestAnimationFrame(() => ageInputRef.current?.focus());
  }

  async function handleCopyResults() {
    if (!result) return;
    const text = [
      `نوع الوثيقة: ${result.variant.label}`,
      `السن: ${result.age} سنة`,
      `مبلغ التأمين: ${formatCurrency(result.sumInsured)}`,
      `القسط السنوي: ${formatCurrency(result.annualPremium)}`,
      `القسط النصف سنوي: ${formatCurrency(result.semiAnnualPremium)}`,
      `القسط الربع سنوي: ${formatCurrency(result.quarterlyPremium)}`,
      `القسط الشهري: ${formatCurrency(result.monthlyPremium)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // فشل النسخ (متصفح لا يدعم الحافظة) — تجاهل بصمت
    }
  }

  function handlePrint() {
    if (result) {
      printWithTitle(`عرض-سعر-${result.variant.label}`);
    } else {
      window.print();
    }
  }

  function handleLastFieldKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCalculate();
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="حاسبة الأسعار"
        subtitle="أداة مساعدة سريعة لحساب سعر الوثيقة أثناء مقابلة العميل — مستقلة تماماً ولا تُخزَّن بياناتها"
      />

      {/* ===== بطاقة المدخلات ===== */}
      <div className="card print:hidden space-y-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary-50 rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />

        <div className="flex items-center gap-2.5 relative">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-600 text-white flex-shrink-0 shadow-sm">
            <Calculator className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-secondary-900">بيانات الحساب</h3>
            <p className="text-xs text-secondary-500">أدخل بيانات العميل للحصول على السعر فوراً</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
          <div className="form-group mb-0">
            <label className="input-label">السن</label>
            <input
              ref={ageInputRef}
              type="number"
              inputMode="numeric"
              className="input-field"
              placeholder="مثال: 32"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
            {errors.age && (
              <p className="text-xs text-error-600 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {errors.age}
              </p>
            )}
          </div>

          <div className="form-group mb-0">
            <label className="input-label">مبلغ التأمين</label>
            <input
              type="number"
              inputMode="decimal"
              className="input-field"
              placeholder="مثال: 150000"
              value={sumInsured}
              onChange={(e) => setSumInsured(e.target.value)}
              onKeyDown={handleLastFieldKeyDown}
            />
            {errors.sumInsured && (
              <p className="text-xs text-error-600 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {errors.sumInsured}
              </p>
            )}
          </div>

          <div className="form-group mb-0">
            <label className="input-label">نوع الوثيقة</label>
            <ProductPicker value={variantKey} onChange={setVariantKey} error={errors.variantKey} />
          </div>
        </div>

        <button onClick={handleCalculate} className="btn btn-primary w-full md:w-auto relative">
          <Calculator className="w-4 h-4" />
          احسب السعر
        </button>
      </div>

      {/* ===== بطاقة النتائج ===== */}
      {result && (
        <div className="card animate-fadeIn print:hidden space-y-5 border-primary-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex-shrink-0">
                <DollarSign className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-secondary-900">نتيجة الحساب</h3>
                <p className="text-sm text-secondary-500 mt-0.5">{result.variant.label}</p>
              </div>
            </div>
            <span className="badge badge-info self-start sm:self-auto flex items-center gap-1">
              <Percent className="w-3 h-3" />
              السعر لكل ألف: {formatNumber(result.rate)}
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="kpi-card !p-4 ring-1 ring-primary-100 bg-primary-50/40">
              <p className="text-xs text-primary-700 mb-1 font-medium">القسط السنوي</p>
              <p className="text-lg md:text-xl font-bold text-primary-700">
                {formatCurrency(result.annualPremium)}
              </p>
            </div>
            <div className="kpi-card !p-4">
              <p className="text-xs text-secondary-500 mb-1">نصف سنوي</p>
              <p className="text-lg md:text-xl font-bold text-secondary-900">
                {formatCurrency(result.semiAnnualPremium)}
              </p>
            </div>
            <div className="kpi-card !p-4">
              <p className="text-xs text-secondary-500 mb-1">ربع سنوي</p>
              <p className="text-lg md:text-xl font-bold text-secondary-900">
                {formatCurrency(result.quarterlyPremium)}
              </p>
            </div>
            <div className="kpi-card !p-4">
              <p className="text-xs text-secondary-500 mb-1">شهري</p>
              <p className="text-lg md:text-xl font-bold text-secondary-900">
                {formatCurrency(result.monthlyPremium)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== مزايا الوثيقة (تختلف حسب نوع الوثيقة) ===== */}
      {result && <PolicyBenefits result={result} />}

      {/* ===== أزرار الإجراءات: تحت النتائج ومزايا الوثيقة ===== */}
      {result && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={handleNewCalculation} className="btn btn-outline btn-sm">
            <PlusCircle className="w-4 h-4" /> حساب جديد
          </button>
          <button onClick={handleReset} className="btn btn-secondary btn-sm">
            <RotateCcw className="w-4 h-4" /> إعادة تعيين
          </button>
          <button onClick={handleCopyResults} className="btn btn-secondary btn-sm">
            {copied ? <Check className="w-4 h-4 text-success-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'تم النسخ' : 'نسخ النتائج'}
          </button>
          <button onClick={handlePrint} className="btn btn-success btn-sm">
            <Printer className="w-4 h-4" /> طباعة / حفظ PDF
          </button>
        </div>
      )}

      {result && <PrintQuote result={result} />}
    </div>
  );
}
