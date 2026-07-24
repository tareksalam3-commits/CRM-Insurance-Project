import { ROLE_LABELS } from '../../../lib/supabase';
import { useSettings } from '../../../hooks/useSettings';
import type { SupervisorAgg, PrintDetailRow } from '../types';
import { fmt, last6 } from '../utils';
import { PERSONAL_PRODUCTION_LABEL } from '../business/monthlyClosingCalculator';

// عدد صفوف عمليات السداد في كل صفحة مطبوعة. بنقسّم الصفوف يدويًا لمجموعات
// بدل ما نسيب المتصفح يقسّم جدول واحد طويل على الصفحات، عشان:
// 1) رقم الصفحة يبقى رقم حقيقي بنحسبه إحنا (مش عداد CSS اللي بيفشل
//    ويكتب "١" في كل الصفحات لأنه بيتزوّد مرة واحدة بس مش بيتصفّر لكل صفحة).
// 2) ترويسة كل صفحة (اسم المراقب + الشهر) تتكرر فعليًا فوق كل صفحة، لأنها
//    بقت جزء من <thead> جدول مستقل لكل صفحة، مش اعتماد على تكرار تلقائي
//    لجدول واحد طويل ممكن ما يشتغلش صح مع كل المتصفحات.
const DETAIL_ROWS_PER_PAGE = 19;

// بعض الصفوف بتاخد مساحة أطول من صف عادي فعليًا وقت الطباعة (لو اسم
// العميل طويل وبيتلف على أكتر من سطر جوه عمود "العميل" مثلاً)، فبرضو ممكن
// عدد الصفوف اللي احنا حاسبينه (DETAIL_ROWS_PER_PAGE) يبقى متفائل شوية
// ومينفعش فعليًا على الورقة. عشان كده مش بنعتمد على العدّ بس؛ كل مجموعة
// وكيل (صفوفه + صف إجماليه) بتترسم جوه <tbody> مستقل ليها لوحدها وعليه
// page-break-inside: avoid — فلو حصل واتضح إن المجموعة مش هتِسّع فعليًا
// فى الصفحة الحالية (حتى لو حسابنا قال إنها هتِسّع)، المتصفح نفسه هيلقّف
// المجموعة كاملة (صفوفها + إجماليها) لأول الصفحة اللي بعدها بدل ما يقطّعها.
// ده أمان إضافي فوق الحساب اليدوي، مش بديل عنه.

// عنوان صف "إجمالي" لكل مجموعة فى صفحة تفاصيل عمليات السداد — للوكيل العادي
// بيكتب اسمه مباشرة، لكن لصف "إنتاج شخصي" (رئيس مجموعة أو مراقب فما فوق
// باع/حصّل بنفسه) كان بيكتب "إجمالي إنتاج شخصي" بس من غير ما يوضح اسم صاحبه؛
// دلوقتي بيضيف اسمه الفعلي جنبها (نفس الاسم المكتوب أصلاً فى عمود "رئيس
// المجموعة" أو "المراقب" بتاع نفس الصف).
function subtotalLabel(entry: { supervisorName: string; groupLeaderName: string; agentName: string }): string {
  if (entry.agentName !== PERSONAL_PRODUCTION_LABEL) return entry.agentName;
  const ownerName = entry.groupLeaderName !== PERSONAL_PRODUCTION_LABEL ? entry.groupLeaderName : entry.supervisorName;
  return ownerName ? `${PERSONAL_PRODUCTION_LABEL} — ${ownerName}` : PERSONAL_PRODUCTION_LABEL;
}

// صفوف عمليات السداد بترتيبها الأصلي (مجمّعة أصلاً بالوكيل)، وبعد كل مجموعة
// صفوف تخص نفس الوكيل بنحط صف "إجمالي الوكيل" — عشان يبان إجمالي كل وكيل
// في صفحة التفاصيل نفسها.
type PrintDetailEntry =
  | { kind: 'row'; row: PrintDetailRow }
  | { kind: 'subtotal'; supervisorName: string; groupLeaderName: string; agentName: string; amount: number };

// بنبني كل وكيل كـ"مجموعة" واحدة (صفوفه + صف إجماليه) بدل قائمة مسطّحة،
// عشان صفحة التفاصيل تقدر تتعامل مع كل مجموعة ككتلة واحدة متلاصقة ومتقسّمش
// نصفها فى صفحة والنص التاني فى الصفحة اللي بعدها.
function buildDetailGroups(rows: PrintDetailRow[]): PrintDetailEntry[][] {
  const groups: PrintDetailEntry[][] = [];
  let i = 0;
  while (i < rows.length) {
    const start = i;
    const cur = rows[i];
    const groupEntries: PrintDetailEntry[] = [];
    let sum = 0;
    while (
      i < rows.length &&
      rows[i].supervisorName === cur.supervisorName &&
      rows[i].groupLeaderName === cur.groupLeaderName &&
      rows[i].agentName === cur.agentName
    ) {
      groupEntries.push({ kind: 'row', row: rows[i] });
      sum += rows[i].amount;
      i += 1;
    }
    if (i > start) {
      groupEntries.push({
        kind: 'subtotal',
        supervisorName: cur.supervisorName,
        groupLeaderName: cur.groupLeaderName,
        agentName: cur.agentName,
        amount: sum,
      });
      groups.push(groupEntries);
    }
  }
  return groups;
}

// بنوزّع مجموعات الوكلاء على صفحات بحجم ثابت، بشرط إن أي مجموعة (صفوف وكيل
// + صف إجماليه) ما تتقسمش على صفحتين: لو المجموعة مش هتكمل فى الصفحة الحالية،
// بتتنقل كاملة لأول الصفحة الجديدة بدل ما تتقطع. الاستثناء الوحيد هو وكيل
// عدد عملياته لوحده أكبر من سعة الصفحة كلها — ده مضطرين نقسّمه فعليًا لأنه
// مش هيتظبط فى صفحة واحدة مهما كانت فاضية.
function paginateDetailGroups(groups: PrintDetailEntry[][], pageSize: number): PrintDetailEntry[][] {
  const pages: PrintDetailEntry[][] = [];
  let current: PrintDetailEntry[] = [];
  for (const group of groups) {
    if (group.length > pageSize) {
      if (current.length > 0) { pages.push(current); current = []; }
      for (let idx = 0; idx < group.length; idx += pageSize) {
        pages.push(group.slice(idx, idx + pageSize));
      }
      continue;
    }
    if (current.length > 0 && current.length + group.length > pageSize) {
      pages.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

// بترجع لستة الصفوف المسطّحة بتاعة صفحة واحدة (بعد التقسيم على الصفحات)
// لمجموعات صغيرة، كل مجموعة = صفوف وكيل واحد + صف إجماليه (لو وصل).
// المجموعة دي هي اللي هترتسم جوه <tbody> مستقل بعدين — عشان لو المجموعة
// مش هتِسّع فعليًا فى الصفحة، تتلقّف كاملة للصفحة اللي بعدها بدل ما تتقطّع.
// (فى حالة وكيل عملياته لوحدها أكبر من صفحة كاملة، الصفوف اللي بتوصل آخر
// الصفحة من غير ما توصل لصف الإجمالي بترجع كمجموعة من غير إجمالي — وده
// متوقع، لأنها أصلاً متقسّمة عمدًا لأكتر من صفحة.)
function chunkPageIntoAgentBlocks(entries: PrintDetailEntry[]): PrintDetailEntry[][] {
  const chunks: PrintDetailEntry[][] = [];
  let buffer: PrintDetailEntry[] = [];
  for (const entry of entries) {
    buffer.push(entry);
    if (entry.kind === 'subtotal') {
      chunks.push(buffer);
      buffer = [];
    }
  }
  if (buffer.length > 0) chunks.push(buffer);
  return chunks;
}

// ─── Print Report (structured, print-only) ────────────────
// يظهر فقط عند الطباعة — صفحة تجميعات أولى (هيكل إداري بحت) ثم صفحات تفاصيل العمليات المسددة
export function PrintReport({
  supervisorName, supervisorRoleLabel, monthLabel, closingDate, branchName,
  printSupervisors, printDetailRows,
  grandProduction, grandCollection, grandTotal,
}: {
  supervisorName: string;
  supervisorRoleLabel: string;
  monthLabel: string;
  closingDate: string;
  branchName?: string;
  printSupervisors: SupervisorAgg[];
  printDetailRows: PrintDetailRow[];
  grandProduction: number;
  grandCollection: number;
  grandTotal: number;
}) {
  const { branding } = useSettings();

  // كل مراقب عام (غير الأول) بيبدأ صفحة مطبوعة جديدة له لوحده، فبنحسب هنا
  // رقم الصفحة الفعلي لكل صف ومجموع صفحات التجميعات كلها — عشان تذييل كل
  // صفحة ياخد رقمه الصح، وصفحات التفاصيل (بعد التجميعات) تبدأ ترقيمها من
  // بعد آخر صفحة تجميعات فعلية، مش من رقم 2 ثابت.
  const visibleSupervisors = printSupervisors.filter((sv) => !sv.isSelfReport);
  const aggPageNumbers: number[] = [];
  let aggPage = 1;
  visibleSupervisors.forEach((sv, idx) => {
    if (idx > 0 && sv.role === 'general_supervisor') aggPage += 1;
    aggPageNumbers.push(aggPage);
  });
  const totalAggPages = aggPage;

  return (
    <div className="hidden print:block print-report" dir="rtl">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm 12mm 14mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-report {
          font-family: 'Tahoma', 'Segoe UI', 'Arial', sans-serif;
          color: #1f2937;
          font-size: 11.5px;
          line-height: 1.5;
        }
        .print-report .pr-page-break { page-break-before: always; break-before: page; }

        .print-report table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .print-report th, .print-report td { border: 1px solid #d8dce1; padding: 6px 8px; text-align: center; }
        .print-report th {
          background: #15803d;
          color: #fff;
          font-weight: 700;
          letter-spacing: 0.2px;
        }
        .print-report tbody tr:nth-child(even) { background: #f7f9f7; }

        /* ترويسة الشركة والعنوان */
        .print-report .pr-company { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 6px; }
        .print-report .pr-company img { width: 52px; height: 52px; object-fit: contain; }
        .print-report .pr-company span { font-size: 20px; font-weight: 800; color: #15803d; letter-spacing: 0.3px; }
        .print-report .pr-title { text-align: center; font-size: 19px; font-weight: 800; color: #14532d; margin-bottom: 2px; }
        .print-report .pr-sub { text-align: center; font-size: 11.5px; color: #6b7280; margin-bottom: 12px; font-weight: 500; }
        .print-report .pr-title-rule { height: 3px; width: 64px; background: #16a34a; border-radius: 2px; margin: 6px auto 14px; }

        .print-report .pr-meta {
          display: flex; justify-content: space-between; font-size: 11.5px;
          margin-bottom: 12px; padding: 8px 12px; background: #f0fdf4;
          border: 1px solid #bbf7d0; border-radius: 6px;
          width: 100%; box-sizing: border-box;
        }
        .print-report .pr-meta b { color: #166534; }
        /* نسخة بدون flex من شريط الشركة/الشعار، مخصّصة لترويسة صفحات
           التفاصيل (عنوان التقرير فوق كل صفحة) */
        .print-report .pr-company-flat {
          text-align: center; margin-bottom: 4px;
        }
        .print-report .pr-company-flat img {
          width: 40px; height: 40px; object-fit: contain;
          vertical-align: middle; margin-left: 8px;
        }
        .print-report .pr-company-flat span {
          font-size: 16px; font-weight: 800; color: #15803d;
          letter-spacing: 0.3px; vertical-align: middle;
        }
        .print-report .pr-detail-title-row th,
        .print-report .pr-detail-meta-row th { width: auto; }

        .print-report .pr-sup-name {
          font-weight: 800; font-size: 12.5px; color: #14532d;
          padding: 4px 2px; border-bottom: 1.5px solid #16a34a; margin: 10px 0 5px;
        }
        .print-report .pr-group-row td:first-child { text-align: right; font-weight: 600; }
        .print-report .pr-role-note { font-size: 10.5px; font-weight: 700; color: #1f2937; margin-top: 1px; }
        .print-report .pr-totals-row td { font-weight: 800; background: #dcfce7 !important; color: #14532d; }
        .print-report .pr-agent-subtotal-row td {
          font-weight: 700; background: #eef7f0 !important; color: #166534;
          text-align: right; padding-right: 12px;
        }
        .print-report .pr-agent-subtotal-row td:last-child { text-align: center; }

        .print-report .pr-grand-box {
          border: 1.5px solid #16a34a; border-radius: 8px;
          padding: 12px 16px; margin-top: 18px; background: #f9fafb;
        }
        .print-report .pr-grand-box .row { display:flex; justify-content: space-between; padding: 3px 0; font-size: 12.5px; color: #374151; }
        .print-report .pr-grand-box .row.total {
          font-weight: 800; font-size: 15px; color: #14532d;
          border-top: 1px dashed #86efac; margin-top: 5px; padding-top: 8px;
        }

        /* جدول التفاصيل: عنوان التقرير ورأس الجدول يتكرران تلقائياً في كل صفحة مطبوعة */
        .print-report .pr-detail-table thead { display: table-header-group; }
        .print-report .pr-detail-table tfoot { display: table-footer-group; }
        .print-report .pr-detail-table tr { page-break-inside: avoid; }
        /* كل مجموعة وكيل (صفوفه + صف إجماليه) بتترسم فى tbody مستقل، وممنوع
           يتقسّم على صفحتين — لو مش هيسّع فى الصفحة الحالية بيتلقّف كامل
           لأول الصفحة اللي بعدها (شوف تعليق DETAIL_ROWS_PER_PAGE فوق). */
        .print-report .pr-detail-table tbody.pr-agent-block {
          page-break-inside: avoid; break-inside: avoid;
        }
        .print-report .pr-detail-title-row th { background: #fff; border: none; padding: 0 0 4px; }
        .print-report .pr-detail-title-row .pr-title { margin-bottom: 0; }
        .print-report .pr-detail-meta-row th {
          background: #f0fdf4; color: #166534; font-weight: 700;
          border: 1px solid #bbf7d0; font-size: 11.5px;
        }

        /* تذييل ثابت أسفل كل صفحة مطبوعة على حدة. بدل الاعتماد على
           عنصر position: fixed واحد بيتكرر تلقائيًا (اللي بيديله رقم صفحة
           غلط لأن الـ counter بيتزوّد مرة واحدة بس مهما عدد الصفحات)،
           بنطبع تذييل مستقل تحت محتوى كل صفحة برقمها الصحيح المحسوب فعليًا. */
        .print-report .pr-footer {
          margin-top: 10px;
          text-align: center; font-size: 9.5px; color: #9ca3af;
          border-top: 1px solid #e5e7eb; padding-top: 4px;
        }

        /* خلفية شفافة (Watermark) بحجم الصفحة تقريبًا — عنصر واحد بس
           بـ position: fixed، مش مكرر يدويًا فوق كل صفحة. عند الطباعة
           الفعلية، عناصر position: fixed بتتكرر تلقائيًا فوق كل صفحة
           مطبوعة (نفس السلوك المستخدم أصلاً فوق فى تعليق التذييل)، فمفيش
           داعي لإضافتها جوه كل صفحة على حدة. z-index سالب + شفافية عالية
           (0.05) يضمنوا إنها تفضل خلفية بحتة تحت كل الجداول والنصوص ومتأثرش
           على قابلية القراءة أو أي تخطيط/ترقيم صفحات موجود حاليًا. */
        .print-report .pr-watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 150mm;
          height: 150mm;
          object-fit: contain;
          opacity: 0.05;
          z-index: -1;
          pointer-events: none;
        }

        /* نسخة إضافية من الخلفية مخصّصة لصفحة التجميعات (أول صفحة) فقط.
           السبب: عناصر position: fixed فى أغلب المتصفحات وقت الطباعة
           بترسم ابتداءً من الصفحة اللي بعد نقطة تعريفها، مش الصفحة اللي
           هي معرّفة فيها هي نفسها — فالخلفية اللي فوق (fixed) بتظهر صح فى
           كل الصفحات اللي بعد صفحة التجميعات، لكن مش فى صفحة التجميعات
           ذاتها. عشان كده بنضيف نسخة تانية بـ position: absolute (مش
           fixed) فى أول عنصر بالظبط قبل محتوى صفحة التجميعات — دي بترتسم
           فعليًا فى مكانها الطبيعي جوه تدفق الصفحة (يعني صفحة 1 بالظبط)
           بغض النظر عن أي تعامل خاص بالمتصفح مع fixed.
           ملحوظة: النسخة دي معمول لها z-index/opacity/pointer-events زي
           التانية بالظبط، فمفيش أي تأثير على قراءة المحتوى أو أي وظيفة
           طباعة تانية موجودة. */
        .print-report .pr-watermark-page1 {
          position: absolute;
          top: 133mm;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 150mm;
          height: 150mm;
          object-fit: contain;
          opacity: 0.05;
          z-index: -1;
          pointer-events: none;
        }
      `}</style>

      {branding.company_logo_url && (
        <>
          <img src={branding.company_logo_url} alt="" className="pr-watermark-page1" />
          <img src={branding.company_logo_url} alt="" className="pr-watermark" />
        </>
      )}

      {/* ══ صفحة 1: التجميعات (هيكل إداري بحت — بدون تفاصيل عملاء) ══ */}
      <div className="pr-company">
        {branding.company_logo_url && <img src={branding.company_logo_url} alt={branding.company_name} />}
        <span>{branding.company_name}</span>
      </div>
      <div className="pr-title">تقرير تقفيل الشهر</div>
      <div className="pr-sub">صفحة التجميعات</div>
      <div className="pr-title-rule" />
      <div className="pr-meta">
        <span><b>{supervisorRoleLabel}:</b> {supervisorName}</span>
        <span><b>الشهر:</b> {monthLabel}</span>
        {branchName && <span><b>الفرع:</b> {branchName}</span>}
        <span><b>تاريخ التقفيل:</b> {closingDate}</span>
      </div>

      {visibleSupervisors.map((sv, idx) => {
        const startsNewPage = idx > 0 && sv.role === 'general_supervisor';
        return (
          <div key={sv.id}>
            {startsNewPage && (
              <div className="pr-footer">
                {branding.company_name} · تقرير تقفيل الشهر — {monthLabel} · صفحة {aggPageNumbers[idx - 1]}
              </div>
            )}
            <div className={startsNewPage ? 'pr-page-break' : undefined} style={{ marginBottom: 10 }}>
              {startsNewPage && (
                <>
                  <div className="pr-company">
                    {branding.company_logo_url && <img src={branding.company_logo_url} alt={branding.company_name} />}
                    <span>{branding.company_name}</span>
                  </div>
                  <div className="pr-title">تقرير تقفيل الشهر</div>
                  <div className="pr-sub">صفحة التجميعات</div>
                  <div className="pr-title-rule" />
                  <div className="pr-meta">
                    <span><b>{supervisorRoleLabel}:</b> {supervisorName}</span>
                    <span><b>الشهر:</b> {monthLabel}</span>
                    {branchName && <span><b>الفرع:</b> {branchName}</span>}
                    <span><b>تاريخ التقفيل:</b> {closingDate}</span>
                  </div>
                </>
              )}
              <div className="pr-sup-name" style={{ margin: '8px 0 4px' }}>
                {ROLE_LABELS[sv.role]}: {sv.name}
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '32%' }}>البيان</th>
                    <th>إجمالي الجديد</th>
                    <th>إجمالي التحصيل</th>
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {sv.groupLeaders.map((gl) => (
                    <tr key={gl.id} className="pr-group-row">
                      <td>
                        {gl.name}
                        {gl.roleNote && <div className="pr-role-note">({gl.roleNote})</div>}
                      </td>
                      <td>{fmt(gl.production)}</td>
                      <td>{fmt(gl.collection)}</td>
                      <td>{fmt(gl.total)}</td>
                    </tr>
                  ))}
                  {sv.groupLeaders.length === 0 && (
                    <tr><td colSpan={4}>لا توجد مجموعات لهذا المراقب</td></tr>
                  )}
                  <tr className="pr-totals-row">
                    <td>إجمالي {sv.name}</td>
                    <td>{fmt(sv.production)}</td>
                    <td>{fmt(sv.collection)}</td>
                    <td>{fmt(sv.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {visibleSupervisors.length === 0 && (
        <p style={{ textAlign: 'center', margin: '20px 0' }}>لا توجد بيانات لهذا الشهر</p>
      )}

      <div className="pr-grand-box">
        <div className="row"><span>إجمالي {supervisorRoleLabel} — الإنتاج الجديد</span><span>{fmt(grandProduction)}</span></div>
        <div className="row"><span>إجمالي {supervisorRoleLabel} — التحصيل</span><span>{fmt(grandCollection)}</span></div>
        <div className="row total"><span>إجمالي {supervisorRoleLabel} — الإجمالي الكلي</span><span>{fmt(grandTotal)}</span></div>
      </div>

      <div className="pr-footer">
        {branding.company_name} · تقرير تقفيل الشهر — {monthLabel} · صفحة {totalAggPages}
      </div>

      {/* ══ الصفحة الثانية وما بعدها: عمليات السداد، مقسّمة لصفحات مستقلة ══
          كل صفحة جدول قائم بذاته وله ترويسته الخاصة (اسم المراقب + الشهر)
          ورقم صفحته الصحيح، بدل جدول واحد طويل بيعتمد على تكرار تلقائي
          ممكن يفشل بعد أول صفحة. */}
      {(() => {
        const detailGroups = buildDetailGroups(printDetailRows);
        const detailPages = paginateDetailGroups(detailGroups, DETAIL_ROWS_PER_PAGE);
        if (detailPages.length === 0) {
          return (
            <div className="pr-page-break">
              <table className="pr-detail-table">
                <thead>
                  <tr className="pr-detail-title-row">
                    <th colSpan={8}>
                      <div className="pr-company-flat">
                        {branding.company_logo_url && <img src={branding.company_logo_url} alt={branding.company_name} />}
                        <span>{branding.company_name}</span>
                      </div>
                      <div className="pr-title">تقرير تقفيل الشهر</div>
                    </th>
                  </tr>
                  <tr className="pr-detail-meta-row">
                    <th colSpan={3}>{supervisorRoleLabel}: {supervisorName}</th>
                    <th colSpan={3}>الشهر: {monthLabel}{branchName && ` — الفرع: ${branchName}`}</th>
                    <th colSpan={2}>تفاصيل عمليات السداد</th>
                  </tr>
                  <tr>
                    <th>المراقب</th>
                    <th>رئيس المجموعة</th>
                    <th>الوكيل</th>
                    <th>العميل</th>
                    <th>آخر 6 أرقام الوثيقة</th>
                    <th>رقم القسط</th>
                    <th>قيمة القسط</th>
                    <th>نوع العملية</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td colSpan={8}>لا توجد عمليات سداد مسجّلة لهذا الشهر</td></tr>
                </tbody>
              </table>
              <div className="pr-footer">
                {branding.company_name} · تقرير تقفيل الشهر — {monthLabel} · صفحة {totalAggPages + 1}
              </div>
            </div>
          );
        }

        return detailPages.map((rows, pageIdx) => {
          const pageNumber = pageIdx + totalAggPages + 1; // بعد كل صفحات التجميعات (ممكن تبقى أكتر من صفحة لو فيه أكتر من مراقب عام)
          const isLastPage = pageIdx === detailPages.length - 1;
          return (
            <div className="pr-page-break" key={pageIdx}>
              <table className="pr-detail-table">
                <thead>
                  <tr className="pr-detail-title-row">
                    <th colSpan={8}>
                      <div className="pr-company-flat">
                        {branding.company_logo_url && <img src={branding.company_logo_url} alt={branding.company_name} />}
                        <span>{branding.company_name}</span>
                      </div>
                      <div className="pr-title">تقرير تقفيل الشهر</div>
                    </th>
                  </tr>
                  <tr className="pr-detail-meta-row">
                    <th colSpan={3}>{supervisorRoleLabel}: {supervisorName}</th>
                    <th colSpan={3}>الشهر: {monthLabel}{branchName && ` — الفرع: ${branchName}`}</th>
                    <th colSpan={2}>تفاصيل عمليات السداد</th>
                  </tr>
                  <tr>
                    <th>المراقب</th>
                    <th>رئيس المجموعة</th>
                    <th>الوكيل</th>
                    <th>العميل</th>
                    <th>آخر 6 أرقام الوثيقة</th>
                    <th>رقم القسط</th>
                    <th>قيمة القسط</th>
                    <th>نوع العملية</th>
                  </tr>
                </thead>
                {chunkPageIntoAgentBlocks(rows).map((block, blockIdx) => (
                  <tbody className="pr-agent-block" key={blockIdx}>
                    {block.map((entry, i) => {
                      if (entry.kind === 'subtotal') {
                        return (
                          <tr key={i} className="pr-agent-subtotal-row">
                            <td colSpan={6}>إجمالي {subtotalLabel(entry)}</td>
                            <td colSpan={2}>{fmt(entry.amount)}</td>
                          </tr>
                        );
                      }
                      const r = entry.row;
                      return (
                        <tr key={i}>
                          <td>{r.supervisorName}</td>
                          <td>{r.groupLeaderName}</td>
                          <td>{r.agentName}</td>
                          <td style={{ textAlign: 'right' }}>{r.customerName}</td>
                          <td dir="ltr">{last6(r.policyNumber)}</td>
                          <td>{r.installmentNumber}</td>
                          <td>{fmt(r.amount)}</td>
                          <td>{r.type === 'new' ? 'جديد' : 'تحصيل'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
                {isLastPage && (
                  <tfoot>
                    <tr className="pr-totals-row">
                      <td colSpan={6}>الإجمالي الكلي لعمليات السداد</td>
                      <td colSpan={2}>{fmt(grandTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
              <div className="pr-footer">
                {branding.company_name} · تقرير تقفيل الشهر — {monthLabel} · صفحة {pageNumber}
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
}
