#!/usr/bin/env node
/**
 * فحص تطابق دليل المستخدم مع الصفحات الفعلية فى التطبيق.
 *
 * الهدف: تنفيذ متطلب "أي تعديل فى المستقبل يجب أن ينعكس تلقائياً على دليل
 * الاستخدام" بأقصى ما يمكن أتمتته فعلياً بدون ذكاء اصطناعي مكلّف: بدل ما
 * نعتمد على تذكّر المطور تحديث الشرح يدوياً، هذا السكريبت يفشل عملية البناء
 * (build) لو ظهر مسار (Route) جديد فى App.tsx وليس له مقابل فى
 * src/features/help/content/index.ts — فيصير التحديث إجبارياً وليس اختيارياً.
 *
 * الاستخدام: أضِف فى package.json (قسم "scripts"):
 *   "check:help": "node scripts/check-help-coverage.mjs"
 *   "prebuild": "npm run check:help"
 * بحيث لا يكتمل أي بناء إنتاجي دون أن يكون كل Route موثّقاً فى الدليل.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const appTsx = readFileSync(join(root, 'src/App.tsx'), 'utf-8');

// استخراج كل مسارات <Route path="...">
const routeMatches = [...appTsx.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
const ignoredRoutes = new Set(['/*', '/team-room', '/help']); // إعادة توجيه أو الصفحة نفسها، وليست بحاجة لمحتوى مساعدة عن نفسها

// استخراج كل path: '...' الموجودة داخل ملفات content/*.ts المستوردة فى الـ registry
const contentFiles = [
  'operations.ts', 'management.ts', 'system.ts', 'account.ts',
].map((f) => readFileSync(join(root, 'src/features/help/content', f), 'utf-8')).join('\n');

const documentedPaths = new Set([...contentFiles.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]));

const missing = routeMatches.filter((r) => !ignoredRoutes.has(r) && !documentedPaths.has(r));

if (missing.length > 0) {
  console.error('\n❌ فشل فحص تغطية دليل المستخدم (Help Coverage):');
  console.error('   المسارات التالية موجودة فى App.tsx لكن بدون محتوى مساعدة موثّق:');
  missing.forEach((r) => console.error(`     - ${r}`));
  console.error('\n   الرجاء إضافة كائن HelpContent مطابق فى src/features/help/content/ ثم');
  console.error('   تسجيله فى src/features/help/content/index.ts (HELP_REGISTRY) قبل المتابعة.\n');
  process.exit(1);
} else {
  console.log(`✅ كل مسارات التطبيق (${routeMatches.length - ignoredRoutes.size}) موثّقة فى دليل المستخدم.`);
}
