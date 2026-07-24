import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, Search, X, User, Settings, LogOut, Menu, Wallet, MessageSquare } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ROLE_LABELS } from '../lib/supabase';
import { useAppStore } from '../store/appStore';
import { useSettings } from '../hooks/useSettings';
import { supabase, Notification } from '../lib/supabase';
import { dalRead } from '../lib/dataAccessLayer';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { BrandMark } from './BrandMark';
import { PAGE_TITLES, canAccessMessages } from '../config/navigation';
import { useUnreadMessagesBadge } from '../features/messages/useMessagesRealtime';
import { BranchSelector } from './BranchSelector';

export function Header() {
  const { user, signOut }  = useAuth();
  const navigate           = useNavigate();
  const location           = useLocation();
  const { sidebarCollapsed, toggleMobileMenu, closeMobileMenu } = useAppStore();
  const { branding } = useSettings();

  const [searchOpen,        setSearchOpen]        = useState(false);
  const [searchQuery,       setSearchQuery]       = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications,     setNotifications]     = useState<Notification[]>([]);
  const [unreadCount,       setUnreadCount]       = useState(0);
  const [profileOpen,       setProfileOpen]       = useState(false);
  const unreadMessagesCount = useUnreadMessagesBadge();

  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef      = useRef<HTMLDivElement>(null);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return PAGE_TITLES['/'];
    const key = Object.keys(PAGE_TITLES).find((k) => k !== '/' && path.startsWith(k));
    return key ? PAGE_TITLES[key] : 'CRM';
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    // نشترك في INSERT (إشعار جديد) وUPDATE (تعليم كمقروء من جهاز/تبويب آخر) عشان الحالة تتزامن لحظياً بدون أي تحديث يدوي للصفحة
    const ch = supabase.channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, fetchNotifications)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, fetchNotifications)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) setNotificationsOpen(false);
      if (profileRef.current      && !profileRef.current.contains(e.target as Node))      setProfileOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // إغلاق الـ drawer والبحث عند تغيير الصفحة
  useEffect(() => { closeMobileMenu(); setSearchOpen(false); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNotifications = async () => {
    if (!user) return;
    const result = await dalRead(
      `header:notifications:${user.id}`,
      async () => {
        const { data, error } = await supabase.from('notifications').select('*')
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
        if (error) throw error;
        return (data as Notification[]) || [];
      },
      { emptyValue: [] as Notification[] },
    );
    // نتجاهل استبدال الحالة الحالية بقائمة فاضية أوفلاين لو فيه بيانات ظاهرة
    // بالفعل على الشاشة (لا داعي لإخفاء إشعارات كانت ظاهرة قبل انقطاع الاتصال)
    if (result.data.length > 0 || result.status === 'online') {
      setNotifications(result.data);
      setUnreadCount(result.data.filter((n) => !n.is_read).length);
    }
  };

  const markAsRead    = async (id: string) => { await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id); fetchNotifications(); };
  const markAllAsRead = async () => { if (!user) return; await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('user_id', user.id).eq('is_read', false); fetchNotifications(); };

  // تحديد الصفحة المرتبطة بالإشعار (إن وجدت) بالاعتماد على نفس المسارات القائمة في التطبيق
  const getNotificationLink = (n: Notification): string | null => {
    switch (n.entity_type) {
      case 'policy':         return n.entity_id ? `/policies/${n.entity_id}` : '/policies';
      case 'customer':       return '/customers';
      case 'installment':    return '/collection';
      case 'user':           return '/users';
      case 'monthly_closing':return '/monthly-closing';
      default:                return null;
    }
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    setNotificationsOpen(false);
    const link = getNotificationLink(n);
    if (link) navigate(link);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) { navigate(`/customers?search=${encodeURIComponent(searchQuery.trim())}`); setSearchOpen(false); setSearchQuery(''); }
  };

  const getNotifColor = (type: string) => {
    if (['due_today','due_this_week','month_closing_upcoming'].includes(type)) return 'bg-warning-100 text-warning-600';
    if (['overdue','policy_suspended','policy_cancelled','payment_cancelled','user_disabled','user_deleted','subscription_rejected','subscription_expired'].includes(type)) return 'bg-error-100 text-error-600';
    if (['payment_received','policy_reactivated','user_enabled','month_closing_completed','subscription_approved'].includes(type)) return 'bg-success-100 text-success-600';
    return 'bg-info-100 text-info-600';
  };

  if (!user) return null;

  return (
    <>
      {/* ===========================  HEADER BAR  =========================== */}
      <header className={clsx(
        'fixed top-0 left-0 right-0 h-14 md:h-16 bg-white border-b border-secondary-200 z-30',
        'flex items-center justify-between px-3 md:px-4 transition-all duration-300',
        'print:hidden',
        sidebarCollapsed ? 'md:mr-20' : 'md:mr-64'
      )}>
        {/* يسار */}
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={toggleMobileMenu} className="md:hidden p-2 rounded-lg hover:bg-secondary-100 flex-shrink-0">
            <Menu className="w-5 h-5 text-secondary-600" />
          </button>
          <BrandMark className="w-5 h-5 md:hidden" />
          <h1 className="text-sm md:text-lg font-semibold text-secondary-900 truncate">{getPageTitle()}</h1>
        </div>

        {/* يمين */}
        <div className="flex items-center gap-1 md:gap-2">

          {/* سلكتور الفرع — يظهر بس للمستخدمين اللي عندهم أكتر من فرع */}
          <BranchSelector />

          {/* بحث */}
          {searchOpen ? (
            <form onSubmit={handleSearch} className="flex items-center gap-1.5">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث عن عميل..." className="input-field w-32 sm:w-52 md:w-64 text-sm py-1.5" autoFocus />
              <button type="button" onClick={() => setSearchOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100">
                <X className="w-4 h-4 text-secondary-600" />
              </button>
            </form>
          ) : (
            <button onClick={() => setSearchOpen(true)} className="p-2 rounded-lg hover:bg-secondary-100">
              <Search className="w-5 h-5 text-secondary-600" />
            </button>
          )}

          {/* الرسائل — أيقونة مستقلة بمكانها الخاص، منفصلة تماماً عن الإشعارات */}
          {canAccessMessages(user.role) && (
            <button
              onClick={() => navigate('/messages')}
              className="p-2 rounded-lg hover:bg-secondary-100 relative"
              aria-label="الرسائل"
            >
              <MessageSquare className="w-5 h-5 text-secondary-600" />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-0.5 -left-0.5 w-4 h-4 bg-error-500 text-white text-[10px] rounded-full flex items-center justify-center font-medium">
                  {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                </span>
              )}
            </button>
          )}

          {/* إشعارات */}
          <div className="relative" ref={notificationRef}>
            <button onClick={() => setNotificationsOpen(!notificationsOpen)} className="p-2 rounded-lg hover:bg-secondary-100 relative">
              <Bell className="w-5 h-5 text-secondary-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -left-0.5 w-4 h-4 bg-error-500 text-white text-[10px] rounded-full flex items-center justify-center font-medium">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div className="dropdown-menu w-72 sm:w-80 max-h-96 overflow-hidden left-0 right-auto">
                <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-100">
                  <span className="font-medium text-secondary-900 text-sm">الإشعارات</span>
                  {unreadCount > 0 && <button onClick={markAllAsRead} className="text-xs text-primary-600">تحديد الكل كمقروء</button>}
                </div>
                <div className="overflow-y-auto max-h-72 scrollbar-thin">
                  {notifications.length === 0
                    ? <div className="px-4 py-8 text-center text-secondary-500 text-sm">لا توجد إشعارات</div>
                    : notifications.map((n) => (
                      <button key={n.id} onClick={() => handleNotificationClick(n)}
                        className={clsx('w-full text-right px-4 py-3 hover:bg-secondary-50 border-b border-secondary-50 last:border-0', !n.is_read && 'bg-primary-50/30')}>
                        <div className="flex items-start gap-3">
                          <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', getNotifColor(n.type))}>
                            <Bell className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-secondary-900">{n.title}</p>
                            <p className="text-xs text-secondary-600 mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-secondary-400 mt-1">{format(new Date(n.created_at), 'dd MMM, HH:mm', { locale: ar })}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* بروفايل */}
          <div className="relative" ref={profileRef}>
            <button onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-secondary-100">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                {user.avatar_url
                  ? <img src={user.avatar_url} alt={user.name} className="w-8 h-8 rounded-full object-cover" loading="lazy" decoding="async" />
                  : <span className="text-primary-700 font-semibold text-sm">{user.name.charAt(0)}</span>}
              </div>
              <div className="hidden lg:block text-right">
                <p className="text-sm font-medium text-secondary-900 leading-tight">{user.name}</p>
                <p className="text-xs text-secondary-500 leading-tight">{ROLE_LABELS[user.role]}</p>
              </div>
            </button>
            {profileOpen && (
              <div className="dropdown-menu left-0 right-auto min-w-[180px]">
                <button onClick={() => { setProfileOpen(false); navigate('/profile'); }} className="dropdown-item w-full"><User className="w-4 h-4" /><span>الملف الشخصي</span></button>
                {user.role === 'super_admin' && (
                  <button onClick={() => { setProfileOpen(false); navigate('/subscriptions-admin'); }} className="dropdown-item w-full"><Wallet className="w-4 h-4" /><span>الاشتراكات</span></button>
                )}
                {user.role === 'super_admin' && (
                  <button onClick={() => { setProfileOpen(false); navigate('/settings'); }} className="dropdown-item w-full"><Settings className="w-4 h-4" /><span>إعدادات النظام</span></button>
                )}
                <hr className="my-1 border-secondary-200" />
                <button onClick={() => { setProfileOpen(false); signOut(); }} className="dropdown-item w-full text-error-600"><LogOut className="w-4 h-4" /><span>تسجيل الخروج</span></button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
