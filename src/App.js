import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Layout } from './components/UI';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import IncomePage from './pages/IncomePage';
import ExpensesPage from './pages/ExpensesPage';
import PortfolioPage from './pages/PortfolioPage';
import NetWorthPage from './pages/NetWorthPage';
import LoanCalculatorPage from './pages/LoanCalculatorPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import InsurancePage from './pages/InsurancePage';
import GoalsPage from './pages/GoalsPage';
import CardsPage from './pages/CardsPage';
import BankingPage from './pages/BankingPage'
import './App.css';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spin-center full"><div className="spin spin-lg" /></div>;
  return user ? children : <Navigate to="/auth" />;
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
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/income" element={<IncomePage />} />
                    <Route path="/expenses" element={<ExpensesPage />} />
                    <Route path="/portfolio" element={<PortfolioPage />} />
                    <Route path="/networth" element={<NetWorthPage />} />
                    <Route path="/loans" element={<LoanCalculatorPage />} />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/insurance" element={<InsurancePage />} />
                    <Route path="/goals" element={<GoalsPage />} />
                    <Route path="/cards" element={<CardsPage />} />
                    <Route path="/banking" element={<BankingPage />} />
                  </Routes>
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