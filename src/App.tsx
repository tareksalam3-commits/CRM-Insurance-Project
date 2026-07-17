import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Login } from './pages/Login';
import { useAppStore } from './store/appStore';
import clsx from 'clsx';
import { fetchLockState, type SubscriptionLockState } from './features/subscriptions/services/subscriptionService';
import { SubscriptionLockScreen } from './features/subscriptions/components/SubscriptionLockScreen';
import { OfflineToast } from './components/OfflineToast';
import { initOfflineSync, stopOfflineSync } from './lib/offlineSync';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // تفادي إعادة الجلب غير الضرورية عند التنقل بين الصفحات أو العودة للتطبيق
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const Dashboard    = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Customers    = lazy(() => import('./pages/Customers').then(m => ({ default: m.Customers })));
const Policies     = lazy(() => import('./pages/Policies').then(m => ({ default: m.Policies })));
const PolicyDetail = lazy(() => import('./pages/PolicyDetail').then(m => ({ default: m.PolicyDetail })));
const Collection   = lazy(() => import('./pages/Collection').then(m => ({ default: m.Collection })));
const Commissions  = lazy(() => import('./pages/Commissions').then(m => ({ default: m.Commissions })));
const Users        = lazy(() => import('./pages/Users').then(m => ({ default: m.Users })));
const Reports      = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const MonthlyClosing = lazy(() => import('./pages/MonthlyClosing').then(m => ({ default: m.MonthlyClosing })));
const Cancellations = lazy(() => import('./pages/Cancellations').then(m => ({ default: m.Cancellations })));
const OrgStructure  = lazy(() => import('./pages/OrgStructure').then(m => ({ default: m.OrgStructure })));
const ActivityLog  = lazy(() => import('./pages/ActivityLog').then(m => ({ default: m.ActivityLog })));
const DataImport   = lazy(() => import('./pages/DataImport').then(m => ({ default: m.DataImport })));
const Profile      = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Settings     = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const AISettings   = lazy(() => import('./pages/AISettings').then(m => ({ default: m.AISettings })));
const SubscriptionsAdminPage = lazy(() => import('./features/subscriptions/pages/SubscriptionsAdminPage').then(m => ({ default: m.SubscriptionsAdminPage })));
const AssistantWidget = lazy(() => import('./features/assistant/AssistantWidget').then(m => ({ default: m.AssistantWidget })));
const PriceCalculator = lazy(() => import('./pages/PriceCalculator').then(m => ({ default: m.PriceCalculator })));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );
}

function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const { sidebarCollapsed }   = useAppStore();
  const location = useLocation();
  const [lockState, setLockState] = useState<SubscriptionLockState | null>(null);
  const [checkingLock, setCheckingLock] = useState(true);

  useEffect(() => {
    if (!user) {
      setCheckingLock(false);
      return;
    }
    setCheckingLock(true);
    fetchLockState()
      .then(setLockState)
      .finally(() => setCheckingLock(false));
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      initOfflineSync(user.id);
    } else {
      stopOfflineSync();
    }
  }, [user?.id]);

  if (loading || (user && checkingLock)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!user) return <Login />;

  if (lockState?.is_locked) {
    return (
      <SubscriptionLockScreen
        user={user}
        status={lockState.status}
        periodEnd={lockState.period_end}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-secondary-50">
      <Sidebar />
      <Header />

      <main className={clsx(
        'transition-all duration-300',
        // ===== Desktop: يتحرك مع الـ sidebar =====
        sidebarCollapsed ? 'md:mr-20' : 'md:mr-64',
        // ===== Mobile: padding top للـ header + bottom للـ bottom nav =====
        'pt-14 md:pt-16',
        'pb-20 md:pb-8',        // pb-20 = مكان الـ bottom nav (64px + 16px)
        'px-3 md:px-4 lg:px-8'
      )}>
        <div key={location.pathname} className="max-w-7xl mx-auto mt-3 md:mt-4 animate-fadeIn">
          <ErrorBoundary boundaryName={location.pathname}>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/"                element={<Dashboard />} />
                <Route path="/customers"       element={<Customers />} />
                <Route path="/policies"        element={<Policies />} />
                <Route path="/policies/:id"    element={<PolicyDetail />} />
                <Route path="/collection"      element={<Collection />} />
                <Route path="/commissions"     element={<Commissions />} />
                <Route path="/users"           element={<Users />} />
                <Route path="/reports"         element={<Reports />} />
                <Route path="/monthly-closing" element={<MonthlyClosing />} />
                <Route path="/cancellations"   element={<Cancellations />} />
                <Route path="/org-structure"   element={<OrgStructure />} />
                <Route path="/activity-log"    element={<ActivityLog />} />
                <Route path="/data-import"     element={<DataImport />} />
                <Route path="/profile"         element={<Profile />} />
                <Route path="/subscriptions-admin" element={<SubscriptionsAdminPage />} />
                <Route path="/settings"        element={<Settings />} />
                <Route path="/ai-settings"     element={<AISettings />} />
                <Route path="/price-calculator" element={<PriceCalculator />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <div className="print:hidden">
        <Suspense fallback={null}>
          <ErrorBoundary boundaryName="AssistantWidget">
            <AssistantWidget />
          </ErrorBoundary>
        </Suspense>

        <OfflineToast />
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary boundaryName="root">
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/*"     element={<AppLayout />} />
            </Routes>
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
