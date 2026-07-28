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
// ─────────────────────────────────────────────────────────────────────────

// عرض المحتوى وقت الالتقاط (بكسل) — تقريبًا عرض A4 (210mm) ناقص الهوامش
// الجانبية (12mm × 2) المستخدمة فى @page جوه PrintReport.tsx، عند ~96dpi.
const CAPTURE_WIDTH_PX = 700;

// بيتأكد إن الـ canvas مش فاضي (كل بكسلاته أبيض/شفاف) — بنعاين عيّنة من
// النقط بدل كل بكسل عشان الأداء. لو طلع فاضي، معناه طريقة الالتقاط اللي
// استخدمناها (foreignObjectRendering) فشلت على المتصفح/الـ WebView ده،
// فبنعيد المحاولة بالطريقة التقليدية (تصوير DOM حقيقي بدل SVG).
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

async function captureNode(html2canvas: typeof import('html2canvas').default, node: HTMLElement) {
  let canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    foreignObjectRendering: true,
  });
  if (isCanvasBlank(canvas)) {
    canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      foreignObjectRendering: false,
    });
  }
  return canvas;
}

export async function exportPrintReportToPdf(element: ReactElement, fileName: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // حاوية معزولة، بس واقفة فعليًا عند (0,0) من الصفحة (مش مُبعَّدة بإحداثيات
  // سالبة كبيرة زي left:-10000px) — بنخفيها عن العين بـ z-index سالب
  // و pointer-events:none بدل الإبعاد. ملحوظة مهمة: على بعض متصفحات/
  // WebView الموبايل، عناصر متبعدة بإحداثيات سالبة كبيرة برّه حدود
  // العرض بتتعامل معاها المتصفح كـ"مش محتاجة رسم فعلي" (تحسين أداء داخلي)
  // فبييجي html2canvas يصوّرها بيلاقيها متلقّطة فاضية (صفحات بيضاء)، رغم
  // إن layout بتاعها اتحسب صح. الوقوف عند (0,0) بيضمن إن المتصفح فعلاً
  // بيرسمها زي أي عنصر عادي جوه الصفحة.
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

    // ننتظر تحميل الخطوط والصور (شعار الشركة) قبل التصوير.
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch { /* تجاهل */ }
    }
    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve());
              img.addEventListener('error', () => resolve());
            })
      )
    );

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

    for (let i = 0; i < pageNodes.length; i += 1) {
      const node = pageNodes[i];
      const canvas = await captureNode(html2canvas, node);
      const imgData = canvas.toDataURL('image/png');
      const imgHmm = (canvas.height * pageWmm) / canvas.width;

      if (i > 0) doc.addPage();
      // لو المحتوى (نادرًا) أطول من صفحة A4 واحدة، نمدده على أكتر من
      // صفحة PDF بدل ما نقصّه، بنفس منطق exportElementToPdf.ts.
      if (imgHmm <= pageHmm) {
        doc.addImage(imgData, 'PNG', 0, 0, pageWmm, imgHmm);
      } else {
        let heightLeft = imgHmm;
        let position = 0;
        doc.addImage(imgData, 'PNG', 0, position, pageWmm, imgHmm);
        heightLeft -= pageHmm;
        while (heightLeft > 0) {
          position -= pageHmm;
          doc.addPage();
          doc.addImage(imgData, 'PNG', 0, position, pageWmm, imgHmm);
          heightLeft -= pageHmm;
        }
      }
    }

    doc.save(fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`);
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}
