import type { PricingVariant, ProductFamily } from './pricingData';
import type { CalculationResult } from './pricingEngine';

// ─────────────────────────────────────────────────────────────
// حساب "مزايا الوثيقة" — إضافة جديدة تماماً، منفصلة عن pricingEngine.ts
// الأصلي ولا تعدّل أى معادلة أو ثابت موجود فيه. الحسابات هنا مبنية حرفياً
// على المعادلات الموضحة فى طلب التطوير:
//
//   وثيقة مختلط / ذو أقساط  → ربح سنوى ثابت 4.74% غير تراكمى
//   وثيقة حماية واستثمار    → ربح سنوى ثابت 5.75% غير تراكمى
//   وثيقة الرباعية          → دفعة كل 5 سنوات (ربع مبلغ التأمين) + دفعة
//                             ختامية = آخر ربع مستحق + 55% من مبلغ التأمين
// ─────────────────────────────────────────────────────────────

export const PROFIT_RATE_MIXED_FIXED_TERM = 0.0474; // 4.74% — مختلط / ذو أقساط
export const PROFIT_RATE_PROTECTION_INVESTMENT = 0.0575; // 5.75% — حماية واستثمار

/**
 * يستخرج "مدة الوثيقة" (بالسنوات) من مفتاح المنتج نفسه، دون أى إدخال
 * إضافى من المستخدم ودون تغيير واجهة حاسبة الأسعار الحالية:
 *  - مفاتيح بها لاحقة صريحة للمدة مثل "_10y" أو "_15y" ← تُقرأ مباشرة.
 *  - مفاتيح "حتى سن كذا" مثل "_age60" ← المدة = السن المستهدف − سن العميل.
 *  - "الرباعية" ليس لها مفتاح مدة (غير مطلوبة لحساب مزاياها أصلاً).
 */
export function extractTermYears(variant: PricingVariant, age: number): number | null {
  const explicitYears = variant.key.match(/_(\d+)y$/);
  if (explicitYears) {
    const years = Number(explicitYears[1]);
    return years > 0 ? years : null;
  }

  const targetAgeMatch = variant.key.match(/_age(\d+)$/);
  if (targetAgeMatch) {
    const targetAge = Number(targetAgeMatch[1]);
    const term = targetAge - age;
    return term > 0 ? term : null;
  }

  return null;
}

export interface FlatProfitBenefit {
  kind: 'flat_profit';
  family: Extract<ProductFamily, 'mixed' | 'protection_investment'>;
  profitRatePct: number; // مثال: 4.74
  termYears: number;
  annualProfit: number;
  totalProfit: number;
  maturityAmount: number;
  hasAccidentDoubling: boolean; // مضاعفة مبلغ التأمين حال الوفاة بحادث (حماية واستثمار فقط)
  hasQuarterlyWithdrawal: boolean; // سحب ربع سنوى على مبلغ التأمين (حماية واستثمار فقط)
}

export interface QuaternaryBenefit {
  kind: 'quaternary';
  periodicPayout: number; // الدفعة كل 5 سنوات = ربع مبلغ التأمين
  maturityAmount: number; // آخر ربع مستحق + 55% من مبلغ التأمين
}

export interface NoBenefit {
  kind: 'none';
}

export type PolicyBenefit = FlatProfitBenefit | QuaternaryBenefit | NoBenefit;

export function calculatePolicyBenefit(result: CalculationResult): PolicyBenefit {
  const { variant, sumInsured, age } = result;
  const family = variant.family;

  if (family === 'quaternary') {
    const periodicPayout = sumInsured * 0.25;
    const maturityAmount = periodicPayout + sumInsured * 0.55;
    return { kind: 'quaternary', periodicPayout, maturityAmount };
  }

  if (family === 'mixed' || family === 'protection_investment') {
    const termYears = extractTermYears(variant, age);
    if (!termYears) return { kind: 'none' };

    const rate = family === 'protection_investment'
      ? PROFIT_RATE_PROTECTION_INVESTMENT
      : PROFIT_RATE_MIXED_FIXED_TERM;

    const annualProfit = sumInsured * rate;
    const totalProfit = annualProfit * termYears;
    const maturityAmount = sumInsured + totalProfit;

    return {
      kind: 'flat_profit',
      family,
      profitRatePct: rate * 100,
      termYears,
      annualProfit,
      totalProfit,
      maturityAmount,
      hasAccidentDoubling: family === 'protection_investment',
      hasQuarterlyWithdrawal: family === 'protection_investment',
    };
  }

  return { kind: 'none' };
}

export const DEATH_BENEFIT_NOTICE =
  'يرجى العلم أنه إذا حدثت وفاة (لا قدر الله) أثناء مدة التأمين يتم صرف مبلغ التأمين بالكامل بالإضافة إلى الأرباح المستحقة حتى تاريخ الوفاة.';

export const ACCIDENT_DOUBLING_NOTICE =
  'وإذا كانت الوفاة نتيجة حادث يتم مضاعفة مبلغ التأمين.';

export const QUARTERLY_WITHDRAWAL_NOTICE =
  'تشترك الوثيقة فى سحب ربع سنوى على مبلغ التأمين.';

export const QUATERNARY_DEATH_NOTICE =
  'يرجى العلم أنه إذا حدثت وفاة (لا قدر الله) أثناء مدة التأمين يتم صرف مبلغ التأمين بالكامل بالإضافة إلى الأرباح المستحقة حتى تاريخ الوفاة بغض النظر عن الدفعات التى تم صرفها مسبقاً.';
