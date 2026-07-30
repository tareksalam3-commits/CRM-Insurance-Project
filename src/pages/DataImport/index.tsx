import { friendlyError } from '../../lib/errorMessages';
import { useRef, useState } from 'react';
import {
  Download,
  UploadCloud,
  FileSpreadsheet,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  PlayCircle,
  AlertTriangle,
  Pencil,
  Ban,
  Undo2,
  FileDown,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import clsx from 'clsx';

import { useAuth } from '../../hooks/useAuth';
import type { ParsedRow, ImportSummary } from './types';
import { downloadTemplateFile, parseWorkbookFile, importRows, fetchImportAgents, exportErrorReport, type ImportAgent } from './services/dataImportService';
import { detectDocumentKind, extractRowsFromDocument } from './services/aiDocumentExtractor';
import { RowEditModal } from './components/RowEditModal';

type Stage = 'idle' | 'parsed' | 'importing' | 'done';

export function DataImport() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [agents, setAgents] = useState<ImportAgent[]>([]);
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [editingRow, setEditingRow] = useState<ParsedRow | null>(null);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [retryMode, setRetryMode] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [parsing, setParsing] = useState(false);

  const activeRows = parsedRows.filter((r) => !excludedRows.has(r.rowNumber));
  const validRowsCount = activeRows.filter((r) => r.payload !== null).length;
  const invalidRowsCount = activeRows.length - validRowsCount;
  const excludedCount = excludedRows.size;

  const resetAll = () => {
    setFileName(null);
    setHeaderError(null);
    setAiNotice(null);
    setParsedRows([]);
    setAgents([]);
    setExcludedRows(new Set());
    setEditingRow(null);
    setShowErrorsOnly(false);
    setRetryMode(false);
    setStage('idle');
    setProgress({ done: 0, total: 0 });
    setSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    resetAll();
    setFileName(file.name);
    setParsing(true);
    try {
      // نجيب قائمة وكلاء فريق المستورِد قبل التحليل عشان نطابق عمود "اسم
      // الوكيل" محلياً (تطبيع + تشابه) بدل ما نكتشف الاسم الغلط بعد فشل
      // كل صف في السيرفر واحداً واحداً
      const fetchedAgents = user ? await fetchImportAgents(user) : [];
      setAgents(fetchedAgents);

      const documentKind = detectDocumentKind(file);
      if (documentKind) {
        // ملف PDF أو صورة — لا تدعمه الطبقة الأولى أصلاً، فيُعالَج بالكامل
        // عبر طبقة الاستخراج بالذكاء الاصطناعي (لا يوجد "نظام حالي" بديل
        // لهذا النوع من الملفات تحديداً)
        const { rows, error } = await extractRowsFromDocument(file, documentKind, fetchedAgents);
        if (error) {
          setHeaderError(error);
          setStage('idle');
        } else {
          setParsedRows(rows);
          setAiNotice('تم استخراج بيانات هذا الملف بواسطة الذكاء الاصطناعي. راجع الصفوف أدناه بعناية قبل الاستيراد.');
          setStage('parsed');
        }
        return;
      }

      const { rows, headerError: hErr, usedAIMapping: aiUsed } = await parseWorkbookFile(file, fetchedAgents);
      if (hErr) {
        setHeaderError(hErr);
        setStage('idle');
      } else {
        setParsedRows(rows);
        setAiNotice(aiUsed ? 'لم يطابق الملف نموذج الاستيراد حرفياً، فتم استخدام الذكاء الاصطناعي لمطابقة الأعمدة تلقائياً. راجع الصفوف أدناه قبل الاستيراد.' : null);
        setStage('parsed');
      }
    } catch (err: any) {
      setHeaderError(friendlyError(err, 'تعذر قراءة الملف. تأكد أنه ملف صحيح غير تالف'));
    } finally {
      setParsing(false);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const startImport = async () => {
    const rowsToImport = parsedRows.filter((r) => !excludedRows.has(r.rowNumber));
    setStage('importing');
    setProgress({ done: 0, total: rowsToImport.length });
    const result = await importRows(rowsToImport, (_r, done, total) => {
      setProgress({ done, total });
    });
    setSummary(result);
    setStage('done');
  };

  const retryFailedRows = () => {
    if (!summary) return;
    const failedRowNumbers = new Set(
      summary.results.filter((r) => r.status === 'error').map((r) => r.rowNumber)
    );
    const failedRows = parsedRows.filter((r) => failedRowNumbers.has(r.rowNumber));
    setParsedRows(failedRows);
    setExcludedRows(new Set());
    setShowErrorsOnly(false);
    setRetryMode(true);
    setSummary(null);
    setStage('parsed');
  };

  const handleRowSaved = (updatedRow: ParsedRow) => {
    setParsedRows((prev) => prev.map((r) => (r.rowNumber === updatedRow.rowNumber ? updatedRow : r)));
    setEditingRow(null);
  };

  const toggleExcludeRow = (rowNumber: number) => {
    setExcludedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  };

  const visibleRows = showErrorsOnly ? parsedRows.filter((r) => r.payload === null) : parsedRows;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h2 className="text-xl font-bold text-secondary-900 flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-primary-600" />
          استيراد البيانات
        </h2>
        <p className="text-sm text-secondary-500 mt-1">
          استيراد دفعة من العملاء والوثائق دفعة واحدة من ملف Excel أو CSV، أو من PDF/صورة بمساعدة الذكاء الاصطناعي. هذه الصفحة مستقلة ولا تؤثر على أي جزء آخر من النظام.
        </p>
      </div>

      {/* الخطوة 1: تحميل النموذج */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-secondary-900">١. حمّل نموذج Excel</h3>
            <p className="text-sm text-secondary-500 mt-1">
              يحتوي النموذج على كل الأعمدة المطلوبة، صف مثال، وورقة تعليمات بالقيم المسموحة لكل عمود.
            </p>
          </div>
          <button onClick={downloadTemplateFile} className="btn btn-secondary flex-shrink-0">
            <Download className="w-4 h-4" />
            تحميل النموذج
          </button>
        </div>
      </div>

      {/* الخطوة 2: رفع الملف */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-secondary-900">٢. اختر ملف Excel المُعبّأ</h3>

        {!fileName ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              dragOver ? 'border-primary-500 bg-primary-50' : 'border-secondary-300 hover:border-primary-400 hover:bg-secondary-50'
            )}
          >
            <UploadCloud className="w-10 h-10 text-secondary-400 mx-auto mb-3" />
            <p className="text-secondary-700 font-medium">اسحب ملف Excel أو CSV أو PDF أو صورة هنا أو اضغط للاختيار</p>
            <p className="text-xs text-secondary-400 mt-1">صيغة .xlsx، .xls، .csv، .pdf، .jpg، .png، .webp</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp"
              onChange={onFileInputChange}
              className="hidden"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 bg-secondary-50 rounded-lg p-3 border border-secondary-200">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="w-5 h-5 text-primary-600 flex-shrink-0" />
              <span className="text-sm text-secondary-800 truncate">{fileName}</span>
            </div>
            {stage !== 'importing' && (
              <button onClick={resetAll} className="btn btn-ghost btn-sm flex-shrink-0" title="إزالة الملف">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {parsing && (
          <div className="flex items-center gap-2 text-sm text-secondary-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            جاري قراءة الملف...
          </div>
        )}

        {headerError && (
          <div className="flex items-start gap-2 bg-error-50 border border-error-200 text-error-700 rounded-lg p-3 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{headerError}</span>
          </div>
        )}

        {stage === 'parsed' && (
          <div className="space-y-4">
            {aiNotice && (
              <div className="flex items-center gap-2 bg-primary-50 border border-primary-200 text-primary-700 rounded-lg p-3 text-sm">
                <Sparkles className="w-4 h-4 flex-shrink-0" />
                <span>{aiNotice}</span>
              </div>
            )}
            {retryMode && (
              <div className="flex items-center gap-2 bg-primary-50 border border-primary-200 text-primary-700 rounded-lg p-3 text-sm">
                <RotateCcw className="w-4 h-4 flex-shrink-0" />
                <span>هذه إعادة محاولة للصفوف التي فشلت في المرة السابقة فقط. الصفوف التي نجحت سابقاً تم استيرادها بالفعل ولن تتكرر.</span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-secondary-50 rounded-lg p-4">
              <div className="text-sm text-secondary-700 space-y-1">
                <p>تم العثور على <span className="font-semibold">{parsedRows.length}</span> صف بيانات.</p>
                <p className="text-success-700">{validRowsCount} صف جاهز للاستيراد</p>
                {invalidRowsCount > 0 && (
                  <p className="text-error-600">{invalidRowsCount} صف به أخطاء وسيُرفض فور بدء الاستيراد</p>
                )}
                {excludedCount > 0 && (
                  <p className="text-secondary-500">{excludedCount} صف مستبعد من الاستيراد يدوياً</p>
                )}
              </div>
              <button
                onClick={startImport}
                disabled={validRowsCount === 0}
                className="btn btn-primary flex-shrink-0"
              >
                <PlayCircle className="w-4 h-4" />
                بدء الاستيراد
              </button>
            </div>

            {/* الخطوة ٢ب: معاينة وتعديل الصفوف قبل الإرسال — تصحيح خطأ بسيط
                (اسم وكيل، تاريخ، رقم) هنا بدل الرجوع للإكسل وإعادة الرفع */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-secondary-800 text-sm">معاينة الصفوف</h4>
                <label className="flex items-center gap-2 text-sm text-secondary-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showErrorsOnly}
                    onChange={(e) => setShowErrorsOnly(e.target.checked)}
                    className="rounded border-secondary-300"
                  />
                  عرض الصفوف التي بها أخطاء فقط
                </label>
              </div>

              <div className="overflow-x-auto border border-secondary-200 rounded-lg max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-secondary-200 text-secondary-500">
                      <th className="text-right py-2 px-2">صف</th>
                      <th className="text-right py-2 px-2">العميل</th>
                      <th className="text-right py-2 px-2">الوكيل</th>
                      <th className="text-right py-2 px-2">رقم الوثيقة</th>
                      <th className="text-right py-2 px-2">الحالة</th>
                      <th className="text-right py-2 px-2">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const isExcluded = excludedRows.has(row.rowNumber);
                      return (
                        <tr
                          key={row.rowNumber}
                          className={clsx(
                            'border-b border-secondary-100',
                            isExcluded && 'opacity-50'
                          )}
                        >
                          <td className="py-2 px-2 text-secondary-500">{row.rowNumber}</td>
                          <td className="py-2 px-2">{row.raw['customer_name'] || '-'}</td>
                          <td className="py-2 px-2">{row.raw['agent_name'] || '-'}</td>
                          <td className="py-2 px-2">{row.raw['policy_number'] || '-'}</td>
                          <td className="py-2 px-2">
                            {isExcluded ? (
                              <span className="text-secondary-400">مستبعد</span>
                            ) : row.payload !== null ? (
                              <span className="inline-flex items-center gap-1 text-success-700">
                                <CheckCircle2 className="w-4 h-4" /> صحيح
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-error-600" title={row.clientError || ''}>
                                <XCircle className="w-4 h-4" /> {row.clientError}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setEditingRow(row)}
                                className="btn btn-ghost btn-sm"
                                title="تعديل الصف"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => toggleExcludeRow(row.rowNumber)}
                                className="btn btn-ghost btn-sm"
                                title={isExcluded ? 'إرجاع الصف للاستيراد' : 'استبعاد الصف من الاستيراد'}
                              >
                                {isExcluded ? <Undo2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {stage === 'importing' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-secondary-700">
              <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
              جاري الاستيراد... ({progress.done} / {progress.total})
            </div>
            <div className="w-full h-2 bg-secondary-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 transition-all duration-200"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* الخطوة 3: تقرير النتيجة */}
      {stage === 'done' && summary && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-semibold text-secondary-900">٣. تقرير الاستيراد</h3>
            {summary.failedCount > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => exportErrorReport(summary)} className="btn btn-secondary btn-sm">
                  <FileDown className="w-4 h-4" />
                  تصدير تقرير الأخطاء
                </button>
                <button onClick={retryFailedRows} className="btn btn-primary btn-sm">
                  <RotateCcw className="w-4 h-4" />
                  إعادة محاولة الصفوف الفاشلة
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-center">
              <p className="text-2xl font-bold text-success-700">{summary.importedCount}</p>
              <p className="text-sm text-success-700 mt-1">عميل ووثيقة تم استيرادهم</p>
            </div>
            <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-center">
              <p className="text-2xl font-bold text-error-600">{summary.failedCount}</p>
              <p className="text-sm text-error-600 mt-1">صف فشل استيراده</p>
            </div>
            <div className="rounded-lg border border-secondary-200 bg-secondary-50 p-4 text-center">
              <p className="text-2xl font-bold text-secondary-700">{summary.totalRows}</p>
              <p className="text-sm text-secondary-600 mt-1">إجمالي عدد الصفوف</p>
            </div>
          </div>

          {summary.failedCount > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-secondary-200 text-secondary-500">
                    <th className="text-right py-2 px-2">صف</th>
                    <th className="text-right py-2 px-2">العميل</th>
                    <th className="text-right py-2 px-2">رقم الوثيقة</th>
                    <th className="text-right py-2 px-2">الحالة</th>
                    <th className="text-right py-2 px-2">سبب الفشل</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.results.filter((r) => r.status === 'error').map((r) => (
                    <tr key={r.rowNumber} className="border-b border-secondary-100">
                      <td className="py-2 px-2 text-secondary-500">{r.rowNumber}</td>
                      <td className="py-2 px-2">{r.customerName || '-'}</td>
                      <td className="py-2 px-2">{r.policyNumber || '-'}</td>
                      <td className="py-2 px-2">
                        <span className="inline-flex items-center gap-1 text-error-600">
                          <XCircle className="w-4 h-4" /> فشل
                        </span>
                      </td>
                      <td className="py-2 px-2 text-secondary-600">{r.errorMessage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {summary.importedCount > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-secondary-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-success-600" />
                عرض الصفوف التي تم استيرادها بنجاح ({summary.importedCount})
              </summary>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-secondary-200 text-secondary-500">
                      <th className="text-right py-2 px-2">صف</th>
                      <th className="text-right py-2 px-2">العميل</th>
                      <th className="text-right py-2 px-2">رقم الوثيقة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.results.filter((r) => r.status === 'success').map((r) => (
                      <tr key={r.rowNumber} className="border-b border-secondary-100">
                        <td className="py-2 px-2 text-secondary-500">{r.rowNumber}</td>
                        <td className="py-2 px-2">{r.customerName}</td>
                        <td className="py-2 px-2">{r.policyNumber}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <button onClick={resetAll} className="btn btn-secondary">
            استيراد ملف آخر
          </button>
        </div>
      )}

      {editingRow && (
        <RowEditModal
          row={editingRow}
          agents={agents}
          onCancel={() => setEditingRow(null)}
          onSave={handleRowSaved}
        />
      )}
    </div>
  );
}
