import { Component, ReactNode } from 'react';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { isOnline } from '../lib/networkManager';

interface Props {
  children: ReactNode;
  // اسم اختياري للجزء اللي بيتغطى (لتمييز الأخطاء فى الـ console فقط)
  boundaryName?: string;
}

interface State {
  hasError: boolean;
}

// ===================================
// Error Boundary — الحماية الحقيقية ضد "الشاشة البيضاء".
//
// السبب الجذري لانهيار التطبيق لشاشة بيضاء: أي خطأ غير متوقع أثناء الـ
// render (مثلاً بيانات ناقصة راجعة من السيرفر، أو خطأ فى معالجة نتيجة
// عند انقطاع الإنترنت) كان بيهرب لأعلى الشجرة كلها لأنه مفيش أي
// Error Boundary فى التطبيق بالمرة (لا فى App.tsx ولا فى أي صفحة) —
// فـ React كان بيفك تركيب الشجرة بالكامل ويسيب شاشة بيضاء فارغة.
//
// الحل: Boundary على مستوى كل صفحة (وواحد عام حوالين التطبيق كله) بحيث
// لو صفحة معينة اتعطلت، الباقي (Sidebar/Header) يفضل شغال، والصفحة نفسها
// تظهر برسالة واضحة + زر "إعادة المحاولة" بدل ما تختفي كل الواجهة.
// ===================================
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    // نسجّل الخطأ فقط، من غير ما نخفيه أو نمنع ظهوره فى الـ console —
    // الهدف هنا منع انهيار الواجهة، مش إخفاء الخطأ نفسه
    console.error(`[ErrorBoundary${this.props.boundaryName ? `:${this.props.boundaryName}` : ''}]`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      const offline = !isOnline();
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <div className="max-w-sm w-full text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-secondary-100 flex items-center justify-center mb-4">
              {offline ? (
                <WifiOff className="w-6 h-6 text-secondary-500" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-warning-600" />
              )}
            </div>
            <p className="font-semibold text-secondary-900 mb-1">
              {offline ? 'لا يوجد اتصال بالإنترنت' : 'حدث خطأ غير متوقع'}
            </p>
            <p className="text-sm text-secondary-500 mb-5">
              {offline
                ? 'تحقق من اتصالك بالإنترنت ثم أعد المحاولة.'
                : 'حاول إعادة تحميل هذا الجزء من الصفحة. إذا استمرت المشكلة، تواصل مع الدعم الفني.'}
            </p>
            <button
              onClick={this.handleRetry}
              className="btn-primary inline-flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
