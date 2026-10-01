import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Layout } from './components/UI';
import AuthPage from './pages/AuthPage';
import AppLock from './AppLock';
import './App.css';

// Every other page is loaded on demand (code-split) instead of being bundled
// into the initial download — this is what actually fixes the "keeps
// loading for a long time" issue: previously the whole app (~570KB gzipped)
// downloaded before ANY page could render, even if you only wanted one tab.
const Dashboard          = lazy(() => import('./pages/Dashboard'));
const IncomePage         = lazy(() => import('./pages/IncomePage'));
const ExpensesPage       = lazy(() => import('./pages/ExpensesPage'));
const PortfolioPage      = lazy(() => import('./pages/PortfolioPage'));
const NetWorthPage       = lazy(() => import('./pages/NetWorthPage'));
const LoanCalculatorPage = lazy(() => import('./pages/LoanCalculatorPage'));
const SettingsPage       = lazy(() => import('./pages/SettingsPage'));
const InsurancePage      = lazy(() => import('./pages/InsurancePage'));
const BudgetPage         = lazy(() => import('./pages/BudgetPage'));
const AgriculturePage    = lazy(() => import('./pages/AgriculturePage'));
const ChangelogPage      = lazy(() => import('./pages/ChangelogPage'));

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spin-center full"><div className="spin spin-lg" /></div>;
  return user ? children : <Navigate to="/auth" />;
}

function PageLoader() {
  return <div className="spin-center full"><div className="spin spin-lg" /></div>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', fontSize: 13 } }} />
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/*" element={
              <Protected>
                <Layout>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/income" element={<IncomePage />} />
                      <Route path="/expenses" element={<ExpensesPage />} />
                      <Route path="/portfolio" element={<PortfolioPage />} />
                      <Route path="/networth" element={<NetWorthPage />} />
                      <Route path="/loans" element={<LoanCalculatorPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/insurance" element={<InsurancePage />} />
                      <Route path="/budget" element={<BudgetPage />} />
                      <Route path="/agriculture" element={<AgriculturePage />} />
                      <Route path="/changelog" element={<ChangelogPage />} />
                      {/* Removed: /reports, /goals, /cards, /banking — see
                          finboom project notes for what moved where. */}
                      <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                  </Suspense>
                </Layout>
              </Protected>
            } />
          </Routes>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;