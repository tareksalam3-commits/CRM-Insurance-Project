// طباعة/حفظ PDF باسم ملف حقيقى يعكس محتوى الصفحة وقت الطباعة، بدل اسم
// الشركة الثابت (اللى بيحطه HeadManager كـ document.title للصفحة عادةً).
//
// خلفية المشكلة: لما المستخدم يضغط "طباعة" ويختار "حفظ كـ PDF" من نافذة
// طباعة المتصفح، المتصفح بيقترح اسم الملف الافتراضى = document.title.
// عندنا document.title ثابت دايماً على اسم الشركة (HeadManager.tsx)، فكل
// تقرير/عرض كان بيتحفظ بنفس الاسم مهما كان محتواه.
//
// الحل الصحيح: مش كفاية نغيّر document.title ونعمل setTimeout قبل
// window.print() — المتصفح ممكن يكون لسه ملتقط اللقطة (snapshot) بتاعة
// العنوان قبل ما يوصل الـ setTimeout. الطريقة المضمونة هى الاستماع لحدث
// beforeprint نفسه (اللى المتصفح بيطلقه فعليًا لحظة تجهيز نافذة الطباعة/
// حفظ PDF، سواء جت من window.print() أو من Ctrl+P) وتغيير العنوان جواه
// بالظبط، وإرجاعه تانى لاسم الشركة عند afterprint.
export function printWithTitle(title: string): void {
  const previousTitle = document.title;

  const onBeforePrint = () => {
    document.title = title;
  };

  const onAfterPrint = () => {
    document.title = previousTitle;
    window.removeEventListener('beforeprint', onBeforePrint);
    window.removeEventListener('afterprint', onAfterPrint);
  };

  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);

  window.print();
}
