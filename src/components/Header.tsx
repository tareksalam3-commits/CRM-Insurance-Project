import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, Menu, X, User, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ROLE_LABELS } from '../lib/supabase';
import { useAppStore } from '../store/appStore';
import { supabase, Notification } from '../lib/supabase';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const pageTitles: Record<string, string> = {
  '/': 'لوحة التحكم',
  '/customers': 'العملاء',
  '/policies': 'الوثائق',
  '/collection': 'التحصيل والسداد',
  '/users': 'المستخدمون',
  '/reports': 'التقارير',
  '/monthly-closing': 'تقفيل الشهر',
  '/activity-log': 'سجل العمليات',
  '/profile': 'الملف الشخصي',
  '/settings': 'الإعدادات'
};

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { sidebarCollapsed, setSidebarCollapsed } = useAppStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const getPageTitle = () => {
    const path = window.location.pathname;
    if (path === '/') return pageTitles['/'];
    const matchingKey = Object.keys(pageTitles).find((key) =>
      path.startsWith(key)
    );
    return matchingKey ? pageTitles[matchingKey] : 'CRM';
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();

      const channel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchNotifications();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setNotifications(data as Notification[]);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    }
  };

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);

    fetchNotifications();
  };

  const markAllAsRead = async () => {
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('is_read', false);

    fetchNotifications();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/customers?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'due_today':
      case 'due_this_week':
        return 'bg-warning-100 text-warning-600';
      case 'overdue':
      case 'policy_suspended':
        return 'bg-error-100 text-error-600';
      case 'payment_received':
        return 'bg-success-100 text-success-600';
      default:
        return 'bg-info-100 text-info-600';
    }
  };

  if (!user) return null;

  return (
    <header
      className={clsx(
        'fixed top-0 left-0 right-0 h-16 bg-white border-b border-secondary-200 z-30 flex items-center justify-between px-4 transition-all duration-300',
        sidebarCollapsed ? 'mr-20' : 'mr-64'
      )}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-2 rounded-lg hover:bg-secondary-100 transition-colors lg:hidden"
        >
          <Menu className="w-5 h-5 text-secondary-600" />
        </button>
        <h1 className="text-lg font-semibold text-secondary-900">
          {getPageTitle()}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {searchOpen ? (
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث..."
              className="input-field w-64"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="p-2 rounded-lg hover:bg-secondary-100"
            >
              <X className="w-5 h-5 text-secondary-600" />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-lg hover:bg-secondary-100 transition-colors"
          >
            <Search className="w-5 h-5 text-secondary-600" />
          </button>
        )}

        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-2 rounded-lg hover:bg-secondary-100 transition-colors relative"
          >
            <Bell className="w-5 h-5 text-secondary-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -left-0.5 w-4 h-4 bg-error-500 text-white text-[10px] rounded-full flex items-center justify-center font-medium">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="dropdown-menu w-80 max-h-96 overflow-hidden left-0 right-auto">
              <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-100">
                <span className="font-medium text-secondary-900">
                  الإشعارات
                </span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-primary-600 hover:text-primary-700"
                  >
                    تحديد الكل كمقروء
                  </button>
                )}
              </div>
              <div className="overflow-y-auto max-h-72 scrollbar-thin">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-secondary-500">
                    لا توجد إشعارات
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => markAsRead(notification.id)}
                      className={clsx(
                        'w-full text-right px-4 py-3 hover:bg-secondary-50 transition-colors border-b border-secondary-50 last:border-0',
                        !notification.is_read && 'bg-primary-50/30'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={clsx(
                            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                            getNotificationIcon(notification.type)
                          )}
                        >
                          <Bell className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-secondary-900">
                            {notification.title}
                          </p>
                          <p className="text-xs text-secondary-600 mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-[10px] text-secondary-400 mt-1">
                            {format(
                              new Date(notification.created_at),
                              'dd MMM yyyy, HH:mm',
                              { locale: ar }
                            )}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-secondary-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <span className="text-primary-700 font-semibold text-sm">
                  {user.name.charAt(0)}
                </span>
              )}
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-secondary-900">
                {user.name}
              </p>
              <p className="text-xs text-secondary-500">
                {ROLE_LABELS[user.role]}
              </p>
            </div>
          </button>

          {profileOpen && (
            <div className="dropdown-menu left-0 right-auto">
              <button
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/profile');
                }}
                className="dropdown-item w-full"
              >
                <User className="w-4 h-4" />
                <span>الملف الشخصي</span>
              </button>
              {user.role === 'super_admin' && (
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    navigate('/settings');
                  }}
                  className="dropdown-item w-full"
                >
                  <Settings className="w-4 h-4" />
                  <span>الإعدادات</span>
                </button>
              )}
              <hr className="my-1 border-secondary-200" />
              <button
                onClick={() => {
                  setProfileOpen(false);
                  signOut();
                }}
                className="dropdown-item w-full text-error-600 hover:text-error-700"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
