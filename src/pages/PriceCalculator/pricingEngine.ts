import { PRICING_VARIANTS, type PricingVariant } from './pricingData';

// ─────────────────────────────────────────────────────────────
// محرك حساب الأسعار — يطابق تماماً معادلات ملف Individual Pricing.xlsm
// (شيت "حساب مبلغ التأمين" / "حساب القسط"):
//
//   القسط السنوي = مبلغ التأمين × السعر ÷ القاسم
//     القاسم = 4000 لمنتج "الرباعية" فقط، و1000 لباقي المنتجات
//
//   نصف سنوي = القسط السنوي × (1 + 4%) ÷ 2
//   ربع سنوي = القسط السنوي × (1 + 4%) ÷ 4
//   شهري     = القسط السنوي × (1 + 4%) ÷ 12
// ─────────────────────────────────────────────────────────────

const INSTALLMENT_LOADING = 0.04;

export interface CalculationInput {
  age: number;
  variantKey: string;
  sumInsured: number;
}

export interface CalculationResult {
  variant: PricingVariant;
  age: number;
  sumInsured: number;
  rate: number;
  annualPremium: number;
  semiAnnualPremium: number;
  quarterlyPremium: number;
  monthlyPremium: number;
  calculatedAt: Date;
}

export function getVariant(key: string): PricingVariant | undefined {
  return PRICING_VARIANTS.find((v) => v.key === key);
}

/** الحد الأدنى/الأقصى للسن المتاح فعلياً فى جدول هذا المنتج */
export function getAgeRange(variant: PricingVariant): { min: number; max: number } {
  const ages = Object.keys(variant.rates).map(Number);
  return { min: Math.min(...ages), max: Math.max(...ages) };
}

export interface ValidationErrors {
  age?: string;
  variantKey?: string;
  sumInsured?: string;
}

export function validateInputs(
  ageRaw: string,
  variantKey: string,
  sumInsuredRaw: string
): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!variantKey) {
    errors.variantKey = 'يرجى اختيار نوع الوثيقة';
  }

  if (!ageRaw.trim()) {
    errors.age = 'يرجى إدخال السن';
  } else {
    const age = Number(ageRaw);
    if (!Number.isFinite(age) || !Number.isInteger(age)) {
      errors.age = 'السن يجب أن يكون رقماً صحيحاً';
    } else if (variantKey) {
      const variant = getVariant(variantKey);
      if (variant) {
        const { min, max } = getAgeRange(variant);
        if (age < min || age > max) {
          errors.age = `السن غير ضمن الحدود المسموح بها لهذا المنتج (من ${min} إلى ${max} سنة)`;
        }
      }
    }
  }

  if (!sumInsuredRaw.trim()) {
    errors.sumInsured = 'يرجى إدخال مبلغ التأمين';
  } else {
    const sumInsured = Number(sumInsuredRaw);
    if (!Number.isFinite(sumInsured) || sumInsured <= 0) {
      errors.sumInsured = 'يجب أن يكون مبلغ التأمين أكبر من صفر';
    }
  }

  return errors;
}

export function calculatePrice(input: CalculationInput): CalculationResult {
  const variant = getVariant(input.variantKey);
  if (!variant) {
    throw new Error('نوع الوثيقة غير معروف');
  }

  const rate = variant.rates[input.age];
  if (rate === undefined) {
    throw new Error('السن غير متاح لهذا النوع من الوثائق');
  }

  const annualPremium = (input.sumInsured * rate) / variant.divisor;

  return {
    variant,
    age: input.age,
    sumInsured: input.sumInsured,
    rate,
    annualPremium,
    semiAnnualPremium: (annualPremium * (1 + INSTALLMENT_LOADING)) / 2,
    quarterlyPremium: (annualPremium * (1 + INSTALLMENT_LOADING)) / 4,
    monthlyPremium: (annualPremium * (1 + INSTALLMENT_LOADING)) / 12,
    calculatedAt: new Date(),
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
