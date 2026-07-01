import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User as AuthUser } from '@supabase/supabase-js';
import { supabase, User } from '../lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  authUser: AuthUser | null;
  loading: boolean;
  signIn: (emailOrPhone: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
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
        refreshUser
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
