import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { supabase, POLICY_TYPE_LABELS, PAYMENT_METHOD_LABELS, MARITAL_STATUS_LABELS, type User } from '../../../lib/supabase';
import { fetchAgentsForCurrentUser } from '../../Customers/services/customersService';
import { IMPORT_COLUMNS, type ImportColumnKey, type ParsedRow, type ImportRowPayload, type RowResult, type ImportSummary } from '../types';

export interface ImportAgent {
  id: string;
  name: string;
}

// ===================================================================
// 1) تحميل نموذج Excel
// ===================================================================
export function downloadTemplateFile() {
  const headers = IMPORT_COLUMNS.map((c) => (c.required ? `${c.header} *` : c.header));

  const exampleRow = [
    'أحمد محمد علي',
    '29001011234567',
    '01012345678',
    'القاهرة - مدينة نصر',
    '1990-01-01',
    'مهندس',
    'أعزب/عزباء',
    'اسم الوكيل هنا',
    'POL-000123',
    'الرباعية',
    '100000',
    '500',
    'شهري',
    '2024-01-15',
    'ملاحظات اختيارية'
  ];

  const sheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  sheet['!cols'] = headers.map(() => ({ wch: 20 }));

  const notesLines = [
    ['ملاحظات مهمة قبل التعبئة:'],
    ['- الأعمدة المُعلَّمة بعلامة * إلزامية، والباقي اختياري.'],
    ['- كل صف يمثل وثيقة واحدة (عميل واحد + وثيقة واحدة).'],
    ['- احذف صف المثال قبل رفع الملف، أو استبدله ببياناتك.'],
    [''],
    ['القيم المسموحة لعمود "نوع الوثيقة":'],
    ...Object.values(POLICY_TYPE_LABELS).map((v) => [v]),
    [''],
    ['القيم المسموحة لعمود "طريقة السداد":'],
    ...Object.values(PAYMENT_METHOD_LABELS).map((v) => [v]),
    [''],
    ['القيم المسموحة لعمود "الحالة الاجتماعية" (اختياري):'],
    ...Object.values(MARITAL_STATUS_LABELS).map((v) => [v]),
    [''],
    ['صيغة التواريخ المقبولة: yyyy-mm-dd أو dd/mm/yyyy (أو تاريخ خلية Excel عادي).'],
    ['اسم الوكيل يجب أن يطابق اسم وكيل موجود بالفعل في النظام ونشط وتابع لك في الهيكل الإداري.'],
  ];
  const notesSheet = XLSX.utils.aoa_to_sheet(notesLines);
  notesSheet['!cols'] = [{ wch: 60 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'استيراد البيانات');
  XLSX.utils.book_append_sheet(wb, notesSheet, 'تعليمات');

  XLSX.writeFile(wb, 'نموذج-استيراد-البيانات.xlsx');
}

// ===================================================================
// 1ب) جلب قائمة الوكلاء (فريق المستورِد) لمطابقة "اسم الوكيل" في الملف
//     محلياً قبل الإرسال، بدل ما نكتشف الخطأ بعد محاولة كل صف على حدة
//     في السيرفر. بنعيد استخدام نفس الدالة المستخدمة في صفحة العملاء
//     (fetchAgentsForCurrentUser) عشان نفس نطاق الفريق بالظبط.
// ===================================================================
export async function fetchImportAgents(user: User): Promise<ImportAgent[]> {
  try {
    const all = await fetchAgentsForCurrentUser(user, null);
    return (all || [])
      .filter((u: any) => u.role === 'agent' || u.role === 'premium_agent')
      .map((u: any) => ({ id: u.id, name: u.name as string }));
  } catch {
    // لو فشل الجلب لأي سبب، منمنعش المستخدم من الاستيراد — هنرجع قائمة
    // فاضية وهيتم تجاوز التحقق المحلي من اسم الوكيل، وتبقى المطابقة
    // النهائية زي زمان بالكامل من طرف السيرفر (RPC) فقط
    return [];
  }
}

const ARABIC_DIACRITICS_RE = /[\u064B-\u0652\u0670\u0640]/g; // تشكيل + تطويل

// توحيد أشكال الحروف العربية المختلفة اللي بتمثل نفس الحرف صوتياً، عشان
// نقدر نتجاهل فروق الكتابة (أ/إ/آ/ا، ة/ه، ى/ي) لما نقارن اسم الوكيل
// المكتوب في الإكسل باسمه المسجل فعلياً في النظام
function normalizeArabicForMatch(value: any): string {
  return normalizeDigitsText(value)
    .replace(ARABIC_DIACRITICS_RE, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const currRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow.push(Math.min(
        prevRow[j] + 1,      // حذف
        currRow[j - 1] + 1,  // إضافة
        prevRow[j - 1] + cost // استبدال
      ));
    }
    prevRow = currRow;
  }
  return prevRow[b.length];
}

function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

export interface AgentMatchResult {
  agent: ImportAgent | null; // موجود فقط لو تطابق كامل (بعد التطبيع)
  suggestions: ImportAgent[]; // أقرب 3 أسماء لو مفيش تطابق كامل
}

const FUZZY_SUGGESTION_THRESHOLD = 0.55;

// مطابقة اسم الوكيل المكتوب في الإكسل بقائمة وكلاء فريق المستورِد:
// 1) تطابق كامل بعد تطبيع الحروف العربية → يُعتمد تلقائياً (بديل الاسم
//    المكتوب باسمه الرسمي المسجّل في النظام حرفياً، لضمان نجاح المطابقة
//    الصارمة في السيرفر حتى لو كان فيه فرق تشكيل/همزة بسيط).
// 2) بدون تطابق كامل → نرجّع أقرب أسماء (تشابه ≥ 55%) كاقتراحات ضمن رسالة
//    الخطأ، من غير ما نختار بدل المستخدم أبداً (تفادياً لتعيين وثيقة لوكيل
//    غلط)، عشان يقدر يصلّح الإكسل بسرعة بدل التخمين.
function matchAgentName(inputName: string, agents: ImportAgent[]): AgentMatchResult {
  const normalizedInput = normalizeArabicForMatch(inputName);

  const exact = agents.find((a) => normalizeArabicForMatch(a.name) === normalizedInput);
  if (exact) return { agent: exact, suggestions: [] };

  const scored = agents
    .map((a) => ({ agent: a, score: similarityRatio(normalizedInput, normalizeArabicForMatch(a.name)) }))
    .filter((s) => s.score >= FUZZY_SUGGESTION_THRESHOLD)
    .sort((x, y) => y.score - x.score)
    .slice(0, 3)
    .map((s) => s.agent);

  return { agent: null, suggestions: scored };
}

// ===================================================================
// 2) قراءة وتحقق ملف Excel المرفوع
// ===================================================================

const POLICY_TYPE_REVERSE = buildReverseMap(POLICY_TYPE_LABELS);
const PAYMENT_METHOD_REVERSE = buildReverseMap(PAYMENT_METHOD_LABELS);
const MARITAL_STATUS_REVERSE = buildReverseMap(MARITAL_STATUS_LABELS);

interface DateNativeOverrides {
  birth_date?: any;
  start_date?: any;
}

// منطق التحقق/البناء الخاص بصف واحد — دالة واحدة مشتركة تُستخدم مرتين:
// 1) أثناء تحليل الملف لأول مرة (parseWorkbookFile)
// 2) بعد ما المستخدم يعدّل أي خلية يدوياً في شاشة المعاينة (revalidateRow)،
// عشان نتأكد إن نفس قواعد التحقق مطبّقة بالظبط في الحالتين من غير تكرار كود
function buildParsedRow(
  rowNumber: number,
  raw: Record<string, any>,
  agents: ImportAgent[],
  nativeDates: DateNativeOverrides = {}
): ParsedRow {
  const get = (key: ImportColumnKey) => raw[key];
  const errors: string[] = [];

  const customerName = normalizeText(get('customer_name'));
  if (!customerName) errors.push('اسم العميل مطلوب');

  const agentNameInput = normalizeText(get('agent_name'));
  let agentName = agentNameInput;
  if (!agentNameInput) {
    errors.push('اسم الوكيل مطلوب');
  } else if (agents.length > 0) {
    // عندنا قائمة فريق المستورِد فعلاً → نطابق محلياً بدل ما ننتظر رفض
    // السيرفر لكل صف. لو الاسم مطابق (حتى مع فروق تشكيل/همزة بسيطة)،
    // بنستبدله باسمه الرسمي المسجّل في النظام لضمان نجاح المطابقة الصارمة
    // في import_policy_row
    const { agent, suggestions } = matchAgentName(agentNameInput, agents);
    if (agent) {
      agentName = agent.name;
    } else if (suggestions.length > 0) {
      errors.push(`اسم الوكيل "${agentNameInput}" غير موجود ضمن فريقك. هل تقصد: ${suggestions.map((s) => s.name).join('، ')}؟`);
    } else {
      errors.push(`اسم الوكيل "${agentNameInput}" غير موجود ضمن فريقك أو غير نشط`);
    }
  }
  // لو مفيش قائمة وكلاء متاحة (فشل الجلب)، نتجاوز التحقق المحلي بالكامل
  // ونسيب المطابقة النهائية للسيرفر زي السلوك القديم تماماً

  const policyNumber = normalizeDigitsText(get('policy_number'));
  if (!policyNumber) errors.push('رقم الوثيقة مطلوب');

  const policyTypeInput = normalizeText(get('policy_type'));
  const policyType = policyTypeInput ? POLICY_TYPE_REVERSE.get(normalizeText(policyTypeInput)) : undefined;
  if (!policyTypeInput) errors.push('نوع الوثيقة مطلوب');
  else if (!policyType) errors.push(`نوع الوثيقة غير معروف: "${policyTypeInput}"`);

  const paymentMethodInput = normalizeText(get('payment_method'));
  const paymentMethod = paymentMethodInput ? PAYMENT_METHOD_REVERSE.get(normalizeText(paymentMethodInput)) : undefined;
  if (!paymentMethodInput) errors.push('طريقة السداد مطلوبة');
  else if (!paymentMethod) errors.push(`طريقة السداد غير معروفة: "${paymentMethodInput}"`);

  const sumAssuredCell = get('sum_assured');
  const sumAssured = parseFlexibleNumber(sumAssuredCell);
  if (sumAssuredCell === '' || sumAssuredCell === null || sumAssuredCell === undefined) errors.push('مبلغ التأمين مطلوب');
  else if (sumAssured === null || sumAssured <= 0) errors.push('مبلغ التأمين غير صحيح');

  const premiumCell = get('premium_amount');
  const premiumAmount = parseFlexibleNumber(premiumCell);
  if (premiumCell === '' || premiumCell === null || premiumCell === undefined) {
    errors.push('قيمة القسط الصافي مطلوبة');
  } else if (premiumAmount === null || premiumAmount <= 0) {
    errors.push('قيمة القسط الصافي غير صحيحة');
  }

  const startDate = parseFlexibleDate(nativeDates.start_date !== undefined ? nativeDates.start_date : get('start_date'));
  if (!normalizeText(get('start_date'))) errors.push('تاريخ بداية التأمين مطلوب');
  else if (!startDate) errors.push('تاريخ بداية التأمين غير صحيح');

  // اختياري: الحالة الاجتماعية
  const maritalStatusInput = normalizeText(get('marital_status'));
  let maritalStatus: string | undefined;
  if (maritalStatusInput) {
    maritalStatus = MARITAL_STATUS_REVERSE.get(normalizeText(maritalStatusInput));
    if (!maritalStatus) errors.push(`الحالة الاجتماعية غير معروفة: "${maritalStatusInput}"`);
  }

  // اختياري: تاريخ الميلاد
  const birthDateInput = normalizeText(get('birth_date'));
  let birthDate: Date | null = null;
  if (birthDateInput) {
    birthDate = parseFlexibleDate(nativeDates.birth_date !== undefined ? nativeDates.birth_date : get('birth_date'));
    if (!birthDate) errors.push('تاريخ الميلاد غير صحيح');
  }

  const clientError = errors.length > 0 ? errors.join(' — ') : null;

  let payload: ImportRowPayload | null = null;
  if (!clientError && policyType && paymentMethod && startDate && sumAssured !== null && premiumAmount !== null) {
    payload = {
      p_customer_name: customerName,
      p_national_id: normalizeDigitsText(get('national_id')) || null,
      p_phone: normalizeDigitsText(get('phone')) || null,
      p_address: normalizeText(get('address')) || null,
      p_birth_date: birthDate ? dateToDbString(birthDate) : null,
      p_occupation: normalizeText(get('occupation')) || null,
      p_marital_status: maritalStatus || null,
      p_agent_name: agentName,
      p_policy_number: policyNumber,
      p_policy_type: policyType,
      p_sum_assured: sumAssured,
      p_premium_amount: premiumAmount,
      p_payment_method: paymentMethod,
      p_start_date: dateToDbString(startDate),
      p_notes: normalizeText(get('notes')) || null,
    };
  }

  return { rowNumber, raw, payload, clientError };
}

// تُستدعى من واجهة المعاينة بعد ما المستخدم يعدّل أي خلية يدوياً في صف،
// عشان نعيد التحقق منه فوراً من غير الحاجة لإعادة رفع الملف كله من الأول
export function revalidateRow(row: ParsedRow, agents: ImportAgent[] = []): ParsedRow {
  return buildParsedRow(row.rowNumber, row.raw, agents);
}

function buildReverseMap(labels: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  Object.entries(labels).forEach(([code, label]) => {
    map.set(normalizeText(label), code);
    map.set(normalizeText(code), code); // يسمح أيضاً بكتابة القيمة الإنجليزية للكود مباشرة
  });
  return map;
}

function normalizeText(value: any): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeDigitsText(value: any): string {
  return toEnglishDigits(normalizeText(value));
}

function normalizeHeaderCell(value: any): string {
  // إزالة علامة "*" وأي مسافات زائدة عشان مطابقة العنوان تنجح حتى لو
  // المستخدم سايب علامة الإلزامية من النموذج كما هي
  return normalizeText(value).replace(/\*$/, '').trim();
}

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

function toEnglishDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (d) => ARABIC_INDIC_DIGITS[d] ?? d);
}

function parseFlexibleNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = toEnglishDigits(String(value)).replace(/[,\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function excelSerialToDate(serial: number): Date {
  // نفس منطق SheetJS الداخلي لتحويل الرقم التسلسلي لتاريخ Excel لكائن Date
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000);
}

function parseFlexibleDate(value: any): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const d = excelSerialToDate(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = toEnglishDigits(String(value)).trim();
  if (!str) return null;

  // yyyy-mm-dd أو yyyy/mm/dd
  let m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  // dd-mm-yyyy أو dd/mm/yyyy
  m = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function dateToDbString(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// ===================================================================
// كشف عمود/أعمدة "القسط" بمرونة — ملفات العملاء الحقيقية غالباً مش
// موافقة لنموذج الاستيراد الرسمي بالظبط، وممكن يكون فيها أكتر من عمود
// بيمثل القسط (قسط شهري / ربع سنوي / سنوي / صافي...). القاعدة:
// - لو فيه عمود اسمه "القسط الصافي" بالظبط، بناخد قيمته دايماً.
// - غير كده، بناخد أقل قيمة صحيحة (أكبر من صفر) بين كل الأعمدة اللي
//   اسمها يحتوي كلمة "قسط" (مع استبعاد أعمدة التواريخ زي "تاريخ استحقاق
//   القسط" اللي بتحتوي كلمة "قسط" برضو لكنها مش قيمة مالية).
const PREMIUM_KEYWORD = 'قسط';
const PREMIUM_DATE_EXCLUSION_KEYWORD = 'تاريخ';
const PREMIUM_NET_HEADER = 'القسط الصافي';

function findPremiumColumnIndices(headerRow: string[]): number[] {
  return headerRow.reduce<number[]>((acc, h, idx) => {
    if (h.includes(PREMIUM_KEYWORD) && !h.includes(PREMIUM_DATE_EXCLUSION_KEYWORD)) {
      acc.push(idx);
    }
    return acc;
  }, []);
}

function extractPremiumAmount(
  rowFormatted: any[],
  premiumColumnIndices: number[],
  premiumNetIndex: number
): number | null {
  if (premiumNetIndex !== -1) {
    return parseFlexibleNumber(rowFormatted[premiumNetIndex]);
  }
  const values = premiumColumnIndices
    .map((idx) => parseFlexibleNumber(rowFormatted[idx]))
    .filter((v): v is number => v !== null && v > 0);
  if (values.length === 0) return null;
  return Math.min(...values);
}

export interface ParseResult {
  rows: ParsedRow[];
  headerError: string | null;
}

export async function parseWorkbookFile(file: File, agents: ImportAgent[] = []): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], headerError: 'الملف لا يحتوي على أي ورقة بيانات' };
  }
  const sheet = workbook.Sheets[sheetName];
  const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });

  if (aoa.length === 0) {
    return { rows: [], headerError: 'الملف فارغ' };
  }

  const headerRow = aoa[0].map(normalizeHeaderCell);
  const columnIndexByKey = new Map<ImportColumnKey, number>();
  const missingHeaders: string[] = [];

  // عمود القسط بيتم اكتشافه بمرونة (أسفل)، مش بمطابقة عنوان واحد ثابت،
  // عشان نقدر نستوعب ملفات فيها أكتر من عمود قسط أو تسمية مختلفة
  IMPORT_COLUMNS.forEach((col) => {
    if (col.key === 'premium_amount') return;
    const idx = headerRow.findIndex((h) => h === col.header);
    if (idx === -1) {
      missingHeaders.push(col.header);
    } else {
      columnIndexByKey.set(col.key, idx);
    }
  });

  if (missingHeaders.length > 0) {
    return {
      rows: [],
      headerError: `الملف لا يطابق نموذج الاستيراد. الأعمدة الناقصة: ${missingHeaders.join('، ')}`
    };
  }

  const premiumColumnIndices = findPremiumColumnIndices(headerRow);
  const premiumNetIndex = headerRow.findIndex((h) => h === PREMIUM_NET_HEADER);

  if (premiumColumnIndices.length === 0) {
    return {
      rows: [],
      headerError: 'الملف لا يحتوي على أي عمود يمثل قيمة القسط الصافي (مثال: "قيمة القسط الصافي" أو "القسط الصافي")'
    };
  }

  // نعيد القراءة raw:true عشان نقدر نميّز خلايا التاريخ/الرقم الحقيقية عن النصوص
  const aoaRaw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: false });

  const rows: ParsedRow[] = [];

  for (let r = 1; r < aoa.length; r++) {
    const rowFormatted = aoa[r];
    const rowRaw = aoaRaw[r] ?? rowFormatted;
    const rowNumber = r + 1; // رقم الصف كما يظهر فعلياً في Excel (1 = صف العناوين)

    const isEmptyRow = rowFormatted.every((cell) => normalizeText(cell) === '');
    if (isEmptyRow) continue;

    const get = (key: ImportColumnKey) => rowFormatted[columnIndexByKey.get(key)!];
    const getRaw = (key: ImportColumnKey) => rowRaw[columnIndexByKey.get(key)!];

    const raw: Record<string, any> = {};
    IMPORT_COLUMNS.forEach((col) => {
      if (col.key === 'premium_amount') return;
      raw[col.key] = get(col.key);
    });

    const premiumAmount = extractPremiumAmount(rowFormatted, premiumColumnIndices, premiumNetIndex);
    raw['premium_amount'] = premiumAmount;

    const startDateRaw = getRaw('start_date');
    const birthDateRaw = getRaw('birth_date');

    const row = buildParsedRow(rowNumber, raw, agents, {
      start_date: startDateRaw === '' ? undefined : startDateRaw,
      birth_date: birthDateRaw === '' ? undefined : birthDateRaw,
    });

    rows.push(row);
  }

  return { rows, headerError: null };
}

// ===================================================================
// 4) تصدير تقرير الأخطاء بعد الاستيراد كملف Excel — يسهّل تصحيح الصفوف
//    الفاشلة بره الشاشة (مشاركته مع حد تاني، أو مقارنته بالملف الأصلي)
// ===================================================================
export function exportErrorReport(summary: ImportSummary) {
  const failedRows = summary.results.filter((r) => r.status === 'error');
  if (failedRows.length === 0) return;

  const headers = ['رقم الصف', 'اسم العميل', 'رقم الوثيقة', 'سبب الفشل'];
  const dataRows = failedRows.map((r) => [
    r.rowNumber,
    r.customerName || '',
    r.policyNumber || '',
    r.errorMessage || ''
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  sheet['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 60 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'أخطاء الاستيراد');
  XLSX.writeFile(wb, 'تقرير-أخطاء-الاستيراد.xlsx');
}

// ===================================================================
// 5) تنفيذ الاستيراد — Pool من عدة Workers متوازية (بدل صف واحد في المرة)
//    كل صف = Transaction مستقلة تماماً في الخادم (import_policy_row بتعمل
//    INSERT جديد للعميل + الوثيقة في كل استدعاء، وأي تعارض زي رقم وثيقة أو
//    رقم قومي مكرر بيتضبط بقيد UNIQUE في قاعدة البيانات نفسها بغض النظر عن
//    ترتيب/توقيت الاستدعاءات)، فتشغيلها بالتوازي آمن تماماً ومفيهوش خطر
//    تضارب بيانات، وبيقلل زمن الاستيراد الكلي بشكل كبير خصوصاً في الملفات
//    الكبيرة (الزمن أساساً هو زمن ذهاب/رجوع الشبكة لكل RPC، مش معالجة فعلية)
// ===================================================================
const IMPORT_CONCURRENCY = 5;

export async function importRows(
  rows: ParsedRow[],
  onRowDone: (result: RowResult, doneCount: number, totalCount: number) => void
): Promise<ImportSummary> {
  const results: RowResult[] = [];
  const rowsToProcess = rows.filter((r) => r.payload !== null);
  const skippedAsErrors: RowResult[] = rows
    .filter((r) => r.payload === null)
    .map((r) => ({
      rowNumber: r.rowNumber,
      customerName: normalizeText(r.raw['customer_name']),
      policyNumber: normalizeText(r.raw['policy_number']),
      status: 'error' as const,
      errorMessage: r.clientError || 'بيانات الصف غير صحيحة'
    }));

  results.push(...skippedAsErrors);

  let done = 0;
  const total = rows.length;
  skippedAsErrors.forEach((r) => onRowDone(r, ++done, total));

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < rowsToProcess.length) {
      const row = rowsToProcess[nextIndex++];
      const payload = row.payload!;
      try {
        const { error } = await supabase.rpc('import_policy_row', payload);
        if (error) throw error;

        const result: RowResult = {
          rowNumber: row.rowNumber,
          customerName: payload.p_customer_name,
          policyNumber: payload.p_policy_number,
          status: 'success'
        };
        results.push(result);
        onRowDone(result, ++done, total);
      } catch (err: any) {
        const result: RowResult = {
          rowNumber: row.rowNumber,
          customerName: payload.p_customer_name,
          policyNumber: payload.p_policy_number,
          status: 'error',
          errorMessage: err?.message || 'حدث خطأ غير متوقع أثناء استيراد هذا الصف'
        };
        results.push(result);
        onRowDone(result, ++done, total);
      }
    }
  }

  const workerCount = Math.min(IMPORT_CONCURRENCY, rowsToProcess.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  results.sort((a, b) => a.rowNumber - b.rowNumber);

  const importedCount = results.filter((r) => r.status === 'success').length;
  const failedCount = results.filter((r) => r.status === 'error').length;

  return { totalRows: rows.length, importedCount, failedCount, results };
}
