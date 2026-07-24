import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ROLE_LABELS } from '../lib/supabase';
import { useAppStore } from '../store/appStore';
import { useSettings } from '../hooks/useSettings';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { BrandMark } from './BrandMark';
import { getBottomNavItems, getVisibleNavLayout, type NavGroup, type NavLayoutEntry, type NavItem } from '../config/navigation';
import clsx from 'clsx';

function isPathActive(pathname: string, path: string) {
  if (path === '/') return pathname === '/';
  return pathname.startsWith(path);
}

export function Sidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const {
    sidebarCollapsed, toggleSidebar,
    expandedSections, toggleSection, setSectionExpanded,
    mobileMenuOpen, openMobileMenu, closeMobileMenu,
  } = useAppStore();
  const { branding } = useSettings();

  const navLayout: NavLayoutEntry[] = user ? getVisibleNavLayout(user.role) : [];
  const bottomNavItems: NavItem[] = user ? getBottomNavItems(user.role) : [];

  // فتح القسم الذى يحتوي الصفحة الحالية تلقائياً عند كل تنقل، مع الحفاظ على
  // اختيار المستخدم اليدوي لباقي الأقسام (لا نعيد إغلاق أي قسم آخر فتحه بنفسه)
  useEffect(() => {
    const activeGroupEntry = navLayout.find(
      (entry) => entry.kind === 'group' && entry.group.items.some((item) => isPathActive(location.pathname, item.path))
    );
    if (activeGroupEntry && activeGroupEntry.kind === 'group') setSectionExpanded(activeGroupEntry.group.key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.role]);

  // إغلاق الدرج تلقائياً عند تغيير الصفحة
  useEffect(() => { closeMobileMenu(); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const isSectionExpanded = (key: string) => expandedSections[key] ?? true;

  // فلترة bottom nav الرئيسي (يعتمد على الدرجة الوظيفية — انظر getBottomNavItems)
  const isMoreActive = !bottomNavItems.some((item) => isPathActive(location.pathname, item.path));

  return (
    <div className="print:hidden">
      {/* =============================================
          DESKTOP SIDEBAR  (md وأكبر)
      ============================================= */}
      <aside
        className={clsx(
          'fixed top-0 right-0 h-full bg-white border-l border-secondary-200 z-40',
          'transition-all duration-300 flex flex-col shadow-sm',
          'hidden md:flex',
          sidebarCollapsed ? 'w-20' : 'w-64'
        )}
      >
        <div className={clsx(
          'flex items-center h-16 px-3 border-b border-secondary-100 flex-shrink-0',
          sidebarCollapsed ? 'justify-center' : 'justify-between gap-2'
        )}>
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <BrandMark className="w-10 h-10" />
              <span className="font-bold text-base text-secondary-900 leading-tight truncate">
                {branding.company_name}
              </span>
            </div>
          ) : (
            <BrandMark className="w-10 h-10" />
          )}

          {!sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-secondary-100 active:bg-secondary-200 transition-colors flex-shrink-0"
              title="طي القائمة"
            >
              <ChevronRight className="w-5 h-5 text-secondary-500" />
            </button>
          )}
        </div>

        {!sidebarCollapsed && (
          <div className="px-3 pt-3">
            <ConnectionStatusBadge variant="card" />
          </div>
        )}
        {sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="mx-auto mt-3 p-2 rounded-lg hover:bg-secondary-100 active:bg-secondary-200 transition-colors"
            title="توسيع القائمة"
          >
            <ChevronLeft className="w-5 h-5 text-secondary-500" />
          </button>
        )}

        <Link
          to="/profile"
          className={clsx(
            'pressable mx-3 mt-3 mb-1 flex items-center gap-3 rounded-xl border border-transparent',
            'hover:bg-secondary-50 hover:border-secondary-100 transition-colors duration-150',
            sidebarCollapsed ? 'justify-center p-2' : 'p-2.5'
          )}
          title="الانتقال للملف الشخصي"
        >
          <div className="w-10 h-10 rounded-full bg-primary-100 ring-2 ring-white shadow-sm flex items-center justify-center flex-shrink-0">
            {user.avatar_url
              ? <img src={user.avatar_url} alt={user.name} className="w-10 h-10 rounded-full object-cover" loading="lazy" decoding="async" />
              : <span className="text-primary-700 font-semibold">{user.name.charAt(0)}</span>
            }
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-secondary-900 truncate">{user.name}</p>
              <p className="text-xs text-secondary-500 truncate">{ROLE_LABELS[user.role]}</p>
            </div>
          )}
        </Link>

        <div className="mx-3 border-t border-secondary-100" />

        {/* روابط التنقل — مقسّمة إلى أقسام قابلة للطي/الفتح */}
        <div className="flex-1 overflow-y-auto py-3 px-2.5 scrollbar-thin">
          {sidebarCollapsed ? (
            // فى وضع الطي (أيقونات فقط) نعرض كل الصفحات فى قائمة واحدة مسطحة
            <nav className="space-y-1">
              {navLayout.flatMap((entry) => (entry.kind === 'group' ? entry.group.items : [entry.item])).map((item) => {
                const Icon = item.icon;
                const active = isPathActive(location.pathname, item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={clsx(
                      'flex items-center justify-center h-11 px-0 rounded-xl transition-all duration-200',
                      active ? 'bg-primary-50 text-primary-700' : 'text-secondary-600 hover:bg-secondary-50'
                    )}
                    title={item.label}
                  >
                    <Icon className={clsx('w-[18px] h-[18px] flex-shrink-0', active ? 'text-primary-600' : 'text-secondary-400')} />
                  </Link>
                );
              })}
            </nav>
          ) : (
            <nav className="space-y-1">
              {navLayout.map((entry) =>
                entry.kind === 'group' ? (
                  <NavGroupSection
                    key={entry.group.key}
                    group={entry.group}
                    expanded={isSectionExpanded(entry.group.key)}
                    onToggle={() => toggleSection(entry.group.key)}
                    pathname={location.pathname}
                  />
                ) : (
                  <StandaloneNavLink key={entry.item.path} item={entry.item} pathname={location.pathname} />
                )
              )}
            </nav>
          )}
        </div>

        <div className="border-t border-secondary-100 p-3">
          <button
            onClick={signOut}
            className={clsx(
              'flex items-center h-11 gap-3 w-full px-3 rounded-xl text-sm font-medium',
              'text-error-600 hover:bg-error-50 active:bg-error-100 transition-colors duration-200',
              sidebarCollapsed && 'justify-center px-0'
            )}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            {!sidebarCollapsed && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      {/* =============================================
          MOBILE BOTTOM NAVIGATION  (أصغر من md) — يعتمد على الدرجة الوظيفية
      ============================================= */}
      <nav className="md:hidden fixed bottom-0 right-0 left-0 z-40 bg-white border-t border-secondary-200 safe-area-bottom">
        <div className="flex items-stretch justify-around px-0.5 py-1">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const active = isPathActive(location.pathname, item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'pressable flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 rounded-xl flex-1 min-w-0',
                  'transition-colors duration-200 touch-target',
                  active ? 'text-primary-600' : 'text-secondary-600'
                )}
              >
                <div className={clsx('p-1.5 rounded-xl transition-all duration-200', active ? 'bg-primary-100' : '')}>
                  <Icon className={clsx('w-5 h-5', active && 'text-primary-600')} />
                </div>
                <span className={clsx('text-[10px] font-semibold leading-none truncate max-w-full', active ? 'text-primary-600' : 'text-secondary-600')}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* زر المزيد — يفتح Drawer بكل صفحات التطبيق منظمة داخل الأقسام الأربعة */}
          <button
            onClick={openMobileMenu}
            className={clsx(
              'pressable flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 rounded-xl flex-1 min-w-0',
              'transition-colors duration-200 touch-target',
              isMoreActive ? 'text-primary-600' : 'text-secondary-600'
            )}
          >
            <div className={clsx('p-1.5 rounded-xl transition-all duration-200', isMoreActive ? 'bg-primary-100' : '')}>
              <Menu className={clsx('w-5 h-5', isMoreActive && 'text-primary-600')} />
            </div>
            <span className={clsx('text-[10px] font-semibold leading-none truncate max-w-full', isMoreActive ? 'text-primary-600' : 'text-secondary-600')}>
              المزيد
            </span>
          </button>
        </div>
      </nav>

      {/* =============================================
          MOBILE FULL NAVIGATION DRAWER
          (يفتحه زر "المزيد" فى Bottom Nav أو زر ☰ فى الـ Header)
      ============================================= */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={closeMobileMenu}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn" />
          <div
            className="relative w-[78vw] max-w-80 min-w-[260px] h-full bg-white flex flex-col shadow-2xl animate-slideIn ml-auto mr-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 h-16 bg-gradient-to-l from-primary-600 to-primary-700 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {branding.company_logo_url
                  ? <img src={branding.company_logo_url} alt={branding.company_name} className="w-9 h-9 rounded-lg object-contain bg-white/15 p-0.5 flex-shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  : <BrandMark className="w-9 h-9" />}
                <span className="text-white font-bold text-sm truncate">{branding.company_name}</span>
              </div>
              <button
                onClick={closeMobileMenu}
                className="touch-target flex items-center justify-center !min-h-9 !min-w-9 rounded-lg bg-white/15 hover:bg-white/25 active:bg-white/30 transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="px-4 pt-3">
              <ConnectionStatusBadge variant="card" />
            </div>

            <Link
              to="/profile"
              onClick={closeMobileMenu}
              className="pressable mx-4 mt-3 mb-1 flex items-center gap-3 p-2.5 rounded-xl border border-secondary-100 hover:bg-secondary-50 active:bg-secondary-100 transition-colors touch-target"
            >
              <div className="w-11 h-11 rounded-full bg-primary-100 ring-2 ring-white shadow-sm flex items-center justify-center flex-shrink-0">
                {user.avatar_url
                  ? <img src={user.avatar_url} alt={user.name} className="w-11 h-11 rounded-full object-cover" loading="lazy" decoding="async" />
                  : <span className="text-primary-700 font-bold">{user.name.charAt(0)}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-secondary-900 text-sm truncate">{user.name}</p>
                <p className="text-xs text-secondary-500 truncate">{ROLE_LABELS[user.role]}</p>
              </div>
              <ChevronLeft className="w-4 h-4 text-secondary-300 flex-shrink-0" />
            </Link>

            <div className="mx-4 border-t border-secondary-100 mt-2" />

            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1 scrollbar-thin">
              {navLayout.map((entry) =>
                entry.kind === 'group' ? (
                  <NavGroupSection
                    key={entry.group.key}
                    group={entry.group}
                    expanded={isSectionExpanded(entry.group.key)}
                    onToggle={() => toggleSection(entry.group.key)}
                    pathname={location.pathname}
                    onNavigate={closeMobileMenu}
                  />
                ) : (
                  <StandaloneNavLink key={entry.item.path} item={entry.item} pathname={location.pathname} onNavigate={closeMobileMenu} />
                )
              )}
            </nav>

            <div className="border-t border-secondary-100 p-3 flex-shrink-0">
              <button
                onClick={() => { closeMobileMenu(); signOut(); }}
                className="pressable flex items-center h-11 gap-3 w-full px-3 rounded-xl text-sm font-medium text-error-600 hover:bg-error-50 active:bg-error-100 transition-colors touch-target"
              >
                <LogOut className="w-[18px] h-[18px] flex-shrink-0" /><span>تسجيل الخروج</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// قسم واحد قابل للطي/الفتح داخل الـ Sidebar (سطح المكتب فقط — فى درج
// الموبايل يظهر كل قسم مفتوحاً دائماً لتقليل عدد الضغطات للوصول لأي صفحة)
// ============================================================================
function NavGroupSection({
  group, expanded, onToggle, pathname, onNavigate,
}: {
  group: NavGroup;
  expanded: boolean;
  onToggle: () => void;
  pathname: string;
  onNavigate?: () => void;
}) {
  const GroupIcon = group.icon;

  return (
    <div className="pb-1">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full h-9 px-2 rounded-lg text-secondary-500 hover:text-secondary-800 hover:bg-secondary-50 transition-colors duration-150"
      >
        <span className="flex items-center gap-2 text-xs font-bold">
          <GroupIcon className="w-4 h-4" />
          {group.label}
        </span>
        <ChevronDown className={clsx('w-4 h-4 transition-transform duration-200', expanded ? 'rotate-0' : '-rotate-90')} />
      </button>

      <div className={clsx('grid transition-all duration-200 ease-in-out', expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden">
          <div className="space-y-1 pt-0.5 pb-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isPathActive(pathname, item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onNavigate}
                  className={clsx(
                    'pressable flex items-center h-11 gap-3 px-3 rounded-xl text-sm transition-all duration-200 touch-target',
                    active
                      ? 'bg-primary-50 text-primary-700 font-semibold'
                      : 'text-secondary-700 font-semibold hover:bg-secondary-50 hover:text-secondary-900'
                  )}
                >
                  <Icon className={clsx('w-[18px] h-[18px] flex-shrink-0 transition-colors', active ? 'text-primary-600' : 'text-secondary-400')} />
                  <span className="flex items-baseline gap-1.5 min-w-0 truncate">
                    <span className="truncate">{item.label}</span>
                    {item.subLabel && (
                      <span className="text-[11px] font-normal text-secondary-400 truncate">{item.subLabel}</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// رابط مستقل خارج أي قسم (مثل "حاسبة الأسعار") — يظهر بين قسمين مباشرة بدون
// عنوان قسم وبدون طي/فتح، بنفس شكل روابط الأقسام تماماً لثبات التصميم
// ============================================================================
function StandaloneNavLink({
  item, pathname, onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isPathActive(pathname, item.path);
  return (
    <div className="pb-1">
      <Link
        to={item.path}
        onClick={onNavigate}
        className={clsx(
          'pressable flex items-center h-11 gap-3 px-3 rounded-xl text-sm transition-all duration-200 touch-target',
          active
            ? 'bg-primary-50 text-primary-700 font-semibold'
            : 'text-secondary-700 font-semibold hover:bg-secondary-50 hover:text-secondary-900'
        )}
      >
        <Icon className={clsx('w-[18px] h-[18px] flex-shrink-0 transition-colors', active ? 'text-primary-600' : 'text-secondary-400')} />
        <span className="flex items-baseline gap-1.5 min-w-0 truncate">
          <span className="truncate">{item.label}</span>
          {item.subLabel && (
            <span className="text-[11px] font-normal text-secondary-400 truncate">{item.subLabel}</span>
          )}
        </span>
      </Link>
    </div>
  );
}