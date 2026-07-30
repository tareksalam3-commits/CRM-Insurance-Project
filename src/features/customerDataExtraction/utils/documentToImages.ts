// تحويل الصورة أو ملف الـ PDF المختار من المستخدم إلى صورة/صور (Data URL)
// جاهزة للإرسال لمنظومة الذكاء الاصطناعي عبر ai-gateway. لا يوجد أي OCR
// تقليدي هنا — فقط تجهيز الصورة (وتصغيرها لتقليل الحجم)، وتحليل المحتوى
// نفسه يتم بالكامل بواسطة نموذج الذكاء الاصطناعي.

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_DIMENSION = 1600;
const MAX_PDF_PAGES = 4;

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
  return canvas.toDataURL('image/jpeg', 0.85);
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
    urls.push(canvas.toDataURL('image/jpeg', 0.85));
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
