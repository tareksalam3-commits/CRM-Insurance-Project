// مكتبات ثقيلة نادرة الاستخدام — تُحمَّل ديناميكيًا فقط وقت الحاجة الفعلية
// (معاينة/تنزيل/طباعة التشكيل) بدل تحميلها ضمن الحزمة الرئيسية للتطبيق.

const A4_LANDSCAPE_PT = { width: 841.89, height: 595.28 };

export async function exportNodeToPdf(node: HTMLElement, fileName: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // ننتظر تحميل الخطوط فعليًا قبل التصوير — لو الخط لسه بيتحمّل وقت اللقطة،
  // القياسات بتتغيّر لحظيًا فيطلع النص والصناديق فوق بعض في الصورة الناتجة.
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* تجاهل */ }
  }

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    // نثبّت "نافذة" html2canvas الداخلية على نفس أبعاد العنصر نفسه (لا أبعاد نافذة
    // المتصفح الحالية)، عشان يتصور بنفس القياسات المستقرة اللي بُني عليها التخطيط
    // بالظبط، مهما كان حجم شاشة الجهاز وقت الضغط على تنزيل.
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = A4_LANDSCAPE_PT.width;
  const pageH = A4_LANDSCAPE_PT.height;

  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  if (imgH <= pageH + 1) {
    // يتسع في صفحة واحدة
    const y = (pageH - imgH) / 2 > 0 ? (pageH - imgH) / 2 : 0;
    doc.addImage(imgData, 'PNG', 0, y, imgW, imgH);
  } else {
    // احتياطي: تجاوز صفحة واحدة رغم التصغير التدريجي — يُقسَّم على عدة صفحات
    let heightLeft = imgH;
    let position = 0;
    doc.addImage(imgData, 'PNG', 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position -= pageH;
      doc.addPage();
      doc.addImage(imgData, 'PNG', 0, position, imgW, imgH);
      heightLeft -= pageH;
    }
  }

  doc.save(fileName);
}

// أبعاد المساحة القابلة للطباعة فعليًا داخل صفحة A4 (بعد خصم هامش 8مم من كل جانب)
// في كل من الاتجاهين. بما إن المستخدم فعليًا بيقدر يختار رأسي/أفقي من مربع حوار
// الطباعة، لازم نجهّز حساب مقاس مناسب لكل احتمال، ونخلي CSS (عبر media query
// خاص بالطباعة) يختار المقاس الصحيح تلقائيًا حسب الاتجاه اللي هيتحدد فعليًا
// وقت الطباعة — بدل ما نفترض احتمال واحد بس ونضطر نصغّر الشكل أكتر من اللازم.
const LANDSCAPE_W_PX = 1062; // (297 - 16) مم × 3.7795
const LANDSCAPE_H_PX = 733;  // (210 - 16) مم × 3.7795
const PORTRAIT_W_PX = 733;
const PORTRAIT_H_PX = 1062;

export function printNode(node: HTMLElement, documentTitle: string): void {
  const printWindow = window.open('', '_blank', 'width=1400,height=900');
  if (!printWindow) {
    window.alert('يرجى السماح بالنوافذ المنبثقة لهذا الموقع لتتمكن من الطباعة.');
    return;
  }

  const nodeWidth = node.scrollWidth || node.offsetWidth || 1400;
  const nodeHeight = node.scrollHeight || node.offsetHeight || 1;

  const landscapeScale = Math.min(1, LANDSCAPE_W_PX / nodeWidth, LANDSCAPE_H_PX / nodeHeight);
  const portraitScale = Math.min(1, PORTRAIT_W_PX / nodeWidth, PORTRAIT_H_PX / nodeHeight);
  const lw = Math.ceil(nodeWidth * landscapeScale);
  const lh = Math.ceil(nodeHeight * landscapeScale);
  const pw = Math.ceil(nodeWidth * portraitScale);
  const ph = Math.ceil(nodeHeight * portraitScale);

  // ننسخ كل الأنماط المحمّلة في الصفحة الحالية (Tailwind + خطوط) للنافذة الجديدة
  // عشان تصميم التشكيل يطبع بنفس الشكل بالظبط
  const styleTags = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML)
    .join('\n');

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${documentTitle}</title>
${styleTags}
<style>
  @page { margin: 8mm; }
  html, body {
    background:#fff; margin:0; padding:0; width:100%; height:100%;
  }
  /* بدون السطر ده، المتصفح بيشيل ألوان الخلفية (الصناديق السودا/الخضرا...)
     تلقائيًا وقت الطباعة لتوفير الحبر، فيطلع الشكل باهت/بلا ألوان. */
  html, body, .ofr-print-fit, .ofr-print-fit * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  /* نخلي body نفسه يملأ الصفحة ويوسّط محتواه — بغض النظر عن الاتجاه اللي
     هيتحدد فعليًا وقت الطباعة، عشان الشكل يتوسط دايمًا بدل ما يتثبت في الزاوية. */
  body { display:flex; align-items:center; justify-content:center; }

  /* الاتجاه الأفقي (المساحة القابلة للطباعة أعرض).
     نستخدم "zoom" بدل "transform: scale" لتصغير المحتوى: transform لا يغيّر
     الحجم الفعلي لصندوق العنصر (layout box)، وكروم بيحسب تقسيم الصفحات وقت
     الطباعة على الحجم الأصلي (قبل التصغير البصري) — فيطلع الهيدر في صفحة
     والشارت في صفحة تانية رغم إن الاتنين متصغّرين بصريًا داخل نفس المساحة.
     "zoom" بالعكس بيغيّر حجم الصندوق فعليًا، فحساب تقسيم الصفحات بيتم صح. */
  .ofr-print-fit { width: ${lw}px; height: ${lh}px; overflow: hidden; }
  .ofr-print-fit > * { zoom: ${landscapeScale}; }
  @media print and (orientation: portrait) {
    .ofr-print-fit { width: ${pw}px; height: ${ph}px; }
    .ofr-print-fit > * { zoom: ${portraitScale}; }
  }
</style>
</head>
<body>
  <div class="ofr-print-fit">${node.outerHTML}</div>
</body>
</html>`);
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 350);
  };
}
