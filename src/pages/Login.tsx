import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Shield, Mail, Phone, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import clsx from 'clsx';

export function Login() {
  const [loginType, setLoginType] = useState<'email' | 'phone'>('email');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

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
