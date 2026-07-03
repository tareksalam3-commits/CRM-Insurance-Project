import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase, isPasskeySupported } from '../lib/supabase';
import { Shield, Mail, Phone, Lock, Eye, EyeOff, Loader2, Fingerprint } from 'lucide-react';
import clsx from 'clsx';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

export function Login() {
  const [loginType, setLoginType] = useState<'email' | 'phone'>('email');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const { signIn, signInWithPasskey } = useAuth();
  const navigate = useNavigate();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const passkeySupported = isPasskeySupported();

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const handleCredentialResponse = async (response: { credential: string }) => {
      setError('');
      setGoogleLoading(true);

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential
      });

      if (error) {
        setGoogleLoading(false);
        setError('حدث خطأ أثناء تسجيل الدخول بجوجل');
      }
      // عند النجاح الـ session بتتسجل تلقائياً والتطبيق هيحوّل المستخدم لوحده
    };

    const initGoogle = () => {
      if (!window.google || !googleBtnRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        cancel_on_tap_outside: true
      });

      // بنعمل رندر لزرار جوجل الأصلي (المسؤول عن ظهور نافذة اختيار الحساب
      // كـ popup حقيقي جوه نفس الصفحة) بس مخفي، وهنستخدم زرارنا المصمم
      // إحنا عشان نضغط عليه بالنيابة عن المستخدم
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: 320
      });

      setGoogleReady(true);
    };

    if (window.google) {
      initGoogle();
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval);
          initGoogle();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(emailOrPhone, password);

    if (error) {
      setLoading(false);
      if (error.message.includes('Invalid login credentials')) {
        setError('بيانات الدخول غير صحيحة');
      } else if (error.message.includes('User not found')) {
        setError('المستخدم غير موجود');
      } else {
        setError('حدث خطأ أثناء تسجيل الدخول');
      }
    } else {
      navigate('/');
    }
  };

  const handleGoogleSignIn = () => {
    setError('');

    if (!GOOGLE_CLIENT_ID) {
      setError('لم يتم إعداد تسجيل الدخول بجوجل بعد');
      return;
    }

    if (!googleReady || !googleBtnRef.current) {
      setError('جاري تجهيز تسجيل الدخول بجوجل، حاول بعد لحظة');
      return;
    }

    // بندوس بالنيابة عن المستخدم على زرار جوجل الأصلي المخفي، وهو ده اللي
    // بيفتح نافذة اختيار الحساب الحقيقية (popup صغير جوه نفس الصفحة) وبتقفل
    // نفسها تلقائياً بعد الاختيار من غير ما تخرج من التطبيق خالص
    const realButton = googleBtnRef.current.querySelector(
      'div[role="button"]'
    ) as HTMLElement | null;

    realButton?.click();
  };

  const handlePasskeySignIn = async () => {
    setError('');
    setPasskeyLoading(true);

    const { error } = await signInWithPasskey();

    if (error) {
      setPasskeyLoading(false);
      setError('لم يتم التعرف على البصمة، حاول مرة أخرى أو استخدم كلمة المرور');
    } else {
      navigate('/');
    }
  };

  const isValid = () => {
    if (loginType === 'email') {
      return emailOrPhone.includes('@') && password.length >= 6;
    }
    return emailOrPhone.length >= 10 && password.length >= 6;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card p-8 animate-fadeIn">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-secondary-900 mb-1">
              نظام CRM التأمينات
            </h1>
            <p className="text-secondary-500">سجل دخولك للوصول إلى النظام</p>
          </div>

          {passkeySupported && (
            <button
              type="button"
              onClick={handlePasskeySignIn}
              disabled={passkeyLoading || loading}
              className="w-full flex items-center justify-center gap-3 py-3 mb-3 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 font-medium hover:bg-primary-100 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {passkeyLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جاري التحقق من البصمة...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="w-5 h-5" />
                  <span>الدخول بالبصمة</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-lg border border-secondary-200 bg-white text-secondary-700 font-medium hover:bg-secondary-50 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>جاري تسجيل الدخول بجوجل...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.11H1.27a12 12 0 0 0 0 10.76l4-3.11z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.62l4 3.11C6.22 6.88 8.87 4.77 12 4.77z"
                  />
                </svg>
                <span>الدخول بحساب جوجل</span>
              </>
            )}
          </button>

          {/* زرار جوجل الأصلي بيترندر هنا مخفي، وهو المسؤول عن فتح نافذة
              اختيار الحساب الحقيقية. زرارنا المصمم فوق بيضغط عليه بالنيابة
              عن المستخدم عشان نحافظ على شكل التصميم */}
          <div ref={googleBtnRef} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', top: -9999, left: -9999 }} />

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-secondary-200"></div>
            <span className="text-xs text-secondary-400">أو</span>
            <div className="flex-1 h-px bg-secondary-200"></div>
          </div>

          <div className="flex rounded-lg bg-secondary-100 p-1 mb-6">
            <button
              onClick={() => setLoginType('email')}
              className={clsx(
                'flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200',
                loginType === 'email'
                  ? 'bg-white text-secondary-900 shadow-sm'
                  : 'text-secondary-600'
              )}
            >
              <Mail className="w-4 h-4 inline-block ml-1" />
              البريد الإلكتروني
            </button>
            <button
              onClick={() => setLoginType('phone')}
              className={clsx(
                'flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200',
                loginType === 'phone'
                  ? 'bg-white text-secondary-900 shadow-sm'
                  : 'text-secondary-600'
              )}
            >
              <Phone className="w-4 h-4 inline-block ml-1" />
              رقم الهاتف
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="input-label">
                {loginType === 'email' ? 'البريد الإلكتروني' : 'رقم الهاتف'}
              </label>
              <div className="relative">
                <input
                  type={loginType === 'email' ? 'email' : 'tel'}
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  placeholder={
                    loginType === 'email'
                      ? 'example@company.com'
                      : '01xxxxxxxxx'
                  }
                  className="input-field pe-10"
                  dir="ltr"
                  required
                />
                {loginType === 'email' ? (
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                ) : (
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="input-label">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field pe-10"
                  dir="ltr"
                  required
                  minLength={6}
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-error-50 border border-error-200 text-error-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!isValid() || loading}
              className="btn btn-primary w-full py-3"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جاري تسجيل الدخول...</span>
                </>
              ) : (
                'تسجيل الدخول'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-secondary-500 mt-6">
            نظام محمي بتقنيات أمان متقدمة
          </p>
        </div>

        <p className="text-center text-white/70 text-sm mt-4">
          جميع الحقوق محفوظة &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}