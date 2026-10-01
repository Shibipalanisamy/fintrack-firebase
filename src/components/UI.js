import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import toast from 'react-hot-toast';
import { MONTHS } from '../utils/helpers';

const NAV = [
  { icon: '📊', label: 'Dashboard',      to: '/' },
  { icon: '💵', label: 'Income',          to: '/income' },
  { icon: '💸', label: 'Expenses',        to: '/expenses' },
  { icon: '📈', label: 'Portfolio',       to: '/portfolio' },
  { icon: '🏛️', label: 'Net Worth',       to: '/networth' },
  { icon: '🧮', label: 'Loan Calculator', to: '/loans' },
  { icon: '🛡️', label: 'Insurance',       to: '/insurance' },
  { icon: '📅', label: 'Budget Plan',     to: '/budget' },
  { icon: '🌾', label: 'Agriculture',     to: '/agriculture' },
  { icon: '📋', label: 'Changelog', to: '/changelog' },
  { icon: '⚙️', label: 'Settings',        to: '/settings' },
  
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

const TITLES = { '/': 'Dashboard', '/insurance': 'Insurance Tracker', '/income': 'Income', '/expenses': 'Expenses', '/portfolio': 'Stock Portfolio', '/networth': 'Assets & Liabilities', '/loans': 'Loan Calculator', '/settings': 'Settings', '/budget': 'Budget Plan', '/agriculture': 'Agriculture', '/changelog': 'Changelog' };

export function Layout({ children }) {
  const { isDark, toggle } = useTheme();
  const location = useLocation();
  const [sOpen, setSOpen] = useState(false);
  return (
    <div className="layout">
      <style>{`
        .tbl thead th {
          background: var(--bg3) !important;
          color: var(--t2) !important;
          font-weight: 800 !important;
          font-size: 12px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          border-bottom: 1px solid var(--border) !important;
          padding: 11px 14px !important;
        }
        .tbl thead th:first-child { border-radius: 10px 0 0 0; }
        .tbl thead th:last-child  { border-radius: 0 10px 0 0; }
      `}</style>
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

// ─── Date Range Filter ──────────────────────────────────────
export function DateRangeFilter({ dateFrom, dateTo, onChange }) {
  const now = new Date();
  const fmt = d => d.toISOString().slice(0, 10);

  const PRESETS = [
    { label: 'This week',  from: () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return fmt(d); },                  to: () => fmt(now) },
    { label: 'This month', from: () => fmt(new Date(now.getFullYear(), now.getMonth(), 1)),                                             to: () => fmt(now) },
    { label: 'Last month', from: () => fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)),                                         to: () => fmt(new Date(now.getFullYear(), now.getMonth(), 0)) },
    { label: 'Q1',         from: () => `${now.getFullYear()}-01-01`, to: () => `${now.getFullYear()}-03-31` },
    { label: 'Q2',         from: () => `${now.getFullYear()}-04-01`, to: () => `${now.getFullYear()}-06-30` },
    { label: 'Q3',         from: () => `${now.getFullYear()}-07-01`, to: () => `${now.getFullYear()}-09-30` },
    { label: 'Q4',         from: () => `${now.getFullYear()}-10-01`, to: () => `${now.getFullYear()}-12-31` },
    { label: 'This FY',    from: () => now.getMonth() >= 3 ? `${now.getFullYear()}-04-01` : `${now.getFullYear()-1}-04-01`, to: () => now.getMonth() >= 3 ? `${now.getFullYear()+1}-03-31` : `${now.getFullYear()}-03-31` },
    { label: 'Last FY',    from: () => now.getMonth() >= 3 ? `${now.getFullYear()-1}-04-01` : `${now.getFullYear()-2}-04-01`, to: () => now.getMonth() >= 3 ? `${now.getFullYear()}-03-31` : `${now.getFullYear()-1}-03-31` },
    { label: 'All time',   from: () => '2020-01-01', to: () => fmt(now) },
  ];

  const activePreset = PRESETS.find(p => p.from() === dateFrom && p.to() === dateTo)?.label;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {/* Quick preset chips */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {PRESETS.map(p => (
          <button key={p.label} type="button" onClick={() => onChange(p.from(), p.to())}
            style={{ padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${activePreset === p.label ? 'var(--blue)' : 'var(--border2)'}`, background: activePreset === p.label ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: activePreset === p.label ? 'var(--blue)' : 'var(--t2)', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {p.label}
          </button>
        ))}
      </div>
      {/* Custom from→to */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg3)', border: '1.5px solid var(--border2)', borderRadius: 8, padding: '3px 8px' }}>
        <input type="date" value={dateFrom} onChange={e => onChange(e.target.value, dateTo)}
          style={{ background: 'none', border: 'none', outline: 'none', fontSize: 11, color: 'var(--text)', width: 110 }} />
        <span style={{ color: 'var(--t3)', fontSize: 12, fontWeight: 700 }}>→</span>
        <input type="date" value={dateTo} onChange={e => onChange(dateFrom, e.target.value)}
          style={{ background: 'none', border: 'none', outline: 'none', fontSize: 11, color: 'var(--text)', width: 110 }} />
      </div>
    </div>
  );
}

export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="ct"><div className="ct-label">{label}</div><div className="ct-val">₹{Number(payload[0].value).toLocaleString('en-IN')}</div></div>;
}

// ─── Date Stepper ──────────────────────────────────────────
// Drop-in replacement for <input type="date"> with ◀ ▶ day buttons
export function DateStepper({ value, onChange, name, required, max, min, label }) {
  const step = (days) => {
    const d = new Date(value || new Date().toISOString().split('T')[0]);
    d.setDate(d.getDate() + days);
    const iso = d.toFullYear ? d.toFullYear() : d.toISOString().split('T')[0];
    // Format as YYYY-MM-DD
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const newVal = `${y}-${m}-${day}`;
    if (max && newVal > max) return;
    if (min && newVal < min) return;
    onChange({ target: { name: name || 'date', value: newVal } });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button type="button" onClick={() => step(-1)}
        style={{ width: 28, height: 36, borderRadius: 7, border: '1.5px solid var(--border2)', background: 'var(--bg3)', color: 'var(--t2)', cursor: 'pointer', fontSize: 14, fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="Previous day">◀</button>
      <input className="fi" type="date" name={name || 'date'} value={value || ''} onChange={onChange}
        required={required} max={max} min={min}
        style={{ flex: 1, textAlign: 'center' }} />
      <button type="button" onClick={() => step(1)}
        style={{ width: 28, height: 36, borderRadius: 7, border: '1.5px solid var(--border2)', background: 'var(--bg3)', color: 'var(--t2)', cursor: 'pointer', fontSize: 14, fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="Next day">▶</button>
    </div>
  );
}