// تحويل الصورة أو ملف الـ PDF المختار من المستخدم إلى صورة/صور (Data URL)
// جاهزة للإرسال لمنظومة الذكاء الاصطناعي عبر ai-gateway. لا يوجد أي OCR
// تقليدي هنا — فقط تجهيز الصورة (وتصغيرها لتقليل الحجم)، وتحليل المحتوى
// نفسه يتم بالكامل بواسطة نموذج الذكاء الاصطناعي.
//
// كل صورة/صفحة ناتجة هنا تُضغَط تلقائياً وبشكل تدريجي (جودة ثم أبعاد) حتى
// تضمن أنها أقل من الحد الأقصى المسموح به فى ai-gateway (1 ميجابايت) —
// بدل الاعتماد على جودة ثابتة قد تتجاوز الحد أحياناً (خصوصاً مستندات
// ممسوحة ضوئياً كثيفة التفاصيل) فيُرفَض الاستيراد بالكامل رغم أن المستند
// نفسه سليم وصالح للقراءة.

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_DIMENSION = 1600;
const MAX_PDF_PAGES = 4;
// هامش أمان تحت حد الـ 1 ميجابايت الفعلي المفروض فى ai-gateway، لتجنب أي
// فارق تقريب بسيط بين الحسابين
const TARGET_MAX_BYTES = 950 * 1024;
const JPEG_QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4, 0.25];
const DOWNSCALE_STEPS = [1, 0.75, 0.5, 0.35];

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذر قراءة الصورة المختارة، جرّب صورة أخرى'));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('تعذر قراءة الملف المختار'));
    reader.readAsDataURL(file);
  });
}

function scaledSize(width: number, height: number, maxDim: number) {
  const ratio = Math.min(1, maxDim / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** الحجم الفعلي بالبايت لصورة Base64 (Data URL)، وليس طول النص نفسه */
function base64ByteSize(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const len = b64.length;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

function downscaleCanvas(source: HTMLCanvasElement, ratio: number): HTMLCanvasElement {
  if (ratio >= 1) return source;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(source.width * ratio));
  out.height = Math.max(1, Math.round(source.height * ratio));
  const ctx = out.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/**
 * يضغط الكانفاس تدريجياً (جودة أولاً، ثم تصغير الأبعاد إن لزم) حتى يصل
 * الناتج تحت TARGET_MAX_BYTES. فى أسوأ الحالات (مستند كثيف جداً حتى عند
 * أقل جودة وأصغر أبعاد مجرَّبة) يُعاد أقل ناتج تم الوصول إليه بدل رفض
 * الصفحة بالكامل — أفضل مجهود ممكن بدل فقد الصفحة من الاستيراد.
 */
function compressCanvasToDataUrl(canvas: HTMLCanvasElement, maxBytes: number): string {
  let best: string | null = null;
  for (const scale of DOWNSCALE_STEPS) {
    const working = downscaleCanvas(canvas, scale);
    for (const quality of JPEG_QUALITY_STEPS) {
      const url = working.toDataURL('image/jpeg', quality);
      if (!best || base64ByteSize(url) < base64ByteSize(best)) best = url;
      if (base64ByteSize(url) <= maxBytes) return url;
    }
  }
  return best as string;
}

async function imageFileToDataUrl(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file);
  const img = await loadImageElement(original);
  const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight, MAX_DIMENSION);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;

  ctx.drawImage(img, 0, 0, width, height);
  return compressCanvasToDataUrl(canvas, TARGET_MAX_BYTES);
}

async function pdfFileToDataUrls(file: File): Promise<string[]> {
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new Error('تعذر قراءة ملف الـ PDF المختار');
  }

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise.catch(() => {
    throw new Error('ملف الـ PDF غير مدعوم أو تالف');
  });

  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const urls: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(baseViewport.width, baseViewport.height)) || 1;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    await page.render({ canvasContext: ctx, viewport }).promise;
    urls.push(compressCanvasToDataUrl(canvas, TARGET_MAX_BYTES));
  }

  if (urls.length === 0) {
    throw new Error('تعذر قراءة صفحات ملف الـ PDF');
  }
  return urls;
}

export type ExtractionFileKind = 'image' | 'pdf';

/** يحوّل ملف الصورة أو الـ PDF المختار إلى صورة/صور Data URL جاهزة للإرسال لمنظومة الذكاء الاصطناعي */
export async function documentFileToImages(file: File, kind: ExtractionFileKind): Promise<string[]> {
  if (kind === 'pdf') {
    return pdfFileToDataUrls(file);
  }
  return [await imageFileToDataUrl(file)];
}
