import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';

// ─────────────────────────────────────────────────────────────────────────
// خلفية المشكلة: كنا بنعتمد على حيلة CSS (إخفاء كل حاجة فى الصفحة الأصلية
// وإظهار تقرير الطباعة بس فوقها) عشان نطبع التقرير من غير هيكل التطبيق
// (Sidebar / Header / أزرار..). الحيلة دي بتعتمد على دعم المتصفح لقواعد
// CSS معيّنة (زي :has())، وبعض متصفحات/محركات الطباعة (خصوصًا على
// الموبايل، أو قارئات PDF قديمة بتفتح الملف الناتج بعدين) بتفشل تطبّقها
// صح، فبيطلع جزء من الصفحة فاضي/أبيض.
//
// الحل الجذري: بدل ما نخفي حاجة، بنفتح نافذة/تبويب طباعة جديدة تمامًا
// ومستندها HTML بسيط يحتوي على تقرير الطباعة بس (من غير أي جزء تاني من
// التطبيق أصلاً موجود فيها)، فمفيش أي حاجة محتاجة تتخفي، ومفيش أي اعتماد
// على قواعد CSS حديثة. ده بيشتغل بنفس الشكل على أي متصفح وأي إصدار قارئ
// PDF، لأن الـ PDF الناتج بسيط ومباشر.
// ─────────────────────────────────────────────────────────────────────────
export function openPrintReportWindow(element: ReactElement, title: string): void {
  // بنلف العنصر بـ QueryClientProvider (بنفس الـ queryClient الحقيقي بتاع
  // التطبيق) قبل الـ render، لأن تقرير الطباعة بيستخدم useSettings()
  // (useQuery) لجلب اسم/شعار الشركة، وهو بيترندر هنا برّه شجرة كومبوننتس
  // التطبيق الأصلية، فمحتاج نفس الـ cache عشان ياخد البيانات صح بدل
  // القيم الافتراضية بس.
  const contentHtml = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>
  );

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('المتصفح منع فتح نافذة الطباعة. من فضلك اسمح بالنوافذ المنبثقة (Popups) لهذا الموقع وحاول تاني.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(
    '<!DOCTYPE html>' +
    '<html dir="rtl" lang="ar">' +
    '<head><meta charset="utf-8" /><title>' + title + '</title></head>' +
    '<body>' + contentHtml + '</body>' +
    '</html>'
  );
  printWindow.document.close();

  let hasPrinted = false;
  const triggerPrint = () => {
    if (hasPrinted) return;
    hasPrinted = true;
    printWindow.focus();
    printWindow.print();
  };

  // ننتظر تحميل الصور (شعار الشركة) قبل الطباعة، وإلا هتطلع فاضية من
  // الشعار لو الصورة لسه مبتحملتش وقت نداء print().
  const images = Array.from(printWindow.document.images);
  if (images.length === 0) {
    setTimeout(triggerPrint, 150);
  } else {
    let loadedCount = 0;
    const onImageSettled = () => {
      loadedCount += 1;
      if (loadedCount >= images.length) setTimeout(triggerPrint, 50);
    };
    images.forEach((img) => {
      if (img.complete) onImageSettled();
      else {
        img.addEventListener('load', onImageSettled);
        img.addEventListener('error', onImageSettled);
      }
    });
  }
  // أمان إضافي: لو لأي سبب مفيش استدعاء لـ triggerPrint حصل (صورة عالقة
  // مثلاً)، اطبع بعد 3 ثوانٍ على أي حال بدل ما تفضل النافذة معلّقة.
  setTimeout(triggerPrint, 3000);

  printWindow.addEventListener('afterprint', () => {
    printWindow.close();
  });
}
