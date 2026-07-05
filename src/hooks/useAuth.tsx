import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User as AuthUser } from '@supabase/supabase-js';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { supabase, User, WEBAUTHN_FUNCTIONS_URL } from '../lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  authUser: AuthUser | null;
  loading: boolean;
  signIn: (emailOrPhone: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  registerPasskey: () => Promise<{ error: Error | null }>;
  signInWithPasskey: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
    return data as User | null;
  };

  const refreshUser = async () => {
    if (session?.user) {
      const profile = await fetchUserProfile(session.user.id);
      setUser(profile);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setAuthUser(session?.user ?? null);

      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        setUser(profile);

        if (profile) {
          await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', session.user.id);
        }
      }

      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setAuthUser(session?.user ?? null);

        if (session?.user) {
          const profile = await fetchUserProfile(session.user.id);
          setUser(profile);
        } else {
          setUser(null);
        }

        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (emailOrPhone: string, password: string) => {
    const trimmed = emailOrPhone.trim();
    const isEmail = trimmed.includes('@');

    let emailToUse = trimmed;

    if (!isEmail) {
      // إدخال رقم هاتف: نبحث عن البريد الإلكتروني المرتبط به عبر دالة آمنة في قاعدة البيانات،
      // ثم نكمل تسجيل الدخول بالبريد الإلكتروني كالمعتاد (بدون OTP وبدون تغيير نظام المصادقة)
      const { data: resolvedEmail, error: lookupError } = await supabase
        .rpc('get_email_by_phone', { p_phone: trimmed });

      if (lookupError || !resolvedEmail) {
        return { error: new Error('Invalid login credentials') };
      }
      emailToUse = resolvedEmail as string;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password
    });

    return { error };
  };

  // تسجيل بصمة/بيانات جهاز جديدة للمستخدم الحالي (لازم يكون مسجل دخول الأول
  // بكلمة السر مرة واحدة قبل ما يقدر يضيف بصمة)
  const registerPasskey = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        return { error: new Error('لازم تسجل دخول الأول') };
      }

      // 1) نجيب options التسجيل من الـ Edge Function
      const optionsRes = await fetch(`${WEBAUTHN_FUNCTIONS_URL}/webauthn-register-options`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      const options = await optionsRes.json();
      if (!optionsRes.ok) {
        return { error: new Error(`[OPTIONS] ${options.error || 'تعذر بدء تسجيل البصمة'}`) };
      }

      // 2) نطلب من المتصفح إنشاء بيانات اعتماد WebAuthn (بصمة/Face ID)
      let attestationResponse;
      try {
        attestationResponse = await startRegistration({ optionsJSON: options });
      } catch (startErr: any) {
        console.error('startRegistration failed. options was:', options, startErr);
        return {
          error: new Error(
            `[START] ${startErr?.name || ''}: ${startErr?.message || startErr}`
          )
        };
      }

      // 3) نبعت النتيجة للـ Edge Function عشان تتحقق منها وتحفظها
      const verifyRes = await fetch(`${WEBAUTHN_FUNCTIONS_URL}/webauthn-register-verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          attestationResponse,
          deviceLabel: navigator.userAgent
        })
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified) {
        return { error: new Error(`[VERIFY] ${verifyData.error || 'تعذر تسجيل البصمة، حاول مرة أخرى'}`) };
      }

      return { error: null };
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        return { error: new Error('تم إلغاء العملية أو رفض الإذن') };
      }
      return { error: new Error(`[OTHER] ${err?.name || ''}: ${err?.message || err}`) };
    }
  };

  // تسجيل الدخول بالبصمة (Face ID / Touch ID / بصمة الجهاز) بدون إيميل أو باسورد
  const signInWithPasskey = async () => {
    try {
      // 1) نجيب options الدخول من الـ Edge Function (بدون الحاجة لمعرفة هوية المستخدم مسبقًا)
      const optionsRes = await fetch(`${WEBAUTHN_FUNCTIONS_URL}/webauthn-auth-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const options = await optionsRes.json();
      if (!optionsRes.ok) {
        return { error: new Error(`[OPTIONS] ${options.error || 'تعذر بدء الدخول بالبصمة'}`) };
      }

      // 2) نطلب من المتصفح تأكيد الهوية عبر البصمة/Face ID
      let assertionResponse;
      try {
        assertionResponse = await startAuthentication({ optionsJSON: options });
      } catch (startErr: any) {
        if (startErr?.name === 'NotAllowedError') {
          return { error: new Error('تم إلغاء العملية أو رفض الإذن') };
        }
        return { error: new Error(`[START] ${startErr?.name || ''}: ${startErr?.message || startErr}`) };
      }

      // 3) نبعت النتيجة للـ Edge Function عشان تتحقق وتنشئ جلسة دخول حقيقية
      const verifyRes = await fetch(`${WEBAUTHN_FUNCTIONS_URL}/webauthn-auth-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertionResponse })
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified) {
        return { error: new Error(`[VERIFY] ${verifyData.error || 'لم يتم التعرف على البصمة، حاول مرة أخرى'}`) };
      }

      // 4) نكمل تسجيل الدخول فعليًا في العميل باستخدام الـ token اللي رجع من السيرفر
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: verifyData.email,
        token_hash: verifyData.token_hash,
        type: 'email'
      });

      if (otpError) {
        return { error: new Error(`[OTP] ${otpError.message}`) };
      }

      return { error: null };
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        return { error: new Error('تم إلغاء العملية أو رفض الإذن') };
      }
      return { error: new Error(`[OTHER] ${err?.name || ''}: ${err?.message || err}`) };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setAuthUser(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        authUser,
        loading,
        signIn,
        signOut,
        refreshUser,
        registerPasskey,
        signInWithPasskey
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
