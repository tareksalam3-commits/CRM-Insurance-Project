import { useRef, useState, type RefObject } from 'react';
import { Sparkles, Camera, Image as ImageIcon, FileText, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { UseFormSetValue } from 'react-hook-form';
import { AppBottomSheet } from '../../../components/ui/AppBottomSheet';
import type { CustomerFormData } from '../../../pages/Customers/types';
import { extractFormFieldSchema } from '../utils/formFieldSchema';
import { documentFileToImages, type ExtractionFileKind } from '../utils/documentToImages';
import { clearAllHighlights, highlightLowConfidenceFields } from '../utils/highlightFields';
import { extractCustomerDataFromDocument } from '../services/customerExtractionService';
import type { DetectedFormField } from '../types';

interface ExtractDataButtonProps {
  formRef: RefObject<HTMLFormElement>;
  setValue: UseFormSetValue<CustomerFormData>;
}

type ExtractionStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; filledCount: number; reviewCount: number }
  | { kind: 'error'; message: string };

function coerceValueForField(field: DetectedFormField, value: string): unknown {
  return field.inputType === 'number' ? Number(value) : value;
}

// زر "استخراج البيانات" — يظهر فقط فى حالة إضافة عميل جديد (لا يظهر فى
// تعديل عميل موجود). يفتح شيت لاختيار مصدر المستند، ثم يقرأ حقول النموذج
// الحالي ديناميكياً من الـ DOM (formRef) ويستخدم منظومة الذكاء الاصطناعي
// المركزية (askAI) لملء النموذج فقط — بدون أي حفظ تلقائي فى قاعدة البيانات.
export function ExtractDataButton({ formRef, setValue }: ExtractDataButtonProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [status, setStatus] = useState<ExtractionStatus>({ kind: 'idle' });

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  function openPicker(inputRef: RefObject<HTMLInputElement>) {
    setSheetOpen(false);
    inputRef.current?.click();
  }

  async function handleFileSelected(file: File | undefined, kind: ExtractionFileKind) {
    if (!file) return;

    const formEl = formRef.current;
    if (!formEl) {
      setStatus({ kind: 'error', message: 'تعذر الوصول إلى نموذج العميل، أعد فتح الشاشة وحاول مرة أخرى' });
      return;
    }

    clearAllHighlights(formEl);
    setStatus({ kind: 'loading' });

    try {
      const fields = extractFormFieldSchema(formEl);
      const images = await documentFileToImages(file, kind);
      const result = await extractCustomerDataFromDocument(images, fields);

      const fieldsByName = new Map(fields.map((f) => [f.name, f]));
      const entries = Object.entries(result.fields);

      if (entries.length === 0) {
        setStatus({ kind: 'error', message: 'لم يتم التعرف على أي بيانات مطابقة لحقول النموذج داخل هذا المستند' });
        return;
      }

      const reviewFieldNames: string[] = [];
      for (const [name, { value, confidence }] of entries) {
        const field = fieldsByName.get(name);
        if (!field) continue;
        setValue(name as keyof CustomerFormData, coerceValueForField(field, value) as never, {
          shouldValidate: true,
          shouldDirty: true,
        });
        if (confidence === 'low') reviewFieldNames.push(name);
      }

      highlightLowConfidenceFields(formEl, reviewFieldNames);
      setStatus({ kind: 'success', filledCount: entries.length, reviewCount: reviewFieldNames.length });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء استخراج البيانات',
      });
    }
  }

  const loading = status.kind === 'loading';

  return (
    <div className="form-group">
      <button
        type="button"
        disabled={loading}
        onClick={() => setSheetOpen(true)}
        className="btn btn-outline btn-sm w-full sm:w-auto"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        <span>{loading ? 'جاري استخراج البيانات...' : 'استخراج البيانات'}</span>
      </button>

      {/* حقول اختيار الملفات مخفية — يتم تفعيلها برمجياً حسب اختيار المستخدم فى الشيت */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void handleFileSelected(file, 'image');
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void handleFileSelected(file, 'image');
        }}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void handleFileSelected(file, 'pdf');
        }}
      />

      {status.kind === 'success' && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-success-50 border border-success-200 p-3 text-sm text-success-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            تم ملء {status.filledCount} حقل من المستند.
            {status.reviewCount > 0 && (
              <> يرجى مراجعة الحقول المميزة بإطار برتقالي ({status.reviewCount}) قبل الحفظ.</>
            )}
          </p>
        </div>
      )}

      {status.kind === 'error' && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-error-50 border border-error-200 p-3 text-sm text-error-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="flex-1">{status.message}</p>
          <button type="button" onClick={() => setStatus({ kind: 'idle' })} className="shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {sheetOpen && (
        <AppBottomSheet title="استخراج البيانات" subtitle={<p className="text-xs text-secondary-500 mt-0.5">اختر مصدر المستند</p>} onClose={() => setSheetOpen(false)}>
          <button type="button" onClick={() => openPicker(cameraInputRef)} className="dropdown-item w-full">
            <Camera className="w-4 h-4" />
            <span>التقاط صورة بالكاميرا</span>
          </button>
          <button type="button" onClick={() => openPicker(galleryInputRef)} className="dropdown-item w-full">
            <ImageIcon className="w-4 h-4" />
            <span>اختيار صورة من الجهاز</span>
          </button>
          <button type="button" onClick={() => openPicker(pdfInputRef)} className="dropdown-item w-full">
            <FileText className="w-4 h-4" />
            <span>رفع ملف PDF</span>
          </button>
        </AppBottomSheet>
      )}
    </div>
  );
}
