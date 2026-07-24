// تصدير عنصر HTML كملف PDF فعلى باسم مضبوط 100% — بديل مضمون عن الاعتماد
// على اسم الملف المقترح من نافذة طباعة المتصفح (window.print())، واللى
// تبيّن إنه مش موثوق فى كل البيئات (بعض المتصفحات/أنظمة التشغيل بتتجاهل
// document.title تمامًا وقت اقتراح اسم الملف). هنا بننشئ ملف PDF حقيقى
// عن طريق تصوير العنصر (html2canvas) ثم تنزيله مباشرة (jsPDF .save())
// باسم بنحدده إحنا صراحةً، وده مش خاضع لأي سلوك متصفح مختلف.
export async function exportElementToPdf(node: HTMLElement, fileName: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // ننتظر تحميل الخطوط فعليًا قبل التصوير — لو الخط لسه بيتحمّل وقت اللقطة،
  // القياسات بتتغيّر لحظيًا فيطلع النص والصناديق فوق بعض فى الصورة الناتجة.
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* تجاهل */ }
  }

  // ملاحظة مهمة (سبب مشكلة "قص الجانب الأيمن" اللى كانت موجودة قبل كده):
  // القيمة الافتراضية لـ x/y فى html2canvas بتتحسب تلقائيًا من *موضع العنصر
  // نفسه* داخل الصفحة. العنصر (تقرير الإحصائيات) مش واقف فعليًا عند
  // الإحداثية (0,0) من الصفحة — هو جوه تخطيط التطبيق (بعد الشريط الجانبى/
  // الهيدر). فلما كان الكود القديم يفرض x:0, y:0 يدويًا، كان html2canvas
  // بيبدأ القص من زاوية الصفحة الكاملة مش من بداية التقرير، فيقص جزء من
  // عرض التقرير (يمين الصفحة فى تخطيط RTL) بدل ما يلتقطه كامل.
  //
  // الحل الأضمن (بدل محاولة حساب الإزاحة الصحيحة يدويًا، وهو عرضة لنفس
  // النوع من الأخطاء فى RTL): بننسخ العنصر (clone) ونحطه فعليًا فى حاوية
  // معزولة مثبتة عند (0,0) خارج تخطيط الصفحة، ونصوّر النسخة دى بدل الأصلية.
  // كده x:0 / y:0 بيبقوا صح فعلاً لإن العنصر فعلاً موجود هناك، بغض النظر
  // عن مكان التقرير الأصلى فى الصفحة أو اتجاهها (RTL/LTR).
  const clone = node.cloneNode(true) as HTMLElement;
  const rect = node.getBoundingClientRect();

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.top = '0';
  wrapper.style.left = '0';
  wrapper.style.margin = '0';
  wrapper.style.padding = '0';
  wrapper.style.zIndex = '-1';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.backgroundColor = '#ffffff';
  // نفس عرض العنصر الأصلى بالظبط، عشان الجدول والأعمدة تتلف بنفس الشكل
  // اللى كانت عليه (خصوصًا بعد قواعد الطباعة اللى بتشيل التمرير الأفقى).
  wrapper.style.width = `${Math.ceil(rect.width)}px`;
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  // إلغاء أى تمرير أفقى/رأسى متبقّى جوه النسخة نفسها (مثلاً حاويات جداول
  // بتستخدم overflow-x-auto) عشان الالتقاط يبدأ من أول عمود فعليًا.
  clone.scrollLeft = 0;
  clone.scrollTop = 0;
  clone.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (el.scrollLeft !== 0) el.scrollLeft = 0;
  });

  // فريم واحد كفاية عشان المتصفح يحسب الـ layout الجديد للنسخة قبل التصوير.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      // بيخلي المتصفح نفسه يرسم النص والألوان (بدل ما html2canvas يحاول يفسر
      // كل قاعدة CSS يدويًا)، وده اللي بيحل مشكلة الألوان الباهتة مع صيغ
      // الشفافية الحديثة (زي bg-secondary-50/80) واللي html2canvas مش بيفهمها
      // صح لوحده. نفس الحل المستخدم بالظبط فى تصدير صورة عرض السعر بالتطبيق.
      foreignObjectRendering: true,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      width: clone.scrollWidth,
      height: clone.scrollHeight,
      windowWidth: clone.scrollWidth,
      windowHeight: clone.scrollHeight,
    });
  } finally {
    document.body.removeChild(wrapper);
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  if (imgH <= pageH) {
    doc.addImage(imgData, 'PNG', 0, 0, imgW, imgH);
  } else {
    // المحتوى أطول من صفحة واحدة — يُقسَّم على عدة صفحات A4 متتالية.
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
