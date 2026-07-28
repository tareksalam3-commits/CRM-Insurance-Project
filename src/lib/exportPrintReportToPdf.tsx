import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';

// ─────────────────────────────────────────────────────────────────────────
// خلفية المشكلة: كنا بنعتمد على window.open() + document.write() +
// window.print() (شوف printReportWindow.tsx) عشان نطبع، وده بيسلّم آخر
// خطوة (توليد الـ PDF نفسه) لمحرك الطباعة بتاع نظام التشغيل/المتصفح.
// على الموبايل (خصوصًا Android، وأكتر لو التطبيق شغال جوه WebView مش
// Chrome كامل) الخطوة دي بتفشل أحيانًا برسالة عامة ("حدثت مشكلة أثناء
// طباعة الصفحة") من غير أي تفاصيل، خصوصًا مع تقارير طويلة (أكتر من صفحة)
// زي تقرير تقفيل الشهر — ومفيش أي طريقة نتحكم فيها أو نصلّحها من الكود
// لأنها بتحصل جوه محرك طباعة النظام نفسه، برّه الصفحة.
//
// الحل الجذري: نولّد ملف PDF حقيقى إحنا بنفسنا (html2canvas + jsPDF)،
// من غير ما نمرّ على window.print() أو أي حوار طباعة تاني خالص. النتيجة
// ملف PDF عادي جدًا (صور مرصوصة على صفحات A4) بينزل مباشرة على الجهاز،
// ومتوافق مع أي قارئ PDF قديم أو حديث لأنه مش معتمد على أي خاصية حديثة.
//
// كل "صفحة" من التقرير (قسم التجميعات + كل صفحة تفاصيل) اتحسبت أصلاً فى
// PrintReport.tsx كعنصر مستقل (class="pr-agg-section" / "pr-page-break")،
// فبدل ما نقص صورة طويلة بالبكسل (وده ممكن يقطع صف نص نص بين صفحتين)،
// بنلتقط كل عنصر صفحة على حدة ونحطه فى صفحة PDF مستقلة — نفس التقسيم
// المحسوب بالظبط، بس كصور حقيقية بدل طباعة متصفح.
//
// ملحوظة (مشكلة "بتقعد فاضلة تحمّل"): أول نسخة كانت بتصوّر كل صفحة
// بطريقة foreignObjectRendering، ولو طلعت فاضية كانت بتعيد المحاولة
// بطريقة تانية أبطأ. المشكلة إن على بعض أجهزة الموبايل الطريقة الأولى
// كانت دايمًا بتطلع فاضية، فكل صفحة كانت فعليًا بتتصوّر مرتين (مرة سريعة
// فاشلة + مرة بطيئة) — ومع تقرير فيه صفحات كتير (زي تقرير فيه مراقبين
// ورؤساء مجموعات كتير) ده بيبقى بطيء جدًا حتى لو مش متجمّد فعليًا.
// الحل: بنستخدم الطريقة التانية (الأبطأ نسبيًا بس المضمونة) من الأول
// مباشرة من غير أي محاولة أولى ضايعة، وبنضيف مؤشر تقدّم (صفحة كذا من كذا)
// عشان المستخدم يبقى شايف إن فيه شغل بيحصل فعلاً مش تجمّد.
// ─────────────────────────────────────────────────────────────────────────

// عرض المحتوى وقت الالتقاط (بكسل) — تقريبًا عرض A4 (210mm) ناقص الهوامش
// الجانبية (12mm × 2) المستخدمة فى @page جوه PrintReport.tsx، عند ~96dpi.
const CAPTURE_WIDTH_PX = 700;

// أقصى وقت ننتظره لتحميل أي صورة مفردة (شعار الشركة مثلاً) أو الخطوط قبل
// ما نكمل من غيرها. بيمنع إن مورد واحد عالق (مشكلة شبكة مثلاً) يوقّف كل
// عملية إنشاء الملف إلى الأبد.
const RESOURCE_LOAD_TIMEOUT_MS = 4000;

function waitForImage(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
    setTimeout(done, RESOURCE_LOAD_TIMEOUT_MS);
  });
}

// فحص سريع (عيّنة نقط بس، مش كل بكسل) للتأكد إن الصورة الملتقطة مش
// فاضية بالكامل. بيتفعّل نادرًا (بس لو حصلت المشكلة فعلاً على جهاز معيّن)
// فمش بيكلّف وقت إضافي فى الحالة العادية.
function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const { width, height } = canvas;
  if (width === 0 || height === 0) return true;
  const samplePoints = 12;
  for (let i = 0; i < samplePoints; i += 1) {
    const x = Math.floor((width / samplePoints) * i + width / (samplePoints * 2));
    const y = Math.floor(height / 2);
    const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
    const isWhiteOrTransparent = a === 0 || (r > 250 && g > 250 && b > 250);
    if (!isWhiteOrTransparent) return false;
  }
  return true;
}

export interface ExportPrintReportProgress {
  page: number;
  totalPages: number;
}

export async function exportPrintReportToPdf(
  element: ReactElement,
  fileName: string,
  onProgress?: (progress: ExportPrintReportProgress) => void
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // حاوية معزولة، بس واقفة فعليًا عند (0,0) من الصفحة (مش مُبعَّدة بإحداثيات
  // سالبة كبيرة زي left:-10000px) — بنخفيها عن العين بـ z-index سالب
  // و pointer-events:none بدل الإبعاد. عناصر متبعدة بإحداثيات سالبة كبيرة
  // برّه حدود العرض بيتعامل معاها بعض المتصفحات كـ"مش محتاجة رسم فعلي"
  // (تحسين أداء داخلي) فبتطلع الصورة الملتقطة فاضية رغم إن الـ layout
  // بتاعها اتحسب صح. الوقوف عند (0,0) بيضمن إن المتصفح فعلاً بيرسمها.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '-1';
  container.style.pointerEvents = 'none';
  container.style.background = '#ffffff';
  container.style.width = `${CAPTURE_WIDTH_PX}px`;
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    await new Promise<void>((resolve) => {
      root.render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
      // فريمين عشان نضمن إن الـ layout والستايلات اتطبّقت فعليًا قبل ما نكمل.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    // عنصر التقرير أصلاً بيتصمم بـ class="hidden print:block" (يعنى
    // display:none إلا وقت الطباعة الفعلية). هنا مش بنطبع، فلازم نفرض
    // ظهوره يدويًا جوه الحاوية المعزولة دي بس.
    const printRoot = container.querySelector<HTMLElement>('.print-report');
    if (printRoot) {
      printRoot.classList.remove('hidden');
      printRoot.style.display = 'block';
    }
    // إجبار المتصفح يحسب الـ layout فعليًا دلوقتي (مش يأجّله)، ثم فريم
    // إضافي عشان الرسم يتم فعلاً قبل ما نبدأ نصوّر أي حاجة.
    void container.offsetHeight;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    // ننتظر تحميل الخطوط (بحد أقصى للأمان) والصور (شعار الشركة) قبل التصوير.
    if (document.fonts?.ready) {
      await Promise.race([
        document.fonts.ready.catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, RESOURCE_LOAD_TIMEOUT_MS)),
      ]);
    }
    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(images.map(waitForImage));

    // كل صفحة مستقلة: قسم التجميعات (الصفحة الأولى) ثم كل صفحة تفاصيل.
    const pageNodes: HTMLElement[] = [];
    const aggSection = container.querySelector<HTMLElement>('.pr-agg-section');
    if (aggSection) pageNodes.push(aggSection);
    container.querySelectorAll<HTMLElement>('.pr-page-break').forEach((node) => pageNodes.push(node));

    if (pageNodes.length === 0 && printRoot) {
      // أمان إضافي لو التقرير مالوش تقسيم صفحات معروف (تقرير بسيط صفحة واحدة).
      pageNodes.push(printRoot);
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWmm = doc.internal.pageSize.getWidth();
    const pageHmm = doc.internal.pageSize.getHeight();
    // هامش حوالين المحتوى — من غيره الصورة كانت بتترسم مطبّقة على الصفحة
    // بالكامل (0,0 لحد آخر الصفحة)، يعني بتوصل لحرف الورقة تمامًا زي ورقة
    // مقصوصة، من غير أي فراغ حواليها زي أي مستند مطبوع عادي.
    const marginMm = 10;
    const contentWmm = pageWmm - marginMm * 2;
    const contentHmm = pageHmm - marginMm * 2;

    for (let i = 0; i < pageNodes.length; i += 1) {
      onProgress?.({ page: i + 1, totalPages: pageNodes.length });
      const node = pageNodes[i];
      // مهم لصحة النص العربي: foreignObjectRendering بيخلّي المتصفح نفسه
      // (محرك الرسم الأصلي بتاعه) هو اللي يرسم النص جوه SVG، فالحروف
      // العربية المتصلة بتترسم صح زي أي نص عادي على الشاشة. الطريقة
      // التانية (false) بترسم كل حرف لوحده يدويًا من غير أي "تشكيل" للحروف
      // المتصلة، فكانت بتطلّع النص العربي متقطّع/داخل فى بعضه. السبب اللي
      // كان خلّانا نجرّب من غيرها قبل كده (صفحات بيضاء) كان أصلاً بسبب
      // موضع الحاوية (left:-10000px) اللي اتصلح فوق، مش المشكلة الحقيقية
      // فى الطريقة دي نفسها.
      const canvas = await html2canvas(node, {
        scale: 1.5,
        backgroundColor: '#ffffff',
        useCORS: true,
        foreignObjectRendering: true,
      });
      const finalCanvas = isCanvasBlank(canvas)
        ? await html2canvas(node, {
            scale: 1.5,
            backgroundColor: '#ffffff',
            useCORS: true,
            foreignObjectRendering: false,
          })
        : canvas;
      // JPEG بجودة عالية بدل PNG — نفس الصفحة تقريبًا بلا فرق ملحوظ للعين،
      // لكن بحجم ملف أصغر بكتير (PNG عديم الفقد كان بيطلّع الملف تقيل جدًا
      // خصوصًا مع تقرير بعدد صفحات كبير).
      const imgData = finalCanvas.toDataURL('image/jpeg', 0.92);

      // نضبط أبعاد الصورة جوه مربع المحتوى (بعد خصم الهامش) بحفاظ على
      // نسبة الأبعاد الأصلية (contain) بدل ما نمططها لتملأ عرض الصفحة
      // بالكامل زي ما كان بيحصل قبل كده.
      const aspect = finalCanvas.height / finalCanvas.width;
      let drawWmm = contentWmm;
      let drawHmm = drawWmm * aspect;
      if (drawHmm > contentHmm) {
        drawHmm = contentHmm;
        drawWmm = drawHmm / aspect;
      }
      const offsetXmm = marginMm + (contentWmm - drawWmm) / 2;
      const offsetYmm = marginMm;

      if (i > 0) doc.addPage();
      doc.addImage(imgData, 'JPEG', offsetXmm, offsetYmm, drawWmm, drawHmm);
    }

    doc.save(fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`);
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}
