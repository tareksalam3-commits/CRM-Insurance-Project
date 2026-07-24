// أعمدة ملف Excel — بالترتيب المطلوب بالضبط. أي تعديل هنا لازم يتزامن مع
// نفس الترتيب في generateTemplateFile() و parseWorkbook() في service الملف.
export const IMPORT_COLUMNS = [
  { key: 'customer_name', header: 'اسم العميل', required: true },
  { key: 'national_id', header: 'الرقم القومي', required: false },
  { key: 'phone', header: 'رقم الهاتف', required: false },
  { key: 'address', header: 'العنوان', required: false },
  { key: 'birth_date', header: 'تاريخ الميلاد', required: false },
  { key: 'occupation', header: 'المهنة', required: false },
  { key: 'marital_status', header: 'الحالة الاجتماعية', required: false },
  { key: 'agent_name', header: 'اسم الوكيل', required: true },
  { key: 'policy_number', header: 'رقم الوثيقة', required: true },
  { key: 'policy_type', header: 'نوع الوثيقة', required: true },
  { key: 'sum_assured', header: 'مبلغ التأمين', required: true },
  { key: 'premium_amount', header: 'قيمة القسط الصافي', required: true },
  { key: 'payment_method', header: 'طريقة السداد', required: true },
  { key: 'start_date', header: 'تاريخ بداية التأمين', required: true },
  { key: 'notes', header: 'الملاحظات', required: false },
] as const;

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number]['key'];

export type RawImportRow = Record<ImportColumnKey, string>;

export interface ParsedRow {
  rowNumber: number; // رقم الصف في ملف Excel (بما فيه صف العناوين، عشان يطابق ما يراه المستخدم فعلياً في الملف)
  raw: Record<string, any>;
  // بيانات جاهزة للإرسال لدالة import_policy_row، أو null لو الصف فشل في التحقق قبل الإرسال أصلاً
  payload: ImportRowPayload | null;
  clientError: string | null; // خطأ تحقق من طرف الواجهة (قبل استدعاء الخادم)
}

export interface ImportRowPayload {
  p_customer_name: string;
  p_national_id: string | null;
  p_phone: string | null;
  p_address: string | null;
  p_birth_date: string | null; // yyyy-MM-dd
  p_occupation: string | null;
  p_marital_status: string | null;
  p_agent_name: string;
  p_policy_number: string;
  p_policy_type: string;
  p_sum_assured: number;
  p_premium_amount: number;
  p_payment_method: string;
  p_start_date: string; // yyyy-MM-dd
  p_notes: string | null;
}

export interface RowResult {
  rowNumber: number;
  customerName: string;
  policyNumber: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface ImportSummary {
  totalRows: number;
  importedCount: number; // عدد العملاء = عدد الوثائق المستوردة
  failedCount: number;
  results: RowResult[];
}
