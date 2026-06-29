import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Users as UsersIcon,
  BarChart3,
  CalendarCheck,
  User,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Shield
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ROLE_LABELS, getRoleLevel, canViewSettings, canManageUsers } from '../lib/supabase';
import { useAppStore } from '../store/appStore';
import clsx from 'clsx';

const menuItems = [
  { path: '/',               icon: LayoutDashboard, label: 'لوحة التحكم' },
  { path: '/customers',      icon: Users,            label: 'العملاء' },
  { path: '/policies',       icon: FileText,         label: 'الوثائق' },
  { path: '/collection',     icon: CreditCard,       label: 'التحصيل والسداد' },
  { path: '/users',          icon: UsersIcon,        label: 'المستخدمون', management: true },
  { path: '/reports',        icon: BarChart3,        label: 'التقارير' },
  { path: '/monthly-closing',icon: CalendarCheck,    label: 'تقفيل الشهر' },
  { path: '/activity-log',   icon: History,          label: 'سجل العمليات' },
  { path: '/profile',        icon: User,             label: 'الملف الشخصي' },
  { path: '/settings',       icon: Settings,         label: 'الإعدادات', superAdminOnly: true }
];

// الأيتمز الثابتة في bottom nav على الموبايل
const bottomNavItemsBase = [
  { path: '/',           icon: LayoutDashboard, label: 'الرئيسية',    management: false },
  { path: '/customers',  icon: Users,            label: 'العملاء',     management: false },
  { path: '/policies',   icon: FileText,         label: 'الوثائق',     management: false },
  { path: '/collection', icon: CreditCard,       label: 'التحصيل',     management: false },
  { path: '/users',      icon: UsersIcon,        label: 'المستخدمون',  management: true  },
  { path: '/profile',    icon: User,             label: 'حسابي',       management: false },
];

export function Sidebar() {
  const location  = useLocation();
  const { user, signOut } = useAuth();
  const { sidebarCollapsed, toggleSidebar, setSidebarCollapsed } = useAppStore();

  if (!user) return null;

  const filteredItems = menuItems.filter((item) => {
    if (item.superAdminOnly) return canViewSettings(user.role);
    if (item.management)     return canManageUsers(user.role);
    return true;
  });

  // فلترة bottom nav: إظهار "المستخدمون" فقط لـ super_admin و development_manager
  const bottomNavItems = bottomNavItemsBase.filter((item) => {
    if (item.management) return canManageUsers(user.role);
    return true;
  });

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* =============================================
          DESKTOP SIDEBAR  (md وأكبر)
      ============================================= */}
      <aside
        className={clsx(
          'fixed top-0 right-0 h-full bg-white border-l border-secondary-200 z-40',
          'transition-all duration-300 flex flex-col',
          'hidden md:flex',          // مخفي على الموبايل تماماً
          sidebarCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-secondary-200">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <Shield className="w-8 h-8 text-primary-600" />
              <span className="font-bold text-lg text-secondary-900">CRM</span>
            </div>
          )}
          {sidebarCollapsed && <Shield className="w-8 h-8 text-primary-600 mx-auto" />}
          <button
            onClick={toggleSidebar}
            className={clsx(
              'p-2 rounded-lg hover:bg-secondary-100 transition-colors',
              sidebarCollapsed && 'mx-auto'
            )}
          >
            {sidebarCollapsed
              ? <ChevronLeft  className="w-5 h-5 text-secondary-600" />
              : <ChevronRight className="w-5 h-5 text-secondary-600" />}
          </button>
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto py-4 px-2 scrollbar-thin">
          <nav className="space-y-1">
            {filteredItems.map((item) => {
              const Icon   = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'sidebar-link',
                    active && 'active',
                    sidebarCollapsed && 'justify-center px-3'
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User + Logout */}
        <div className="border-t border-secondary-200 p-4">
          <div className={clsx('flex items-center gap-3 mb-3', sidebarCollapsed && 'justify-center')}>
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              {user.avatar_url
                ? <img src={user.avatar_url} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                : <span className="text-primary-700 font-semibold">{user.name.charAt(0)}</span>
              }
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-secondary-900 truncate">{user.name}</p>
                <p className="text-xs text-secondary-500 truncate">{ROLE_LABELS[user.role]}</p>
              </div>
            )}
          </div>
          <button
            onClick={signOut}
            className={clsx(
              'btn btn-ghost w-full text-error-600 hover:bg-error-50 hover:text-error-700',
              sidebarCollapsed && 'p-2'
            )}
          >
            <LogOut className="w-5 h-5" />
            {!sidebarCollapsed && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      {/* =============================================
          MOBILE BOTTOM NAVIGATION  (أصغر من md)
      ============================================= */}
      <nav className="md:hidden fixed bottom-0 right-0 left-0 z-40 bg-white border-t border-secondary-200 safe-area-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {bottomNavItems.map((item) => {
            const Icon   = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl flex-1 transition-all duration-200',
                  active
                    ? 'text-primary-600'
                    : 'text-secondary-400 hover:text-secondary-600'
                )}
              >
                <div className={clsx(
                  'p-1.5 rounded-xl transition-all duration-200',
                  active ? 'bg-primary-100' : ''
                )}>
                  <Icon className={clsx('w-5 h-5', active && 'text-primary-600')} />
                </div>
                <span className={clsx(
                  'text-[10px] font-medium leading-none',
                  active ? 'text-primary-600' : 'text-secondary-400'
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
