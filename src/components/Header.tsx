import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Bell, Search, X, User, Settings, LogOut, Shield, Menu,
  LayoutDashboard, Users, FileText, CreditCard, BarChart3,
  CalendarCheck, History, Network
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ROLE_LABELS, getRoleLevel, canViewSettings, canViewOrgStructure } from '../lib/supabase';
import { useAppStore } from '../store/appStore';
import { supabase, Notification } from '../lib/supabase';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';

const pageTitles: Record<string, string> = {
  '/':                'لوحة التحكم',
  '/customers':       'العملاء',
  '/policies':        'الوثائق',
  '/collection':      'التحصيل والسداد',
  '/users':           'المستخدمون',
  '/org-structure':   'الهيكل الوظيفي',
  '/reports':         'التقارير',
  '/monthly-closing': 'تقفيل الشهر',
  '/activity-log':    'سجل العمليات',
  '/profile':         'الملف الشخصي',
  '/settings':        'الإعدادات'
};

const drawerMenuItems = [
  { path: '/',                icon: LayoutDashboard, label: 'لوحة التحكم' },
  { path: '/customers',       icon: Users,           label: 'العملاء' },
  { path: '/policies',        icon: FileText,        label: 'الوثائق' },
  { path: '/collection',      icon: CreditCard,      label: 'التحصيل والسداد' },
  { path: '/org-structure',   icon: Network,         label: 'الهيكل الوظيفي', orgStructure: true },
  { path: '/reports',         icon: BarChart3,       label: 'التقارير' },
  { path: '/monthly-closing', icon: CalendarCheck,   label: 'تقفيل الشهر' },
  { path: '/activity-log',    icon: History,         label: 'سجل العمليات' },
  { path: '/profile',         icon: User,            label: 'الملف الشخصي' },
  { path: '/settings',        icon: Settings,        label: 'الإعدادات', superAdminOnly: true },
];

export function Header() {
  const { user, signOut }  = useAuth();
  const navigate           = useNavigate();
  const location           = useLocation();
  const { sidebarCollapsed, setSidebarCollapsed } = useAppStore();

  const [searchOpen,        setSearchOpen]        = useState(false);
  const [searchQuery,       setSearchQuery]       = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications,     setNotifications]     = useState<Notification[]>([]);
  const [unreadCount,       setUnreadCount]       = useState(0);
  const [profileOpen,       setProfileOpen]       = useState(false);
  const [mobileMenuOpen,    setMobileMenuOpen]    = useState(false);

  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef      = useRef<HTMLDivElement>(null);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return pageTitles['/'];
    const key = Object.keys(pageTitles).find((k) => k !== '/' && path.startsWith(k));
    return key ? pageTitles[key] : 'CRM';
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const ch = supabase.channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, fetchNotifications)
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

  // إغلاق الـ drawer عند تغيير الصفحة
  useEffect(() => { setMobileMenuOpen(false); setSearchOpen(false); }, [location.pathname]);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase.from('notifications').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    if (data) { setNotifications(data as Notification[]); setUnreadCount(data.filter((n) => !n.is_read).length); }
  };

  const markAsRead    = async (id: string) => { await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id); fetchNotifications(); };
  const markAllAsRead = async () => { if (!user) return; await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('user_id', user.id).eq('is_read', false); fetchNotifications(); };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) { navigate(`/customers?search=${encodeURIComponent(searchQuery.trim())}`); setSearchOpen(false); setSearchQuery(''); }
  };

  const getNotifColor = (type: string) => {
    if (['due_today','due_this_week'].includes(type)) return 'bg-warning-100 text-warning-600';
    if (['overdue','policy_suspended'].includes(type)) return 'bg-error-100 text-error-600';
    if (type === 'payment_received') return 'bg-success-100 text-success-600';
    return 'bg-info-100 text-info-600';
  };

  if (!user) return null;

  return (
    <>
      {/* ===========================  HEADER BAR  =========================== */}
      <header className={clsx(
        'fixed top-0 left-0 right-0 h-14 md:h-16 bg-white border-b border-secondary-200 z-30',
        'flex items-center justify-between px-3 md:px-4 transition-all duration-300',
        sidebarCollapsed ? 'md:mr-20' : 'md:mr-64'
      )}>
        {/* يسار */}
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-2 rounded-lg hover:bg-secondary-100 flex-shrink-0">
            <Menu className="w-5 h-5 text-secondary-600" />
          </button>
          <Shield className="w-5 h-5 text-primary-600 md:hidden flex-shrink-0" />
          <h1 className="text-sm md:text-lg font-semibold text-secondary-900 truncate">{getPageTitle()}</h1>
        </div>

        {/* يمين */}
        <div className="flex items-center gap-1 md:gap-2">

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
                      <button key={n.id} onClick={() => markAsRead(n.id)}
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
                  ? <img src={user.avatar_url} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
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
                  <button onClick={() => { setProfileOpen(false); navigate('/settings'); }} className="dropdown-item w-full"><Settings className="w-4 h-4" /><span>الإعدادات</span></button>
                )}
                <hr className="my-1 border-secondary-200" />
                <button onClick={() => { setProfileOpen(false); signOut(); }} className="dropdown-item w-full text-error-600"><LogOut className="w-4 h-4" /><span>تسجيل الخروج</span></button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===========================  MOBILE DRAWER  =========================== */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          {/* Drawer من اليمين */}
          <div
            className="relative w-72 max-w-[85vw] h-full bg-white flex flex-col shadow-2xl animate-slideIn ml-auto mr-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* رأس */}
            <div className="flex items-center justify-between px-4 h-14 bg-primary-600">
              <div className="flex items-center gap-2">
                <Shield className="w-7 h-7 text-white" />
                <ConnectionStatusBadge variant="light" />
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* بيانات المستخدم */}
            <div className="px-4 py-3 border-b border-secondary-100 bg-primary-50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-primary-100 border-2 border-primary-200 flex items-center justify-center flex-shrink-0">
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt={user.name} className="w-11 h-11 rounded-full object-cover" />
                    : <span className="text-primary-700 font-bold">{user.name.charAt(0)}</span>}
                </div>
                <div>
                  <p className="font-semibold text-secondary-900 text-sm">{user.name}</p>
                  <p className="text-xs text-secondary-500">{ROLE_LABELS[user.role]}</p>
                </div>
              </div>
            </div>

            {/* روابط */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
              {drawerMenuItems
                .filter((item) => {
                  if ((item as any).superAdminOnly) return canViewSettings(user.role);
                  if ((item as any).orgStructure)   return canViewOrgStructure(user.role);
                  return true;
                })
                .map((item) => {
                  const Icon   = item.icon;
                  const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
                  return (
                    <Link key={item.path} to={item.path} onClick={() => setMobileMenuOpen(false)}
                      className={clsx(
                        'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
                        active ? 'bg-primary-600 text-white' : 'text-secondary-700 hover:bg-secondary-100'
                      )}>
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
            </nav>

            {/* تسجيل الخروج */}
            <div className="border-t border-secondary-200 p-3">
              <button onClick={() => { setMobileMenuOpen(false); signOut(); }}
                className="btn btn-ghost w-full text-error-600 hover:bg-error-50 justify-start gap-3">
                <LogOut className="w-5 h-5" /><span>تسجيل الخروج</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
