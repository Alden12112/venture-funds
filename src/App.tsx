import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/auth-context';
import { ThemeProvider } from '@/context/theme-context';
import { LanguageProvider } from '@/context/language-context';
import { AppShell } from '@/components/AppShell';
import { LandingPage } from '@/pages/LandingPage';
import { AuthPage } from '@/pages/AuthPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { MarketPage } from '@/pages/MarketPage';
import { NewsPage } from '@/pages/NewsPage';
import { LedgerPage } from '@/pages/LedgerPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AdminPage } from '@/pages/AdminPage';
import { LegalPage } from '@/pages/LegalPage';
import { useAuth } from '@/context/auth-context';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth();

  if (!ready) {
    return <div className="page-loading">正在准备会话...</div>;
  }

  if (!session) {
    return <Navigate to="/auth/login" replace state={{ reason: 'auth-required' }} />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth/:mode" element={<AuthPage />} />
            <Route path="/legal/:page" element={<LegalPage />} />
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="market" element={<MarketPage />} />
              <Route path="news" element={<NewsPage />} />
              <Route path="ledger" element={<LedgerPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminPage standalone />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
