import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import toast from 'react-hot-toast';
import { MONTHS } from '../utils/helpers';

const NAV = [
  { icon: '📊', label: 'Dashboard', to: '/' },
  { icon: '💵', label: 'Income', to: '/income' },
  { icon: '💸', label: 'Expenses', to: '/expenses' },
  { icon: '📈', label: 'Portfolio', to: '/portfolio' },
  { icon: '🏛️', label: 'Net Worth', to: '/networth' },
  { icon: '🧮', label: 'Loan Calculator', to: '/loans' },
  { icon: '📉', label: 'Reports', to: '/reports' },
  { icon: '🛡️', label: 'Insurance', to: '/insurance' },
  { icon: '⚙️', label: 'Settings', to: '/settings' },
];

export function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  return (
    <>
      <div className={`s-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon">💰</div>
          <div><div className="brand-name">FinTrack</div><div className="brand-sub">Personal Finance</div></div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-group">
            <div className="nav-group-label">Navigation</div>
            {NAV.map(n => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                <span className="ni">{n.icon}</span>{n.label}
              </NavLink>
            ))}
          </div>
          <div className="nav-group" style={{ marginTop: 12 }}>
            <div className="nav-group-label">Preferences</div>
            <button className="nav-link" onClick={toggle}><span className="ni">{isDark ? '☀️' : '🌙'}</span>{isDark ? 'Light Mode' : 'Dark Mode'}</button>
            <button className="nav-link" onClick={() => { logout(); toast.success('Logged out'); }}><span className="ni">🚪</span>Sign Out</button>
          </div>
        </nav>
        <div className="sidebar-footer">
          {user && <div className="user-pill"><div className="avatar">{user.displayName?.[0]?.toUpperCase()}</div><div><div className="user-name">{user.displayName}</div><div className="user-email">{user.email}</div></div></div>}
        </div>
      </aside>
    </>
  );
}

const TITLES = { '/': 'Dashboard', '/insurance': 'Insurance Tracker', '/income': 'Income', '/expenses': 'Expenses', '/portfolio': 'Stock Portfolio', '/networth': 'Assets & Liabilities', '/loans': 'Loan Calculator', '/reports': 'Reports', '/settings': 'Settings' };

export function Layout({ children }) {
  const { isDark, toggle } = useTheme();
  const location = useLocation();
  const [sOpen, setSOpen] = useState(false);
  return (
    <div className="layout">
      <Sidebar open={sOpen} onClose={() => setSOpen(false)} />
      <div className="main">
        <header className="topbar">
          <div className="flex items-center gap-2">
            <button className="hamburger" onClick={() => setSOpen(true)}><span /><span /><span /></button>
            <span className="topbar-title">{TITLES[location.pathname] || 'FinTrack'}</span>
          </div>
          <div className="topbar-right">
            <button className="btn-icon" onClick={toggle}>{isDark ? '☀️' : '🌙'}</button>
          </div>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head"><div className="modal-title">{title}</div><button className="btn-ghost" onClick={onClose} style={{ fontSize: 20 }}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDelete({ onConfirm, onCancel }) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 340, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🗑️</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Delete this item?</div>
        <div className="text-muted fs-13 mb-5">This cannot be undone.</div>
        <div className="flex gap-3" style={{ justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export function MonthYearFilter({ month, year, setMonth, setYear }) {
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  return (
    <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
      <select className="fs btn-sm" value={month} onChange={e => setMonth(+e.target.value)}>{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
      <select className="fs btn-sm" value={year} onChange={e => setYear(+e.target.value)}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
    </div>
  );
}

export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="ct"><div className="ct-label">{label}</div><div className="ct-val">₹{Number(payload[0].value).toLocaleString('en-IN')}</div></div>;
}
