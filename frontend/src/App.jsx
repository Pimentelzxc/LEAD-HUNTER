import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/AuthContext.jsx';
import { isConfigured } from './lib/supabase.js';
import { Layout } from './components/Layout.jsx';
import { ToastProvider } from './components/ui.jsx';
import { SearchPage } from './pages/SearchPage.jsx';
import { LeadsPage } from './pages/LeadsPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { HelpPage, LegalPage } from './pages/InfoPages.jsx';

function Guard() {
  const { loading, user } = useAuth();
  if (loading) return <div className="full-loader"><LoaderCircle className="spin" size={26} /><span>Carregando workspace…</span></div>;
  if (isConfigured && !user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function UserLayout() {
  const { user } = useAuth();
  return <Layout key={user?.id || 'setup'} />;
}

export function App() {
  return <AuthProvider><ToastProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/termos" element={<LegalPage kind="terms" />} />
    <Route path="/privacidade" element={<LegalPage kind="privacy" />} />
    <Route element={<Guard />}><Route element={<UserLayout />}>
      <Route index element={<Navigate to="/buscar" replace />} />
      <Route path="buscar" element={<SearchPage />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="leads" element={<LeadsPage />} />
      <Route path="favoritos" element={<LeadsPage favoritesOnly />} />
      <Route path="configuracoes" element={<SettingsPage />} />
      <Route path="ajuda" element={<HelpPage />} />
      <Route path="*" element={<Navigate to="/buscar" replace />} />
    </Route></Route>
  </Routes></ToastProvider></AuthProvider>;
}
