import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Wallet,
  CalendarDays,
  Clock3,
  Sparkles,
} from 'lucide-react';
import type { Ref } from 'react';
import { useSettings } from '../../hooks/useSettings';
import type { CalculationResult } from './pricingEngine';
import { formatCurrency, formatNumber } from './pricingEngine';
import {
  calculatePolicyBenefit,
  DEATH_BENEFIT_NOTICE,
  ACCIDENT_DOUBLING_NOTICE,
  QUATERNARY_DEATH_NOTICE,
} from './PolicyBenefits';

// ─── عرض سعر تسويقى قابل للطباعة / حفظ PDF (يظهر فقط عند الطباعة) ───
// هذا العرض لا يُحفظ داخل النظام، فقط لعرض/طباعة نتيجة الحاسبة لحظياً.
//
// ملحوظة مهمة عن إصلاح مشكلة "الصفحة البيضاء" عند الطباعة:
// القاعدة العامة للطباعة فى src/index.css (@media print) بتخفى كل عنصر
// فى الصفحة (body * { visibility: hidden }) ما عدا العناصر اللى جوه
// كلاس ".print-report" تحديداً — وهو نفس الكلاس المستخدم فى كل تقارير
// الطباعة الأخرى بالتطبيق (تقفيل الشهر، التقارير اليومية، التحصيل...).
// لازم نفضل مستخدمين نفس الكلاس ده بالظبط (مش كلاس تانى خاص بيها فقط)
// عشان الطباعة/حفظ PDF تفضل شغالة وميظهرش صفحة بيضاء.
// forceVisible: يُستخدم مؤقتاً وقت "حفظ كصورة" لعرض هذا المكوّن فعلياً (بره
// حدود الشاشة المرئية للمستخدم) عشان html2canvas يقدر يصوّره — نفس تماماً شكل
// نسخة الطباعة. containerRef يمسك بعنصر الـ DOM الجذري عشان تصويره لاحقاً.
export function PrintQuote({
  result,
  forceVisible,
  containerRef,
  logoOverrideSrc,
}: {
  result: CalculationResult;
  forceVisible?: boolean;
  containerRef?: Ref<HTMLDivElement>;
  // أثناء "حفظ كصورة" بنستبدل شعار الشركة (لو من دومين خارجي) بنسخة Base64
  // من نفس المصدر، عشان الـ canvas ميتحسبش "ملوّث" (tainted) بسبب قيود CORS
  // فيطلع الناتج صورة بيضاء بدل المحتوى الحقيقي.
  logoOverrideSrc?: string | null;
}) {
  const { branding } = useSettings();
  const benefit = calculatePolicyBenefit(result);
  // فى وضع التصوير (forceVisible) بنستخدم بس نسخة الـ Base64 (لو اتجهزت)
  // ولو مش موجودة بنستغني عن الشعار خالص، وميتفتحش الرابط الأصلي للشركة أبداً
  // وقت التصوير — عشان نضمن إن الـ canvas ميبقاش "ملوّث" مهما كانت إعدادات
  // CORS عند مصدر الصورة. وضع الطباعة/الشاشة العادي مش بيتأثر خالص.
  const logoSrc = forceVisible ? (logoOverrideSrc || undefined) : branding.company_logo_url;

  const issueDate = result.calculatedAt;
  const validityDays = 5;
  const expiryDate = new Date(issueDate.getTime() + validityDays * 24 * 60 * 60 * 1000);

  const issueDateLabel = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long' }).format(issueDate);
  const expiryDateLabel = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long' }).format(expiryDate);

  // عرض المساحة القابلة للطباعة فعلياً داخل A4 بعد خصم هامش 11مم يمين/يسار
  // (نفس قياس @page margin بالأسفل) — نفس العرض اللي هيتحسب بيه التخطيط وقت
  // الطباعة الحقيقية، عشان الصورة الناتجة تطلع مطابقة تماماً لشكل الطباعة.
  const PRINT_CONTENT_WIDTH_PX = 710;

  return (
    <div
      ref={containerRef}
      className={forceVisible ? 'block print-report' : 'hidden print:block print-report'}
      style={forceVisible ? { position: 'fixed', top: 0, left: '-99999px', width: PRINT_CONTENT_WIDTH_PX, background: '#ffffff' } : undefined}
      dir="rtl"
    >
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm 11mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-report { position: relative; isolation: isolate; background: #ffffff; font-family: 'Tahoma', 'Segoe UI', 'Arial', sans-serif; color: #1f2937; font-size: 10.6px; line-height: 1.35; }

        /* ===== خلفية شعار الشركة (Watermark) ===== */
        /* absolute بدل fixed: كده بتتحدد بالنسبة لصندوق .print-report نفسه
           (اللى ارتفاعه = ارتفاع المحتوى فى الحالتين: صفحة طباعة واحدة، أو
           النسخة المؤقتة وقت تصوير الصورة) بدل نافذة المتصفح، فتفضل فى مكانها
           الصحيح فى الحالتين.
           isolation: isolate فوق فى .print-report بتحصر الـ stacking context جوه
           العنصر نفسه، عشان z-index: -1 هنا يفضل ظاهر ومطبوع فعلياً فوق خلفية
           الصفحة وقت الطباعة الحقيقية من المتصفح (مش بس وقت تصوير الصورة بمعزل
           عن باقي الصفحة). */
        .print-report .pq-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: -1; pointer-events: none; }
        .print-report .pq-watermark img { width: 62%; max-width: 460px; opacity: 0.055; filter: grayscale(1); }

        /* ===== ترويسة الشركة ===== */
        .print-report .pq-header { text-align: center; padding-bottom: 8px; margin-bottom: 10px; border-bottom: 3px solid #16a34a; }
        .print-report .pq-company { display: flex; align-items: center; justify-content: center; gap: 9px; margin-bottom: 5px; }
        .print-report .pq-company img { width: 40px; height: 40px; object-fit: contain; }
        .print-report .pq-company span { font-size: 17px; font-weight: 800; color: #14532d; letter-spacing: 0.3px; }
        .print-report .pq-title { font-size: 14.5px; font-weight: 800; color: #15803d; margin-bottom: 3px; }
        .print-report .pq-tagline { font-size: 10px; font-weight: 600; color: #6b7280; }

        /* ===== عناوين الأقسام ===== */
        .print-report .pq-section-title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: #14532d; margin: 10px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #bbf7d0; }
        .print-report .pq-section-title-sub { font-size: 10.5px; font-weight: 700; color: #6b7280; border-bottom: 1px solid #e5e7eb; }

        /* ===== بطاقة بيانات العرض ===== */
        .print-report .pq-offer-card { border: 1px solid #bbf7d0; background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%); border-radius: 12px; padding: 9px 12px; }
        .print-report .pq-offer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px; }
        .print-report .pq-offer-item { display: flex; align-items: flex-start; gap: 6px; padding: 2px 0; }
        .print-report .pq-offer-item .icon { color: #16a34a; flex-shrink: 0; margin-top: 1px; }
        .print-report .pq-offer-item .label { font-size: 9px; color: #6b7280; font-weight: 600; }
        .print-report .pq-offer-item .value { font-size: 11.5px; color: #14532d; font-weight: 800; }
        .print-report .pq-offer-item.pq-validity .value { color: #b45309; }

        /* ===== المميزات (لماذا هذه الوثيقة) ===== */
        .print-report .pq-feature-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 14px; margin-top: 2px; }
        .print-report .pq-feature { display: flex; align-items: flex-start; gap: 6px; font-size: 10px; color: #1f2937; }
        .print-report .pq-feature .icon { color: #16a34a; flex-shrink: 0; margin-top: 2px; }

        .print-report .pq-maturity-line { display: flex; align-items: center; justify-content: space-between; margin-top: 7px; padding: 6px 12px; background: #ecfdf5; border: 1.5px solid #16a34a; border-radius: 9px; }
        .print-report .pq-maturity-line .label { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 700; color: #14532d; }
        .print-report .pq-maturity-line .value { font-size: 14px; font-weight: 800; color: #14532d; }

        .print-report .pq-notice { display: flex; gap: 6px; align-items: flex-start; background: #fefce8; border: 1px solid #fde047; border-radius: 7px; padding: 5px 10px; margin-top: 5px; font-size: 9.5px; color: #713f12; }
        .print-report .pq-notice .icon { color: #ca8a04; flex-shrink: 0; margin-top: 1px; }

        /* ===== قسم المقابل المالي ===== */
        .print-report .pq-benefit-grid { display: flex; gap: 8px; margin-top: 4px; }
        .print-report .pq-benefit-box { flex: 1; border: 1.5px solid #bfdbfe; border-radius: 10px; padding: 8px 10px; text-align: center; background: linear-gradient(160deg, #eff6ff 0%, #ffffff 100%); }
        .print-report .pq-benefit-box.gold { border-color: #fde68a; background: linear-gradient(160deg, #fffbeb 0%, #ffffff 100%); }
        .print-report .pq-benefit-box.highlight { border-color: #16a34a; background: linear-gradient(160deg, #ecfdf5 0%, #f0fdf4 100%); box-shadow: 0 0 0 1px #16a34a inset; }
        .print-report .pq-benefit-box .label { font-size: 9.5px; color: #1d4ed8; font-weight: 700; margin-bottom: 4px; }
        .print-report .pq-benefit-box.gold .label { color: #b45309; }
        .print-report .pq-benefit-box.highlight .label { color: #14532d; }
        .print-report .pq-benefit-box .value { font-size: 14.5px; font-weight: 800; color: #1e3a8a; }
        .print-report .pq-benefit-box.gold .value { color: #92400e; }
        .print-report .pq-benefit-box.highlight .value { color: #14532d; font-size: 16px; }

        /* ===== جدول الأقساط ===== */
        .print-report .pq-premium-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 4px; }
        .print-report .pq-premium-box { border: 1px solid #99f6e4; background: linear-gradient(160deg, #f0fdfa 0%, #ffffff 100%); border-radius: 9px; padding: 6px 6px; text-align: center; }
        .print-report .pq-premium-box .label { font-size: 9px; color: #0f766e; font-weight: 700; margin-bottom: 3px; }
        .print-report .pq-premium-box .value { font-size: 11.5px; color: #115e59; font-weight: 800; }

        /* ===== ملاحظات مهمة ===== */
        .print-report .pq-remarks { list-style: none; padding: 0; margin: 2px 0 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 3px 14px; }
        .print-report .pq-remarks li { display: flex; align-items: flex-start; gap: 5px; font-size: 9px; color: #4b5563; }
        .print-report .pq-remarks li::before { content: '•'; color: #16a34a; font-weight: 800; }

        .print-report .pq-footer { margin-top: 10px; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 8.5px; color: #9ca3af; text-align: center; }
      `}</style>

      {/* ===== خلفية شعار الشركة ===== */}
      {logoSrc && (
        <div className="pq-watermark">
          <img src={logoSrc} alt="" />
        </div>
      )}

      {/* ===== ترويسة الشركة ===== */}
      <div className="pq-header">
        <div className="pq-company">
          {logoSrc && <img src={logoSrc} alt={branding.company_name} />}
          <span>{branding.company_name}</span>
        </div>
        <div className="pq-title">عرض وثيقة: {result.variant.label}</div>
        <div className="pq-tagline">معاً نحو مستقبل أكثر أماناً لك ولأسرتك</div>
      </div>

      {/* ===== بيانات العرض ===== */}
      <div className="pq-offer-card">
        <div className="pq-offer-grid">
          <div className="pq-offer-item">
            <ShieldCheck className="icon" size={12} />
            <div>
              <div className="label">العمر</div>
              <div className="value">{result.age} سنة</div>
            </div>
          </div>
          <div className="pq-offer-item">
            <ShieldCheck className="icon" size={12} />
            <div>
              <div className="label">نوع الوثيقة</div>
              <div className="value">{result.variant.label}</div>
            </div>
          </div>
          {benefit.kind === 'flat_profit' && (
            <div className="pq-offer-item">
              <Clock3 className="icon" size={12} />
              <div>
                <div className="label">مدة الوثيقة</div>
                <div className="value">{benefit.termYears} سنة</div>
              </div>
            </div>
          )}
          <div className="pq-offer-item">
            <Wallet className="icon" size={12} />
            <div>
              <div className="label">مبلغ التأمين</div>
              <div className="value">{formatCurrency(result.sumInsured)}</div>
            </div>
          </div>
          <div className="pq-offer-item">
            <CalendarDays className="icon" size={12} />
            <div>
              <div className="label">تاريخ إصدار العرض</div>
              <div className="value">{issueDateLabel}</div>
            </div>
          </div>
          <div className="pq-offer-item pq-validity">
            <Clock3 className="icon" size={12} />
            <div>
              <div className="label">مدة صلاحية العرض</div>
              <div className="value">{validityDays} أيام (حتى {expiryDateLabel})</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== لماذا هذه الوثيقة؟ ===== */}
      {benefit.kind !== 'none' && (
        <>
          <div className="pq-section-title">
            <Sparkles size={12} />
            لماذا هذه الوثيقة؟
          </div>

          {benefit.kind === 'flat_profit' && benefit.family === 'mixed' && (
            <>
              <div className="pq-feature-list">
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>حماية مالية طوال مدة التأمين.</span></div>
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>تكوين مبلغ مالي في نهاية مدة الوثيقة.</span></div>
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>أرباح سنوية تقديرية بنسبة {formatNumber(benefit.profitRatePct)}% من مبلغ التأمين.</span></div>
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>عرض المبلغ المتوقع في نهاية المدة.</span></div>
              </div>

              <div className="pq-maturity-line">
                <span className="label"><TrendingUp size={11} /> المتوقع في نهاية المدة</span>
                <span className="value">{formatCurrency(benefit.maturityAmount)}</span>
              </div>

              <div className="pq-notice"><AlertTriangle className="icon" size={11} /><span>{DEATH_BENEFIT_NOTICE}</span></div>
            </>
          )}

          {benefit.kind === 'flat_profit' && benefit.family === 'protection_investment' && (
            <>
              <div className="pq-feature-list">
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>حماية مالية.</span></div>
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>استثمار بعائد سنوي تقديري {formatNumber(benefit.profitRatePct)}% من مبلغ التأمين.</span></div>
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>عرض المبلغ المتوقع في نهاية المدة.</span></div>
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>دخول سحب ربع سنوي على مبلغ التأمين طوال مدة الوثيقة.</span></div>
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>يتم إجراء السحب أربع مرات سنوياً.</span></div>
              </div>

              <div className="pq-maturity-line">
                <span className="label"><TrendingUp size={11} /> المتوقع في نهاية المدة</span>
                <span className="value">{formatCurrency(benefit.maturityAmount)}</span>
              </div>

              <div className="pq-notice"><AlertTriangle className="icon" size={11} /><span>{DEATH_BENEFIT_NOTICE}</span></div>
              <div className="pq-notice"><AlertTriangle className="icon" size={11} /><span>{ACCIDENT_DOUBLING_NOTICE}</span></div>
            </>
          )}

          {benefit.kind === 'quaternary' && (
            <>
              <div className="pq-feature-list">
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>استلام ربع مبلغ التأمين كل خمس سنوات.</span></div>
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>عرض المبلغ المتوقع في نهاية المدة.</span></div>
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>آخر دفعة بالإضافة إلى 55% من مبلغ التأمين.</span></div>
                <div className="pq-feature"><CheckCircle2 className="icon" size={11} /><span>مبلغ التغطية التأمينية يظل ثابتاً مهما تم صرف دفعات من الوثيقة.</span></div>
              </div>

              <div className="pq-maturity-line">
                <span className="label"><TrendingUp size={11} /> المتوقع في نهاية المدة</span>
                <span className="value">{formatCurrency(benefit.maturityAmount)}</span>
              </div>

              <div className="pq-notice"><AlertTriangle className="icon" size={11} /><span>{QUATERNARY_DEATH_NOTICE}</span></div>
            </>
          )}

          {/* ===== قسم المقابل المالي ===== */}
          <div className="pq-section-title">
            <Wallet size={12} />
            المقابل المالي
          </div>
          <div className="pq-benefit-grid">
            <div className="pq-benefit-box">
              <div className="label">مبلغ التأمين</div>
              <div className="value">{formatCurrency(result.sumInsured)}</div>
            </div>
            <div className="pq-benefit-box gold">
              <div className="label">{benefit.kind === 'quaternary' ? 'الدفعة كل 5 سنوات' : 'الأرباح المتوقعة'}</div>
              <div className="value">
                {formatCurrency(benefit.kind === 'quaternary' ? benefit.periodicPayout : benefit.totalProfit)}
              </div>
            </div>
            <div className="pq-benefit-box highlight">
              <div className="label">المتوقع في نهاية المدة</div>
              <div className="value">{formatCurrency(benefit.maturityAmount)}</div>
            </div>
          </div>
        </>
      )}

      {/* ===== جدول الأقساط ===== */}
      <div className="pq-section-title pq-section-title-sub">جدول الأقساط</div>
      <div className="pq-premium-grid">
        <div className="pq-premium-box">
          <div className="label">سنوي</div>
          <div className="value">{formatCurrency(result.annualPremium)}</div>
        </div>
        <div className="pq-premium-box">
          <div className="label">نصف سنوي</div>
          <div className="value">{formatCurrency(result.semiAnnualPremium)}</div>
        </div>
        <div className="pq-premium-box">
          <div className="label">ربع سنوي</div>
          <div className="value">{formatCurrency(result.quarterlyPremium)}</div>
        </div>
        <div className="pq-premium-box">
          <div className="label">شهري</div>
          <div className="value">{formatCurrency(result.monthlyPremium)}</div>
        </div>
      </div>

      {/* ===== ملاحظات مهمة ===== */}
      <div className="pq-section-title pq-section-title-sub">ملاحظات مهمة</div>
      <ul className="pq-remarks">
        <li>جميع القيم الواردة بهذا التقرير هي قيم تقديرية طبقاً لبيانات الإدخال.</li>
        <li>الأرباح السنوية متغيرة ويتم إصدار شهادة الأرباح السنوية من {branding.company_name} وفقاً للنتائج الفعلية.</li>
        <li>يخضع إصدار الوثيقة لموافقة الشركة والشروط والأحكام المعتمدة.</li>
        <li>قد تختلف بعض المزايا طبقاً لشروط الإصدار النهائية.</li>
      </ul>

      <div className="pq-footer">
        هذا العرض تقديرى لأغراض التوضيح ويخضع للشروط والأحكام المعتمدة لدى {branding.company_name}.
      </div>
    </div>
  );
}
