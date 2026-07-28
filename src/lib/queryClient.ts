import { QueryClient } from '@tanstack/react-query';

// نسخة واحدة مشتركة من QueryClient لكل التطبيق. اتنقلت لملف مستقل (بدل ما
// تتعرّف جوه App.tsx بس) عشان أي كود تاني محتاج يقرا من نفس الـ cache من
// غير ما يكون جوه شجرة الكومبوننتس العادية (زي نافذة الطباعة المستقلة فى
// printReportWindow.ts، اللي بترندر تقرير الطباعة برّه شجرة التطبيق
// وبتحتاج توصل لنفس البيانات المتخزّنة بالفعل زي الشعار/اسم الشركة).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // تفادي إعادة الجلب غير الضرورية عند التنقل بين الصفحات أو العودة للتطبيق
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
