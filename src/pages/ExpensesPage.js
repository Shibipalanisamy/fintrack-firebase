import { useState, useEffect, useCallback, useRef } from 'react';
import { db, auth } from '../utils/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { expenseService, categoryService, recurringService, groupService, insuranceService, dividendService, stockMasterService } from '../utils/dbService';
import { fmt, fmtDate, fmtDateInput, today, exportCSV, importCSV } from '../utils/helpers';
import { Modal, ConfirmDelete, MonthYearFilter, DateStepper, DateRangeFilter } from '../components/UI';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend, CartesianGrid, LineChart, Line, ReferenceLine } from 'recharts';
import { PALETTE } from '../utils/helpers';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

// ─── Indian-time formatter for updatedAt ──────────────────
const fmtIST = (dt) => {
  if (!dt) return '—';
  try {
    return new Date(dt).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return '—'; }
};

// ─── Note Cell (click to reveal) ──────────────────────────
function NoteCell({ note }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ maxWidth: 180 }}>
      {show
        ? <span style={{ fontSize: 12, color: 'var(--text)', cursor: 'pointer', lineHeight: 1.4 }} onClick={() => setShow(false)} title="Click to hide">
            {note} <span style={{ color: 'var(--t3)', fontSize: 10 }}>▲</span>
          </span>
        : <button onClick={() => setShow(true)}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: 'var(--t3)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            title={note}>
            👁 View
          </button>
      }
    </div>
  );
}


// ─── Searchable Category Dropdown ─────────────────────────
function CategoryDropdown({ cats, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const favCats = cats.filter(c => c.isFavorite);
  const otherCats = cats.filter(c => !c.isFavorite);
  const filterCats = (list) => list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const select = (name) => { onChange(name); setOpen(false); setSearch(''); };
  const selected = cats.find(c => c.name === value);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="fi" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: selected.color || '#aaa', flexShrink: 0 }} />}
          <span className="fs-13">{value || 'Select category'}</span>
          {selected?.isFavorite && <span style={{ fontSize: 10 }}>⭐</span>}
        </div>
        <span style={{ fontSize: 10, color: 'var(--t3)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.3)', maxHeight: 280, display: 'flex', flexDirection: 'column', marginTop: 4 }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', borderRadius: 7, padding: '6px 10px' }}>
              <span style={{ fontSize: 12 }}>🔍</span>
              <input autoFocus style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, flex: 1 }} placeholder="Search category..." value={search} onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()} />
              {search && <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 11 }}>✕</button>}
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filterCats(favCats).length > 0 && <><div style={{ padding: '6px 12px 3px', fontSize: 10, fontWeight: 800, color: 'var(--t3)', textTransform: 'uppercase' }}>⭐ Favourites</div>{filterCats(favCats).map(c => (<div key={c.id} onClick={() => select(c.name)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color || '#aaa', flexShrink: 0 }} /><span className="fs-13">{c.name}</span>{value === c.name && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--blue)' }}>✓</span>}</div>))}</>}
            {filterCats(otherCats).length > 0 && <><div style={{ padding: '6px 12px 3px', fontSize: 10, fontWeight: 800, color: 'var(--t3)', textTransform: 'uppercase' }}>All Categories</div>{filterCats(otherCats).map(c => (<div key={c.id} onClick={() => select(c.name)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color || '#aaa', flexShrink: 0 }} /><span className="fs-13">{c.name}</span>{value === c.name && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--blue)' }}>✓</span>}</div>))}</>}
            {filterCats([...favCats, ...otherCats]).length === 0 && <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No categories found</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Amount Calculator ─────────────────────────────────────
function AmountInput({ value, onChange }) {
  const [expr, setExpr] = useState(value ? String(value) : '');
  const [calcResult, setCalcResult] = useState(null);
  const handleChange = (e) => {
    const val = e.target.value; setExpr(val);
    const cleaned = val.replace(/[^0-9+\-*/().]/g, '');
    if (/[+\-*/]/.test(cleaned)) {
      try { const result = Function('"use strict"; return (' + cleaned + ')')(); if (isFinite(result) && result >= 0) { setCalcResult(result.toFixed(2)); onChange(result.toFixed(2)); } }
      catch { setCalcResult(null); }
    } else { setCalcResult(null); onChange(val); }
  };
  const applyCalc = () => { if (calcResult !== null) { setExpr(calcResult); onChange(calcResult); setCalcResult(null); } };
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', fontSize: 13, pointerEvents: 'none' }}>Rs</span>
        <input className="fi" style={{ paddingLeft: 28, paddingRight: calcResult ? 90 : 10, fontFamily: 'monospace' }} value={expr} onChange={handleChange} placeholder="0 or 100+50" required />
        {calcResult && <button type="button" onClick={applyCalc} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>= {calcResult}</button>}
      </div>
      <div className="flex gap-1" style={{ marginTop: 6 }}>
        {['+', '-', '*', '/'].map(op => (<button key={op} type="button" onClick={() => setExpr(p => p + op)} style={{ flex: 1, padding: '5px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{op}</button>))}
        <button type="button" onClick={() => { setExpr(''); setCalcResult(null); onChange(''); }} style={{ flex: 1, padding: '5px', background: 'rgba(244,63,94,.1)', border: '1px solid rgba(244,63,94,.2)', borderRadius: 6, color: 'var(--red)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>C</button>
      </div>
      {calcResult && <div style={{ marginTop: 5, fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>{expr} = Rs {calcResult} — click green button to apply</div>}
    </div>
  );
}

// ─── Expense Form ──────────────────────────────────────────
function ExpForm({ item, cats, onSave, onClose }) {
  const STATIC_PAID_VIA = ['Paytm', 'Cash', 'Cash Wallet', '💵 Meal Card', 'UTS Wallet', 'Amazon Wallet'];
  const [bankPaidVia, setBankPaidVia] = useState([]);
  const [cardPaidVia, setCardPaidVia] = useState([]);
  const [f, setF] = useState({ date: today(), category: cats.find(c => c.isFavorite)?.name || cats[0]?.name || 'Grocery', itemName: '', paidVia: '', amount: '', notes: '', ...(item ? { ...item, date: fmtDateInput(item.date) } : {}) });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async e => { e.preventDefault(); const amt = parseFloat(f.amount); if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; } setLoading(true); try { await onSave({ ...f, amount: amt }); } finally { setLoading(false); } };

  // Load bank accounts and cards from Firestore and merge with static list
  useEffect(() => {
    const uid = auth.currentUser?.uid; if (!uid) return;

    // Fetch bank accounts
    getDocs(query(collection(db, 'bankaccounts'), where('userId', '==', uid)))
      .then(snap => {
        const names = snap.docs.map(d => d.data().name).filter(Boolean).sort();
        setBankPaidVia(names);
        // Pre-select first bank if no item being edited and no paidVia set
        if (!item && !f.paidVia && names.length > 0) setF(p => ({ ...p, paidVia: names[0] }));
      })
      .catch(() => {});

    // Fetch cards
    getDocs(query(collection(db, 'cards'), where('userId', '==', uid)))
      .then(snap => {
        const labels = snap.docs
          .map(d => d.data())
          .filter(c => c.isActive !== false)
          .map(c => c.last4 ? `${c.name} (****${c.last4})` : c.name)
          .sort();
        setCardPaidVia(labels);
      })
      .catch(() => {});
  }, []);

  // Merged list: bank accounts first, then cards, then static wallets
  const allPaidVia = [
    ...bankPaidVia,
    ...cardPaidVia.filter(c => !bankPaidVia.includes(c)),
    ...STATIC_PAID_VIA.filter(s => !bankPaidVia.includes(s) && !cardPaidVia.includes(s)),
  ];

  return (
    <form onSubmit={submit}>
      <div className="frow"><div className="fg"><label className="fl">Date</label><DateStepper name="date" value={f.date} onChange={ch} required max={today()} /></div></div>
      <div className="fg"><label className="fl">Amount (Rs) — type expression like 100+50</label><AmountInput value={f.amount} onChange={val => setF(p => ({ ...p, amount: val }))} /></div>
      <div className="fg"><label className="fl">Category</label><CategoryDropdown cats={cats} value={f.category} onChange={val => setF(p => ({ ...p, category: val }))} /></div>

      <div className="fg">
        <label className="fl">
          Paid Via
          {bankPaidVia.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--green)', fontWeight: 700, background: 'rgba(34,197,94,.1)', borderRadius: 10, padding: '1px 7px' }}>🏦 {bankPaidVia.length} bank{bankPaidVia.length > 1 ? 's' : ''} linked</span>}
          {cardPaidVia.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--blue)', fontWeight: 700, background: 'rgba(77,158,255,.1)', borderRadius: 10, padding: '1px 7px' }}>💳 {cardPaidVia.length} card{cardPaidVia.length > 1 ? 's' : ''}</span>}
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4 }}>
          {allPaidVia.map(p => {
            const isBank = bankPaidVia.includes(p);
            const isCard = cardPaidVia.includes(p);
            return (
              <button key={p} type="button" onClick={() => setF(prev => ({ ...prev, paidVia: p }))}
                style={{ padding: '7px 6px', borderRadius: 8, border: `2px solid ${f.paidVia === p ? (isBank ? 'var(--blue)' : isCard ? '#7c3aed' : 'var(--border2)') : 'var(--border2)'}`, background: f.paidVia === p ? (isBank ? 'rgba(77,158,255,.12)' : isCard ? 'rgba(124,58,237,.1)' : 'rgba(148,163,184,.1)') : 'var(--bg3)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: f.paidVia === p ? (isBank ? 'var(--blue)' : isCard ? '#7c3aed' : 'var(--text)') : 'var(--t3)', textAlign: 'center', lineHeight: 1.3, transition: 'all .15s', position: 'relative' }}>
                {isBank && <span style={{ position: 'absolute', top: 3, right: 4, fontSize: 8, color: 'var(--green)', fontWeight: 900 }}>🏦</span>}
                {isCard && !isBank && <span style={{ position: 'absolute', top: 3, right: 4, fontSize: 8, fontWeight: 900 }}>💳</span>}
                {p}
              </button>
            );
          })}
        </div>
        {f.paidVia && bankPaidVia.includes(f.paidVia) && (
          <div style={{ marginTop: 5, fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>✅ Will deduct from <strong>{f.paidVia}</strong> balance in Banking page</div>
        )}
        {f.paidVia && cardPaidVia.includes(f.paidVia) && (
          <div style={{ marginTop: 5, fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>💳 Paid via card — <strong>{f.paidVia}</strong></div>
        )}
      </div>
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" name="notes" value={f.notes} onChange={ch} rows={2} /></div>
      <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spin" /> : null}{item ? 'Update' : 'Add Expense'}</button></div>
    </form>
  );
}

// ─── Percentage Tab ────────────────────────────────────────
// ─── Group Form Modal ──────────────────────────────────────
const ICON_OPTIONS = ['🏠','📈','🚗','🎫','🏥','🍔','👗','🎓','💡','🛒','💰','🎮','✈️','🐾','🏋️','📱','🛠️','🎁','🧴','🏦'];
const COLOR_OPTIONS = ['#f97316','#22c55e','#93c5fd','#a78bfa','#fbbf24','#f43f5e','#38bdf8','#fb7185','#10d98a','#e879f9','#94a3b8','#facc15'];

function GroupForm({ group, allCats, onSave, onClose }) {
  const [label, setLabel]       = useState(group?.label || '');
  const [icon, setIcon]         = useState(group?.icon || '🏠');
  const [color, setColor]       = useState(group?.color || '#f97316');
  const [categories, setCategories] = useState(group?.categories || []);
  const [catSearch, setCatSearch]   = useState('');
  const [saving, setSaving]         = useState(false);

  const toggleCat = (name) => setCategories(prev =>
    prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
  );

  const filteredCats = allCats.filter(c =>
    c.name.toLowerCase().includes(catSearch.toLowerCase()) && c.type === 'expense'
  );

  const submit = async () => {
    if (!label.trim()) { toast.error('Group name is required'); return; }
    if (categories.length === 0) { toast.error('Select at least one category'); return; }
    setSaving(true);
    try { await onSave({ label: label.trim(), icon, color, categories }); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {/* Name */}
      <div className="fg">
        <label className="fl">Group Name</label>
        <input className="fi" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. House Expenses" />
      </div>

      {/* Icon picker */}
      <div className="fg">
        <label className="fl">Icon</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ICON_OPTIONS.map(ic => (
            <button key={ic} type="button" onClick={() => setIcon(ic)}
              style={{ width: 36, height: 36, borderRadius: 8, fontSize: 18, border: `2px solid ${icon === ic ? 'var(--blue)' : 'var(--border2)'}`, background: icon === ic ? 'rgba(77,158,255,.12)' : 'var(--bg3)', cursor: 'pointer' }}>
              {ic}
            </button>
          ))}
        </div>
      </div>

      {/* Color picker */}
      <div className="fg">
        <label className="fl">Color</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COLOR_OPTIONS.map(cl => (
            <button key={cl} type="button" onClick={() => setColor(cl)}
              style={{ width: 28, height: 28, borderRadius: '50%', background: cl, border: `3px solid ${color === cl ? 'var(--text)' : 'transparent'}`, cursor: 'pointer', boxSizing: 'border-box' }} />
          ))}
        </div>
      </div>

      {/* Category multi-select */}
      <div className="fg">
        <label className="fl">Categories <span style={{ color: 'var(--t3)', fontWeight: 400 }}>({categories.length} selected)</span></label>
        <input className="fi" style={{ marginBottom: 8 }} placeholder="🔍 Search categories..." value={catSearch} onChange={e => setCatSearch(e.target.value)} />
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border2)', borderRadius: 8, padding: 6 }}>
          {filteredCats.length === 0
            ? <div style={{ padding: '12px', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No categories found</div>
            : filteredCats.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: categories.includes(c.name) ? 'rgba(77,158,255,.08)' : 'transparent' }}>
                <input type="checkbox" checked={categories.includes(c.name)} onChange={() => toggleCat(c.name)}
                  style={{ accentColor: color, width: 14, height: 14, cursor: 'pointer' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color || '#aaa', flexShrink: 0 }} />
                <span className="fs-13">{c.name}</span>
              </label>
            ))
          }
        </div>
        {categories.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {categories.map(c => (
              <span key={c} onClick={() => toggleCat(c)}
                style={{ background: color + '22', border: `1px solid ${color}55`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, color, cursor: 'pointer' }}>
                {c} ✕
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? <span className="spin" /> : null} {group ? 'Update Group' : 'Create Group'}
        </button>
      </div>
    </div>
  );
}

// ─── Group Summary Tab ─────────────────────────────────────
function DailySpendingTab({ items, showFixed }) {
  const [expandedDay, setExpandedDay] = useState(null);

  // Exclude recurring-generated expenses entirely from Daily view
  const nonRecurringItems = items.filter(i => !String(i.notes || '').startsWith('[Recurring]'));

  // Group by date — only non-recurring
  const dayMap = {};
  nonRecurringItems.forEach(i => {
    const d = typeof i.date === 'object' ? i.date.toISOString().split('T')[0] : String(i.date).split('T')[0];
    if (!dayMap[d]) dayMap[d] = { date: d, total: 0, items: [] };
    dayMap[d].total += +i.amount;
    dayMap[d].items.push(i);
  });

  const days = Object.values(dayMap).sort((a, b) => new Date(b.date) - new Date(a.date));
  const monthTotal = nonRecurringItems.reduce((s, i) => s + +i.amount, 0);
  const avgPerDay = days.length > 0 ? monthTotal / days.length : 0;
  const maxDay = days.length > 0 ? Math.max(...days.map(d => d.total)) : 0;

  const getDayLabel = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.getTime() === today.getTime()) return 'Today';
    if (d.getTime() === yesterday.getTime()) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const getBarColor = (total) => {
    if (total > avgPerDay * 1.5) return 'var(--red)';
    if (total > avgPerDay) return '#f59e0b';
    return 'var(--green)';
  };

  if (items.length === 0) return (
    <div className="card"><div className="empty"><div className="empty-icon">📅</div><div className="empty-title">{showFixed ? 'No expenses this month' : 'No variable expenses this month'}</div></div></div>
  );

  return (
    <div>
      {/* Summary row */}
      {!showFixed && (
        <div style={{ background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8, padding:'8px 14px', marginBottom:10, fontSize:12, color:'var(--orange)', fontWeight:700 }}>
          🔀 Variable only — Fixed expenses (House Rent, RD, Gold) excluded from daily view
        </div>
      )}
      <div className="stats mb-4">
        {[
          { icon: '📅', label: 'Days with Spending', val: days.length, c: 'var(--blue)' },
          { icon: '💸', label: 'Month Total', val: fmt(monthTotal), c: 'var(--red)' },
          { icon: '📊', label: 'Daily Average', val: fmt(avgPerDay), c: 'var(--orange)' },
          { icon: '🔺', label: 'Highest Day', val: fmt(maxDay), c: 'var(--purple)' },
        ].map((s, i) => (
          <div key={i} className="stat" style={{ '--c': s.c }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-val" style={{ color: s.c }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Day cards */}
      <div style={{ display: 'grid', gap: 10 }}>
        {days.map(day => {
          const isOpen = expandedDay === day.date;
          const barPct = maxDay > 0 ? (day.total / maxDay) * 100 : 0;
          const barColor = getBarColor(day.total);
          const catMap = {};
          day.items.forEach(i => { catMap[i.category] = (catMap[i.category] || 0) + +i.amount; });
          const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

          return (
            <div key={day.date} style={{ background: 'var(--bg2)', border: `1.5px solid ${isOpen ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color .2s' }}>
              {/* Day header — always visible */}
              <div
                onClick={() => setExpandedDay(isOpen ? null : day.date)}
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
              >
                {/* Date badge */}
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '6px 10px', textAlign: 'center', minWidth: 52, flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: 'var(--text)' }}>
                    {new Date(day.date + 'T00:00:00').getDate()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600 }}>
                    {new Date(day.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase()}
                  </div>
                </div>

                {/* Bar + info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="fw-700 fs-13">{getDayLabel(day.date)}</span>
                    <div className="flex items-center gap-2">
                      <span className="fs-11 text-muted">{day.items.length} item{day.items.length > 1 ? 's' : ''}</span>
                      <span style={{ fontWeight: 900, fontSize: 15, color: barColor }}>{fmt(day.total)}</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: barColor, borderRadius: 4, transition: 'width .4s' }} />
                  </div>
                  {/* Top cats inline */}
                  <div className="flex gap-1 mt-1" style={{ flexWrap: 'wrap' }}>
                    {topCats.slice(0, 4).map(([cat, amt]) => (
                      <span key={cat} style={{ fontSize: 10, background: 'var(--bg3)', borderRadius: 20, padding: '1px 7px', color: 'var(--t2)', fontWeight: 600 }}>
                        {cat} · {fmt(amt)}
                      </span>
                    ))}
                    {topCats.length > 4 && <span style={{ fontSize: 10, color: 'var(--t3)', padding: '1px 4px' }}>+{topCats.length - 4} more</span>}
                  </div>
                </div>

                {/* vs avg indicator */}
                <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 44 }}>
                  {day.total > avgPerDay
                    ? <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>▲ {((day.total / avgPerDay - 1) * 100).toFixed(0)}%<br /><span style={{ color: 'var(--t3)', fontWeight: 400 }}>vs avg</span></div>
                    : <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>▼ {((1 - day.total / avgPerDay) * 100).toFixed(0)}%<br /><span style={{ color: 'var(--t3)', fontWeight: 400 }}>vs avg</span></div>}
                  <div style={{ fontSize: 14, marginTop: 4 }}>{isOpen ? '▲' : '▼'}</div>
                </div>
              </div>

              {/* Expanded: all items for this day */}
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg3)' }}>
                  {/* Category summary */}
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {topCats.map(([cat, amt]) => (
                      <div key={cat} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '5px 10px', fontSize: 12 }}>
                        <span className="fw-700">{cat}</span> <span className="amt-r fw-700">{fmt(amt)}</span>
                        <span className="text-muted"> · {((amt / day.total) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  {/* Item rows */}
                  {day.items.sort((a, b) => b.amount - a.amount).map(i => (
                    <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 16px', borderBottom: '1px solid var(--border)', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="fw-600 fs-13">{i.itemName || i.category}</div>
                        <div className="flex gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, background: 'rgba(77,158,255,.1)', color: 'var(--blue)', borderRadius: 20, padding: '1px 7px', fontWeight: 600 }}>{i.category}</span>
                          {i.paidVia && <span style={{ fontSize: 10, background: 'var(--bg2)', color: 'var(--t2)', borderRadius: 20, padding: '1px 7px', fontWeight: 600 }}>💳 {i.paidVia}</span>}
                          {i.notes && !i.notes.startsWith('[Recurring]') && <span className="fs-11 text-muted">{i.notes}</span>}
                        </div>
                      </div>
                      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--red)', flexShrink: 0 }}>{fmt(i.amount)}</span>
                    </div>
                  ))}
                  {/* Day total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', fontWeight: 800 }}>
                    <span className="fs-13">Day Total</span>
                    <span className="amt-r fs-14">{fmt(day.total)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Avg line note */}
      <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 10, fontSize: 12, color: 'var(--t2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>🟢 <strong>Below avg</strong> (under {fmt(avgPerDay)})</span>
        <span>🟡 <strong>Above avg</strong></span>
        <span>🔴 <strong>High spend</strong> (over {fmt(avgPerDay * 1.5)})</span>
      </div>
    </div>
  );
}

// ─── Recurring Expenses Tab ────────────────────────────────
const FREQ_OPTIONS = [
  { key: 'daily',     label: 'Daily',      days: 1 },
  { key: 'weekly',    label: 'Weekly',     days: 7 },
  { key: 'monthly',   label: 'Monthly',    days: 30 },
  { key: 'quarterly', label: 'Quarterly',  days: 90 },
  { key: 'yearly',    label: 'Yearly',     days: 365 },
];

const REC_TYPES = [
  { key: 'general', label: 'General' },
  { key: 'rd',       label: '🏦 Recurring Deposit (RD)' },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Advance `start` by k deposit periods. Monthly/quarterly/yearly use true calendar-month
// arithmetic (not a flat "30 days") so long-running RDs don't drift off their real due dates.
const addPeriod = (start, freqKey, k) => {
  const d = new Date(start);
  if (freqKey === 'monthly')   { d.setMonth(d.getMonth() + k); return d; }
  if (freqKey === 'quarterly') { d.setMonth(d.getMonth() + k * 3); return d; }
  if (freqKey === 'yearly')    { d.setFullYear(d.getFullYear() + k); return d; }
  const freq = FREQ_OPTIONS.find(f => f.key === freqKey);
  d.setDate(d.getDate() + k * (freq?.days || 30));
  return d;
};

// RD current balance, matching how Indian banks actually calculate it:
// interest compounds quarterly at CALENDAR quarter-ends (Mar 31 / Jun 30 / Sep 30 / Dec 31),
// not at your deposit frequency. Each instalment is tracked individually — it compounds for
// every full quarter it's been sitting in the account, then earns simple interest for the
// number of days since the last quarter-end (since that portion hasn't been credited yet).
// This is the standard "per-instalment" method banks and RD calculators use.
const getRDBreakdown = (item, asOf) => {
  const amount = parseFloat(item.amount) || 0;
  const rate   = parseFloat(item.interestRate) || 0;
  const start  = item.rdStartDate ? new Date(item.rdStartDate) : null;
  if (!start || isNaN(start.getTime()) || amount <= 0) return { periods: 0, principal: 0, interest: 0, currentBalance: 0 };

  const matureCap = item.matureDate ? new Date(item.matureDate) : null;
  const depositDates = [];
  for (let n = 0; n < 1200; n++) { // safety cap: 100 years of monthly deposits
    const d = addPeriod(start, item.frequency, n);
    if (d > asOf) break;
    if (matureCap && d > matureCap) break;
    depositDates.push(d);
  }
  const periods = depositDates.length;
  if (periods <= 0) return { periods: 0, principal: 0, interest: 0, currentBalance: 0 };

  const principal = amount * periods;
  if (rate <= 0) return { periods, principal, interest: 0, currentBalance: principal };

  // Calendar quarter-end dates (Mar 31 / Jun 30 / Sep 30 / Dec 31) from RD start through today
  const qEndMonths = [2, 5, 8, 11]; // 0-indexed month of Mar/Jun/Sep/Dec
  const quarterEnds = [];
  let cursor = new Date(start);
  for (let guard = 0; guard < 400; guard++) { // supports up to 100 years of RD tenure
    const m  = cursor.getMonth();
    const y  = cursor.getFullYear();
    const qm = qEndMonths.find(x => x >= m);
    const qe = qm !== undefined ? new Date(y, qm + 1, 0) : new Date(y + 1, 3, 0); // last day of that quarter
    if (qe > asOf) break;
    if (qe >= start) quarterEnds.push(qe);
    cursor = new Date(qe.getFullYear(), qe.getMonth() + 1, 1);
  }

  const i = (rate / 100) / 4; // quarterly rate
  let currentBalance = 0;
  for (const depDate of depositDates) {
    const passedQuarterEnds = quarterEnds.filter(qe => qe > depDate && qe <= asOf);
    if (passedQuarterEnds.length === 0) {
      const days = Math.max(0, Math.floor((asOf - depDate) / MS_PER_DAY));
      currentBalance += amount + amount * (rate / 100) * (days / 365);
    } else {
      // Simple interest for the deposit's own partial first quarter (it wasn't in
      // the account for the whole quarter), then compound each FULL quarter after that,
      // then simple interest again for the still-open trailing quarter.
      const firstQE = passedQuarterEnds[0];
      const daysToFirstQE = Math.max(0, Math.floor((firstQE - depDate) / MS_PER_DAY));
      let val = amount + amount * (rate / 100) * (daysToFirstQE / 365);
      val = val * Math.pow(1 + i, passedQuarterEnds.length - 1);
      const lastQE = passedQuarterEnds[passedQuarterEnds.length - 1];
      const trailingDays = Math.max(0, Math.floor((asOf - lastQE) / MS_PER_DAY));
      val = val + val * (rate / 100) * (trailingDays / 365);
      currentBalance += val;
    }
  }

  return { periods, principal, interest: currentBalance - principal, currentBalance };
};

const BLANK_REC = { name: '', category: '', amount: '', frequency: 'monthly', nextDue: today(), paidVia: '', notes: '', isActive: true, autoRenew: false, matureDate: '', matureAmount: '', expectedSpendingAmount: '', expectedSpendingDate: '', type: 'general', interestRate: '', rdStartDate: today(), linkedInsuranceId: '' };

// ─── Matured RD/FD Popup ─────────────────────────────────
// Full-screen promo-card style popup (the "you've won a prize" pattern) —
// pops up automatically when a Recurring item's maturity date is reached,
// prompting the user to set the next cycle up rather than letting it sit
// dormant. Shows one item at a time if several matured at once.
function MaturedPopup({ items, onRenew, onDismiss, onClose }) {
  const item = items[0];
  if (!item) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 200 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 340, width: '92%', borderRadius: 22, overflow: 'hidden',
        background: 'linear-gradient(160deg, #f97316, #ea580c)', position: 'relative',
        boxShadow: '0 20px 60px rgba(0,0,0,.4)', textAlign: 'center', padding: '30px 22px 24px',
      }}>
        <div style={{ fontSize: 46, marginBottom: 6 }}>🏆</div>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 22, lineHeight: 1.25, marginBottom: 6 }}>
          Your {item.name} has Matured!
        </div>
        <div style={{ color: 'rgba(255,255,255,.9)', fontSize: 13, marginBottom: 18 }}>
          {item.matureAmount ? `Maturity value: ${fmt(parseFloat(item.matureAmount))}` : `Matured on ${new Date(item.matureDate).toLocaleDateString('en-IN')}`}
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: '16px 14px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: '#7c2d12', fontWeight: 700, marginBottom: 4 }}>{item.name}</div>
          <div style={{ fontSize: 12, color: '#9a3412' }}>
            {item.frequency} · {fmt(parseFloat(item.amount))} per cycle
          </div>
        </div>
        <button onClick={() => onRenew(item)} style={{
          width: '100%', padding: '13px', borderRadius: 30, border: 'none', background: '#fff', color: '#ea580c',
          fontWeight: 800, fontSize: 15, cursor: 'pointer', marginBottom: 10,
        }}>
          🔄 Set It Up Again
        </button>
        <button onClick={() => onDismiss(item)} style={{
          width: '100%', padding: '10px', borderRadius: 30, border: '1px solid rgba(255,255,255,.5)', background: 'transparent',
          color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>
          Not now
        </button>
        {items.length > 1 && (
          <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 11, marginTop: 10 }}>+{items.length - 1} more matured item{items.length > 2 ? 's' : ''} waiting</div>
        )}
        <button onClick={onClose} style={{
          position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%',
          border: 'none', background: 'rgba(0,0,0,.2)', color: '#fff', fontSize: 15, cursor: 'pointer', lineHeight: 1,
        }}>✕</button>
      </div>
    </div>
  );
}

function RecurringTab({ cats, showFixed, isFixedCat, onPaymentRecorded }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(false);
  const [edit, setEdit]     = useState(null);
  const [delId, setDelId]   = useState(null);
  const [form, setForm]     = useState(BLANK_REC);
  const [adding, setAdding] = useState(false);
  const [rdSummaryOpen, setRdSummaryOpen] = useState(true);
  const [showMaturedPopup, setShowMaturedPopup] = useState(false);
  const [maturedDismissedIds, setMaturedDismissedIds] = useState(new Set()); // dismissed this session, without writing to DB
  const [insurancePolicies, setInsurancePolicies] = useState([]); // for the "link to insurance policy" sync feature

  // Date-only (no time-of-day) comparisons — avoids the local-time vs UTC-midnight
  // mismatch that was causing "today"/overdue items to sometimes miss the red highlight.
  const parseDateOnly = (val) => {
    if (!val) return null;
    if (val instanceof Date) return new Date(val.getFullYear(), val.getMonth(), val.getDate());
    if (typeof val === 'object' && typeof val.toDate === 'function') {
      const d = val.toDate();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const str = String(val);
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const nowDateOnly = new Date();
  nowDateOnly.setHours(0, 0, 0, 0);
  const now = nowDateOnly;

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [data, policies] = await Promise.all([recurringService.getAll(), insuranceService.getAll().catch(() => [])]);
      setItems(data);
      setInsurancePolicies(policies);
      await autoRenewOverdue(data, policies);
    }
    catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  // Advances a linked insurance policy's due date by its own payment
  // frequency (Monthly/Quarterly/Half Yearly/Yearly) — called whenever a
  // Recurring payment for that policy is recorded, so the Insurance page's
  // "Due Soon" status clears in sync instead of needing a separate update.
  // Takes the policies list as a parameter (rather than reading the
  // `insurancePolicies` state) so it works correctly even when called
  // immediately after a fetch, before that state update has applied.
  const INSURANCE_FREQ_DAYS = { Monthly: 30, Quarterly: 91, 'Half Yearly': 182, Yearly: 365 };
  const syncLinkedInsurance = async (linkedInsuranceId, policiesList) => {
    if (!linkedInsuranceId) return;
    const policy = (policiesList || insurancePolicies).find(p => p.id === linkedInsuranceId);
    if (!policy) return;
    try {
      const days = INSURANCE_FREQ_DAYS[policy.paymentFrequency] || 365;
      const newDue = new Date(policy.dueDate);
      newDue.setDate(newDue.getDate() + days);
      await insuranceService.update(policy.id, { ...policy, dueDate: newDue.toISOString().split('T')[0] });
    } catch { /* insurance sync is a best-effort convenience — the recurring payment itself already succeeded */ }
  };

  // Auto-advance any item with "Auto-renew" enabled whose due date has passed —
  // records the payment and rolls nextDue forward without needing a manual "Pay" click.
  // Catches up multiple missed cycles if the app wasn't opened for a while.
  const autoRenewOverdue = async (list, policiesList) => {
    const due = list.filter(i => i.isActive && i.autoRenew && parseDateOnly(i.nextDue) && parseDateOnly(i.nextDue) < now);
    if (due.length === 0) return;
    let renewedCount = 0;
    for (const item of due) {
      let current = item;
      let guard = 0; // safety cap in case of bad data — never loop forever
      while (parseDateOnly(current.nextDue) < now && guard < 36) {
        const freq = FREQ_OPTIONS.find(f => f.key === current.frequency);
        const nextDue = new Date(current.nextDue);
        nextDue.setDate(nextDue.getDate() + (freq?.days || 30));
        try {
          await expenseService.create({
            category: current.category || 'Recurring',
            amount: parseFloat(current.amount),
            date: current.nextDue,
            paidVia: current.paidVia || '',
            notes: `[Recurring · Auto-renewed] ${current.name}`,
          });
          if (current.linkedInsuranceId) await syncLinkedInsurance(current.linkedInsuranceId, policiesList);
        } catch { /* keep going even if one cycle's expense log fails */ }
        current = { ...current, nextDue: nextDue.toISOString().split('T')[0], lastPaid: current.nextDue };
        guard++;
      }
      if (guard > 0) {
        try {
          await recurringService.update(item.id, { ...current });
          renewedCount++;
        } catch { /* ignore, will retry next load */ }
      }
    }
    if (renewedCount > 0) {
      toast.success(`🔁 Auto-renewed ${renewedCount} recurring payment${renewedCount > 1 ? 's' : ''}`);
      try { setItems(await recurringService.getAll()); } catch { /* keep existing list on failure */ }
      if (onPaymentRecorded) onPaymentRecorded();
    }
  };

  const save = async () => {
    if (!form.name || !form.amount || !form.nextDue) { toast.error('Fill Name, Amount and Next Due date'); return; }
    setAdding(true);
    try {
      if (edit) { await recurringService.update(edit.id, form); toast.success('Updated!'); }
      else { await recurringService.create(form); toast.success('Recurring expense added!'); }
      setModal(false); setEdit(null); setForm(BLANK_REC); load();
    } catch { toast.error('Failed'); }
    finally { setAdding(false); }
  };

  const del = async () => {
    try { await recurringService.delete(delId); toast.success('Deleted'); setDelId(null); load(); }
    catch { toast.error('Failed'); }
  };

  const toggleActive = async (item) => {
    try { await recurringService.update(item.id, { ...item, isActive: !item.isActive }); load(); }
    catch { toast.error('Failed'); }
  };

  // Record a payment — creates an expense entry and advances next due date
  const recordPayment = async (item) => {
    try {
      const freq = FREQ_OPTIONS.find(f => f.key === item.frequency);
      const oldDue = parseDateOnly(item.nextDue);
      // If the due date already passed, schedule the next one from today (catch-up) rather than
      // compounding forward from the stale old date, which would keep it perpetually behind.
      const base = (oldDue && oldDue > now) ? oldDue : now;
      const nextDue = new Date(base);
      nextDue.setDate(nextDue.getDate() + (freq?.days || 30));
      // Create expense
      await expenseService.create({
        category: item.category || 'Recurring',
        amount: parseFloat(item.amount),
        date: today(),
        paidVia: item.paidVia || '',
        notes: `[Recurring] ${item.name}`,
      });
      // Advance next due
      await recurringService.update(item.id, { ...item, nextDue: nextDue.toISOString().split('T')[0], lastPaid: today() });
      if (item.linkedInsuranceId) await syncLinkedInsurance(item.linkedInsuranceId);
      toast.success(`Payment recorded! Next due: ${nextDue.toLocaleDateString('en-IN')}`);
      load();
      if (onPaymentRecorded) onPaymentRecorded();
    } catch { toast.error('Failed'); }
  };

  const getDaysUntil = (dateStr) => {
    const due = parseDateOnly(dateStr);
    if (!due) return 0;
    const diff = Math.round((due - now) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // Balance = Mature Amount − Expected Spending Amount. Only meaningful once both are set.
  const getBalance = (item) => {
    const mature = parseFloat(item.matureAmount);
    const spend = parseFloat(item.expectedSpendingAmount);
    if (isNaN(mature) || isNaN(spend)) return null;
    return mature - spend;
  };

  const getDueStatus = (days) => {
    if (days < 0)  return { label: `${Math.abs(days)}d overdue`, color: '#f43f5e', bg: 'rgba(244,63,94,.1)' };
    if (days === 0) return { label: 'Due today!',  color: '#f43f5e', bg: 'rgba(244,63,94,.1)' };
    if (days <= 3)  return { label: `${days}d left`, color: '#fb923c', bg: 'rgba(251,146,60,.1)' };
    if (days <= 7)  return { label: `${days}d left`, color: '#fbbf24', bg: 'rgba(251,191,36,.1)' };
    return { label: `${days}d left`, color: 'var(--t3)', bg: 'var(--bg3)' };
  };

  const activeItems   = items.filter(i => i.isActive);
  const inactiveItems = items.filter(i => !i.isActive);
  const displayItems  = showFixed ? activeItems : activeItems.filter(i => !isFixedCat || !isFixedCat(i.category));

  // Items whose maturity date has been reached (or passed) and haven't been
  // acknowledged yet — these trigger the "matured, set up again?" popup,
  // the same way an app promo pops up when a condition is met.
  const maturedItems = activeItems.filter(i =>
    i.matureDate && parseDateOnly(i.matureDate) && parseDateOnly(i.matureDate) <= now &&
    !i.matureAcknowledged && !maturedDismissedIds.has(i.id)
  );
  useEffect(() => {
    if (maturedItems.length > 0) setShowMaturedPopup(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const dismissMatured = async (item) => {
    setMaturedDismissedIds(prev => new Set(prev).add(item.id));
    try { await recurringService.update(item.id, { ...item, matureAcknowledged: true }); } catch { /* stays dismissed for this session even if the write fails */ }
  };

  // "Set up again" — closes out the matured cycle and opens the Add form
  // pre-filled with a fresh cycle (same name/amount/frequency/paidVia),
  // starting today, with maturity fields cleared for the new term.
  const renewMatured = async (item) => {
    try { await recurringService.update(item.id, { ...item, matureAcknowledged: true, isActive: false }); } catch { /* proceed to open the form regardless */ }
    setMaturedDismissedIds(prev => new Set(prev).add(item.id));
    setShowMaturedPopup(false);
    setEdit(null);
    setForm({
      ...BLANK_REC,
      name: item.name, category: item.category, amount: item.amount,
      frequency: item.frequency, paidVia: item.paidVia, type: item.type,
      interestRate: item.interestRate, linkedInsuranceId: item.linkedInsuranceId || '',
      nextDue: today(), rdStartDate: today(),
    });
    setModal(true);
    load();
  };

  const monthlyTotal = activeItems.reduce((s, i) => {
    const freq = FREQ_OPTIONS.find(f => f.key === i.frequency);
    const perMonth = freq ? (parseFloat(i.amount) * 30) / freq.days : parseFloat(i.amount);
    return s + perMonth;
  }, 0);
  const overdueCount = activeItems.filter(i => getDaysUntil(i.nextDue) < 0).length;
  const dueSoonCount = activeItems.filter(i => { const d = getDaysUntil(i.nextDue); return d >= 0 && d <= 7; }).length;

  // RD aggregate — sum of current balances (principal + accrued interest) across all active RD entries
  const rdItems = activeItems.filter(i => i.type === 'rd');
  const rdTotals = rdItems.reduce((acc, item) => {
    const b = getRDBreakdown(item, now);
    return { principal: acc.principal + b.principal, interest: acc.interest + b.interest, currentBalance: acc.currentBalance + b.currentBalance };
  }, { principal: 0, interest: 0, currentBalance: 0 });

  const ch = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const favCats = cats.filter(c => c.isFavorite);
  const otherCats = cats.filter(c => !c.isFavorite);

  return (
    <div>
      {/* ── Summary Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Est. Monthly Cost', val: fmt(monthlyTotal),       c: 'var(--blue)',   icon: '📅' },
          { label: 'Active Recurring',  val: activeItems.length,      c: 'var(--green)',  icon: '🔄' },
          { label: 'Overdue',           val: overdueCount,            c: overdueCount > 0 ? 'var(--red)' : 'var(--t3)',    icon: '🚨' },
          { label: 'Due This Week',     val: dueSoonCount,            c: dueSoonCount > 0 ? 'var(--orange)' : 'var(--t3)', icon: '⏰' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${s.c}` }}>
            <div className="fs-11 text-muted">{s.icon} {s.label}</div>
            <div className="fw-800 fs-15 mt-1" style={{ color: s.c }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Pie Chart + Category Summary List ── */}
      {activeItems.length > 0 && (() => {
        // Build per-category totals (monthly equivalent)
        const catMap = {};
        activeItems.forEach(item => {
          const freq = FREQ_OPTIONS.find(f => f.key === item.frequency);
          const perMonth = freq ? (parseFloat(item.amount) * 30) / freq.days : parseFloat(item.amount);
          const cat = item.category || item.name || 'Uncategorised';
          catMap[cat] = (catMap[cat] || 0) + perMonth;
        });
        const PIE_COLORS = ['#4d9eff','#22c55e','#f97316','#a78bfa','#f43f5e','#fbbf24','#2dd4bf','#fb923c','#38bdf8','#818cf8'];
        const pieData = Object.entries(catMap)
          .sort((a, b) => b[1] - a[1])
          .map(([name, value], i) => ({ name, value, color: PIE_COLORS[i % PIE_COLORS.length] }));

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 16, marginBottom: 20 }}>
            {/* Pie chart */}
            <div className="card">
              <div className="card-title">🥧 Monthly Breakdown</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={72} dataKey="value" paddingAngle={2}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={v => [`₹${fmt(v)}/mo`, '']} contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, minWidth: 140 }}>
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <span className="fs-12 text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{d.name}</span>
                      </div>
                      <span className="fs-12 fw-700">{fmt(d.value)}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }} className="flex justify-between">
                    <span className="fw-700 fs-12">Total/mo</span>
                    <span className="fw-800 fs-13 amt-r">{fmt(monthlyTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary list */}
            <div className="card">
              <div className="card-title">📋 Category Summary</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {pieData.map(d => {
                  const pct = monthlyTotal > 0 ? (d.value / monthlyTotal) * 100 : 0;
                  return (
                    <div key={d.name}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                          <span className="fs-13 fw-600">{d.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="fs-12 fw-800" style={{ color: d.color }}>{fmt(d.value)}</span>
                          <span className="fs-11 text-muted" style={{ minWidth: 34, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: d.color, borderRadius: 4, transition: 'width .4s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {!showFixed && (
        <div style={{ background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8, padding:'8px 14px', marginBottom:10, fontSize:12, color:'var(--orange)', fontWeight:700 }}>
          🔀 Variable only — Fixed recurring items hidden. Payments to fixed items still record to the List tab.
        </div>
      )}

      {/* ── RD Summary (collapsible) ── */}
      {rdItems.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--blue)' }}>
          <div className="flex justify-between items-center" style={{ cursor: 'pointer' }} onClick={() => setRdSummaryOpen(o => !o)}>
            <div className="card-title" style={{ marginBottom: 0 }}>🏦 RD Summary ({rdItems.length} entr{rdItems.length === 1 ? 'y' : 'ies'})</div>
            <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setRdSummaryOpen(o => !o); }}>
              {rdSummaryOpen ? '▲ Hide' : '▼ Show'}
            </button>
          </div>
          {rdSummaryOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginTop: 12 }}>
              {[
                { label: 'Total Invested (Principal)', val: fmt(rdTotals.principal),      c: 'var(--t3)',   icon: '💰' },
                { label: 'Interest Accrued Till Date',  val: fmt(rdTotals.interest),        c: 'var(--green)', icon: '📈' },
                { label: 'Aggregate Current Balance',   val: fmt(rdTotals.currentBalance),  c: 'var(--blue)',  icon: '🏦' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${s.c}` }}>
                  <div className="fs-11 text-muted">{s.icon} {s.label}</div>
                  <div className="fw-800 fs-15 mt-1" style={{ color: s.c }}>{s.val}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex justify-between items-center mb-3">
        <div className="fs-14 fw-700">🔄 Active Recurring ({displayItems.length}{!showFixed ? ' variable' : ''})</div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(displayItems.map(i => {
            const rd = i.type === 'rd' ? getRDBreakdown(i, now) : null;
            return {
              name: i.name,
              category: i.category || '',
              amount: i.amount,
              frequency: i.frequency,
              nextDue: i.nextDue ? new Date(i.nextDue).toLocaleDateString('en-IN') : '',
              lastPaid: i.lastPaid ? new Date(i.lastPaid).toLocaleDateString('en-IN') : '',
              paidVia: i.paidVia || '',
              autoRenew: i.autoRenew ? 'Yes' : 'No',
              type: i.type === 'rd' ? 'RD' : 'General',
              interestRate: i.type === 'rd' ? (i.interestRate || '') : '',
              rdStartDate: i.type === 'rd' && i.rdStartDate ? new Date(i.rdStartDate).toLocaleDateString('en-IN') : '',
              rdPrincipalTillDate: rd ? rd.principal.toFixed(2) : '',
              rdInterestAccrued: rd ? rd.interest.toFixed(2) : '',
              rdCurrentBalance: rd ? rd.currentBalance.toFixed(2) : '',
              matureDate: i.matureDate ? new Date(i.matureDate).toLocaleDateString('en-IN') : '',
              matureAmount: i.matureAmount || '',
              expectedSpendingAmount: i.expectedSpendingAmount || '',
              expectedSpendingDate: i.expectedSpendingDate ? new Date(i.expectedSpendingDate).toLocaleDateString('en-IN') : '',
              balanceAmount: getBalance(i) !== null ? getBalance(i) : '',
              notes: i.notes || '',
            };
          }), 'recurring_expenses.csv')} title="Export Recurring CSV">⬇️ Export</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm(BLANK_REC); setModal(true); }}>+ Add Recurring</button>
        </div>
      </div>

      {/* ── Recurring Cards ── */}
      {loading ? <div className="spin-center"><div className="spin spin-lg" /></div>
        : activeItems.length === 0
          ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="empty"><div className="empty-icon">🔄</div><div className="empty-title">No recurring expenses</div><div className="empty-sub">Add rent, subscriptions, EMIs, SIPs etc.</div></div>
            </div>
          )
          : (
            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              {displayItems.sort((a, b) => getDaysUntil(a.nextDue) - getDaysUntil(b.nextDue)).map(item => {
                const days    = getDaysUntil(item.nextDue);
                const status  = getDueStatus(days);
                const freq    = FREQ_OPTIONS.find(f => f.key === item.frequency);

                // ── Payment status logic ──────────────────────────────
                // Paid = a payment was recorded within the last full cycle, counting back from TODAY.
                // (Previously this counted back from the item's own nextDue, which meant a stale/unadvanced
                // nextDue would freeze the item as "Done" forever, even after it fell weeks overdue.)
                const cycleStart = (() => {
                  const d = new Date(now);
                  d.setDate(d.getDate() - (freq?.days || 30));
                  return d;
                })();
                const lastPaidDate = item.lastPaid ? new Date(item.lastPaid) : null;
                const isPaid    = lastPaidDate && lastPaidDate >= cycleStart;
                const isOverdue = !isPaid && days < 0;

                // ── Banner color ──────────────────────────────────────
                const bannerBg     = isPaid    ? 'rgba(34,197,94,.08)'   : isOverdue ? 'rgba(244,63,94,.08)'   : 'var(--bg2)';
                const bannerBorder = isPaid    ? 'rgba(34,197,94,.35)'   : isOverdue ? 'rgba(244,63,94,.35)'   : 'var(--border)';
                const bannerLeft   = isPaid    ? '#22c55e'               : isOverdue ? '#f43f5e'               : status.color;

                return (
                  <div key={item.id} style={{ background: bannerBg, border: `1px solid ${bannerBorder}`, borderRadius: 12, padding: '12px 16px', borderLeft: `4px solid ${bannerLeft}`, position: 'relative' }}>

                    {/* ── Status label top-right on the card ─── */}
                    <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                      {isPaid && (
                        <span style={{ background: 'rgba(34,197,94,.15)', color: '#22c55e', fontSize: 10, fontWeight: 900, padding: '2px 10px', borderRadius: 20, border: '1px solid rgba(34,197,94,.3)' }}>
                          ✅ PAID
                        </span>
                      )}
                      {isOverdue && (
                        <span style={{ background: 'rgba(244,63,94,.15)', color: '#f43f5e', fontSize: 10, fontWeight: 900, padding: '2px 10px', borderRadius: 20, border: '1px solid rgba(244,63,94,.3)' }}>
                          ⚠️ OVERDUE
                        </span>
                      )}
                      {!isPaid && !isOverdue && (
                        <span style={{ background: status.bg, color: status.color, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20 }}>
                          {status.label}
                        </span>
                      )}
                    </div>

                    <div className="flex justify-between items-start" style={{ flexWrap: 'wrap', gap: 8, paddingRight: 80 }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div className="flex items-center gap-2 mb-1" style={{ flexWrap: 'wrap' }}>
                          <span className="fw-800 fs-14">{item.name}</span>
                          {item.lastPaid && (
                            <span className="text-muted fs-11">Last paid: {new Date(item.lastPaid).toLocaleDateString('en-IN')}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 fs-12 text-muted" style={{ flexWrap: 'wrap' }}>
                          {item.category && <span style={{ background: 'var(--bg3)', borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>{item.category}</span>}
                          <span>🔁 {freq?.label}</span>
                          {item.paidVia && <span>💳 {item.paidVia}</span>}
                          <span>📅 Next: {new Date(item.nextDue).toLocaleDateString('en-IN')}</span>
                          {item.autoRenew && <span title="Auto-renews without manual Pay" style={{ background: 'rgba(77,158,255,.12)', color: 'var(--blue)', borderRadius: 20, padding: '1px 8px', fontWeight: 700 }}>🔁 Auto</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="fw-900 fs-16 amt-r">{fmt(parseFloat(item.amount))}</span>
                        {!isPaid && (
                          <button className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '4px 10px', background: isOverdue ? '#f43f5e' : undefined, borderColor: isOverdue ? '#f43f5e' : undefined }} onClick={() => recordPayment(item)}>
                            {isOverdue ? '⚠️ Pay Now' : '✓ Pay'}
                          </button>
                        )}
                        {isPaid && (
                          <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, padding: '4px 10px', color: '#22c55e', borderColor: 'rgba(34,197,94,.4)' }} disabled>
                            ✅ Done
                          </button>
                        )}
                        <button className="btn-icon" onClick={() => { setEdit(item); setForm({ ...item }); setModal(true); }}>✏️</button>
                        <button className="btn-icon" style={{ fontSize: 12, color: 'var(--t3)' }} title="Pause" onClick={() => toggleActive(item)}>⏸️</button>
                        <button className="btn-icon" onClick={() => setDelId(item.id)}>🗑️</button>
                      </div>
                    </div>
                    {item.notes && <div className="fs-12 text-muted mt-2" style={{ fontStyle: 'italic' }}>📝 {item.notes}</div>}
                    {item.type === 'rd' && (() => {
                      const rd = getRDBreakdown(item, now);
                      return (
                        <div className="flex items-center gap-3 fs-12 mt-2" style={{ flexWrap: 'wrap', borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                          <span className="text-muted">🏦 RD @ {item.interestRate || 0}%</span>
                          <span className="text-muted">💰 Invested: {fmt(rd.principal)}</span>
                          <span style={{ color: 'var(--green)' }}>📈 Interest: {fmt(rd.interest)}</span>
                          <span style={{ fontWeight: 800, color: 'var(--blue)' }}>🏦 Current Balance: {fmt(rd.currentBalance)}</span>
                        </div>
                      );
                    })()}
                    {(item.matureDate || item.matureAmount || item.expectedSpendingAmount || item.expectedSpendingDate) && (
                      <div className="flex items-center gap-3 fs-12 text-muted mt-2" style={{ flexWrap: 'wrap', borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                        {item.matureDate && <span>📈 Matures: {new Date(item.matureDate).toLocaleDateString('en-IN')}</span>}
                        {item.matureAmount && <span>🎯 Mature Amt: {fmt(parseFloat(item.matureAmount))}</span>}
                        {item.expectedSpendingAmount && <span>💸 Expected Spend: {fmt(parseFloat(item.expectedSpendingAmount))}</span>}
                        {item.expectedSpendingDate && <span>📅 Expected On: {new Date(item.expectedSpendingDate).toLocaleDateString('en-IN')}</span>}
                        {getBalance(item) !== null && (
                          <span style={{ fontWeight: 800, color: getBalance(item) >= 0 ? '#22c55e' : '#f43f5e' }}>
                            ⚖️ Balance: {fmt(getBalance(item))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

      {/* ── Inactive/Paused ── */}
      {inactiveItems.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="fs-13 fw-700 text-muted mb-2">⏸️ Paused ({inactiveItems.length})</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {inactiveItems.map(item => (
              <div key={item.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', opacity: 0.6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span className="fw-700 fs-13">{item.name}</span>
                  <span className="text-muted fs-12 mx-2">·</span>
                  <span className="text-muted fs-12">{fmt(parseFloat(item.amount))} / {item.frequency}</span>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => toggleActive(item)}>▶ Resume</button>
                  <button className="btn-icon" onClick={() => setDelId(item.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <Modal title={edit ? '✏️ Edit Recurring Expense' : '🔄 Add Recurring Expense'} onClose={() => { setModal(false); setEdit(null); }}>
          <div className="frow">
            <div className="fg"><label className="fl">Name</label>
              <input className="fi" name="name" value={form.name} onChange={ch} placeholder="e.g. House Rent, Netflix, SIP, Gym" autoFocus />
            </div>
            <div className="fg"><label className="fl">Type</label>
              <select className="fi" name="type" value={form.type || 'general'} onChange={ch}>
                {REC_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">Amount (Rs) {form.type === 'rd' && <span className="text-muted fw-400 fs-11">per installment</span>}</label>
              <input className="fi" type="number" name="amount" value={form.amount} onChange={ch} placeholder="e.g. 12000" min="0" />
            </div>
            <div className="fg"><label className="fl">Frequency</label>
              <select className="fi" name="frequency" value={form.frequency} onChange={ch}>
                {FREQ_OPTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          </div>
          {form.type === 'rd' && (
            <div className="frow">
              <div className="fg"><label className="fl">Interest Rate (% p.a.)</label>
                <input className="fi" type="number" step="0.01" name="interestRate" value={form.interestRate} onChange={ch} placeholder="e.g. 7.5" min="0" />
              </div>
              <div className="fg"><label className="fl">RD Start Date</label>
                <DateStepper name="rdStartDate" value={form.rdStartDate} onChange={ch} />
              </div>
            </div>
          )}
          {form.type === 'rd' && (() => {
            const rd = getRDBreakdown(form, now);
            return (
              <div className="fg">
                <label className="fl">Current Balance (auto-calculated)</label>
                <input className="fi" value={`${fmt(rd.currentBalance)}  (Invested ${fmt(rd.principal)} + Interest ${fmt(rd.interest)})`} disabled style={{ opacity: 0.75, fontWeight: 700 }} />
              </div>
            );
          })()}
          <div className="frow">
            <div className="fg"><label className="fl">Category</label>
              <select className="fi" name="category" value={form.category} onChange={ch}>
                <option value="">— Select —</option>
                {favCats.length > 0 && <optgroup label="⭐ Favourites">{favCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</optgroup>}
                {otherCats.length > 0 && <optgroup label="All">{otherCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</optgroup>}
              </select>
            </div>
            <div className="fg"><label className="fl">Next Due Date</label>
              <DateStepper name="nextDue" value={form.nextDue} onChange={ch} />
            </div>
          </div>
          <div className="fg"><label className="fl">Paid Via (optional)</label>
            <input className="fi" name="paidVia" value={form.paidVia} onChange={ch} placeholder="e.g. UPI, Credit Card, Auto-debit" />
          </div>

          {/* ── Maturity / Projection fields (optional — for RDs, FDs, insurance, SIPs etc.) ── */}
          <div className="fs-12 fw-700 text-muted mt-2 mb-1">📈 Maturity & Projection (optional)</div>
          <div className="frow">
            <div className="fg"><label className="fl">Mature Date</label>
              <DateStepper name="matureDate" value={form.matureDate} onChange={ch} />
            </div>
            <div className="fg"><label className="fl">Mature Amount (Rs)</label>
              <input className="fi" type="number" name="matureAmount" value={form.matureAmount} onChange={ch} placeholder="e.g. 150000" min="0" />
            </div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">Expected Spending Amount (Rs)</label>
              <input className="fi" type="number" name="expectedSpendingAmount" value={form.expectedSpendingAmount} onChange={ch} placeholder="e.g. 20000" min="0" />
            </div>
            <div className="fg"><label className="fl">Expected Spending Date</label>
              <DateStepper name="expectedSpendingDate" value={form.expectedSpendingDate} onChange={ch} />
            </div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">Balance Amount</label>
              <input className="fi" value={getBalance(form) !== null ? fmt(getBalance(form)) : '—'} disabled style={{ opacity: 0.75, fontWeight: 700 }} />
            </div>
          </div>

          <div className="fs-12 fw-700 text-muted mt-2 mb-1">🔗 Sync with Insurance (optional)</div>
          <div className="frow">
            <div className="fg" style={{ flex: 1 }}>
              <label className="fl">Link to Insurance Policy</label>
              <select className="fs" name="linkedInsuranceId" value={form.linkedInsuranceId} onChange={ch}>
                <option value="">— None —</option>
                {insurancePolicies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.company})</option>)}
              </select>
              {form.linkedInsuranceId && <div className="fs-11 text-muted mt-1">Recording a payment here will also push that policy's due date forward on the Insurance page — no need to update both places.</div>}
            </div>
          </div>

          <div className="fg"><label className="fl">Notes (optional)</label>
            <input className="fi" name="notes" value={form.notes} onChange={ch} placeholder="e.g. HDFC credit card auto-pay" />
          </div>
          <div className="fg">
            <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={!!form.autoRenew} onChange={e => setForm(p => ({ ...p, autoRenew: e.target.checked }))}
                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--blue)' }} />
              🔁 Auto-renew — automatically move to the next due date once overdue (no manual "Pay" needed)
            </label>
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={() => { setModal(false); setEdit(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={adding}>{adding ? <span className="spin" /> : null} {edit ? 'Update' : 'Add Recurring'}</button>
          </div>
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
      {showMaturedPopup && maturedItems.length > 0 && (
        <MaturedPopup
          items={maturedItems}
          onRenew={renewMatured}
          onDismiss={(item) => { dismissMatured(item); if (maturedItems.length <= 1) setShowMaturedPopup(false); }}
          onClose={() => setShowMaturedPopup(false)}
        />
      )}
    </div>
  );
}

// ─── Category Detail Tab ───────────────────────────────────
function PaidViaTab({ items, showFixed, isFixedCat }) {
  const filtered = showFixed ? items : items.filter(i => !isFixedCat(i.category));
  const total = filtered.reduce((s, i) => s + +i.amount, 0);
  const [expanded, setExpanded] = useState(new Set());

  const toggleExpand = (method) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(method) ? next.delete(method) : next.add(method);
      return next;
    });
  };

  // Build summary map — keep raw transactions per method
  const map = {};
  filtered.forEach(i => {
    const key = i.paidVia || '—';
    if (!map[key]) map[key] = { amount: 0, count: 0, txns: [] };
    map[key].amount += +i.amount;
    map[key].count += 1;
    map[key].txns.push(i);
  });
  const rows = Object.entries(map).sort((a, b) => b[1].amount - a[1].amount);

  const COLORS     = ['#378ADD','#22c55e','#f97316','#a78bfa','#f43f5e','#0ea5e9','#eab308','#7c3aed','#10b981','#ec4899'];
  const CAT_COLORS = ['#4d9eff','#22c55e','#f97316','#a78bfa','#f43f5e','#0ea5e9','#eab308','#7c3aed','#10b981','#ec4899','#64748b','#84cc16'];

  if (filtered.length === 0) return (
    <div className="card"><div className="empty"><div className="empty-icon">💳</div><div className="empty-title">No data</div><div className="empty-sub">Add expenses with a Paid Via value to see breakdown</div></div></div>
  );

  return (
    <div>
      {/* Summary stat cards */}
      <div className="stats mb-4">
        {[
          { icon: '💰', label: 'Total Spent',      val: `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`, c: 'var(--blue)' },
          { icon: '💳', label: 'Payment Methods',  val: rows.length,      c: 'var(--purple, #7c3aed)' },
          { icon: '🏆', label: 'Top Method',        val: rows[0]?.[0] || '—', c: 'var(--orange)' },
          { icon: '📦', label: 'Transactions',      val: filtered.length,  c: 'var(--green)' },
        ].map((s, i) => (
          <div key={i} className="stat" style={{ '--c': s.c }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-val" style={{ color: s.c, fontSize: typeof s.val === 'string' && s.val.length > 10 ? 14 : undefined }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table with expandable rows */}
      <div className="card">
        <div className="card-title">💳 Paid Via — Breakdown</div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }} title="Expand to see date-wise breakdown" />
                <th>#</th>
                <th>Payment Method</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>Txns</th>
                <th style={{ textAlign: 'right' }}>% of Total</th>
                <th style={{ minWidth: 120 }}>Bar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([method, data], i) => {
                const pct     = total > 0 ? ((data.amount / total) * 100).toFixed(1) : 0;
                const color   = COLORS[i % COLORS.length];
                const isOpen  = expanded.has(method);

                // ── Build date → category map ──
                const dateMap = {};
                data.txns.forEach(t => {
                  const d = typeof t.date === 'object'
                    ? t.date.toISOString().split('T')[0]
                    : String(t.date).split('T')[0];
                  if (!dateMap[d]) dateMap[d] = { total: 0, cats: {} };
                  dateMap[d].total += +t.amount;
                  const cat = t.category || 'Uncategorised';
                  if (!dateMap[d].cats[cat]) dateMap[d].cats[cat] = { amount: 0, items: [] };
                  dateMap[d].cats[cat].amount += +t.amount;
                  if (t.itemName?.trim()) dateMap[d].cats[cat].items.push({ name: t.itemName.trim(), amount: +t.amount });
                });
                const sortedDates = Object.entries(dateMap).sort((a, b) => new Date(b[0]) - new Date(a[0]));

                return (
                  <>
                    {/* ── Main row ── */}
                    <tr key={method} style={{ background: isOpen ? `${color}10` : 'transparent', transition: 'background .2s' }}>
                      <td>
                        <button
                          onClick={() => toggleExpand(method)}
                          title={isOpen ? 'Collapse' : 'Expand date-wise breakdown'}
                          style={{
                            width: 24, height: 24, borderRadius: 6,
                            border: `2px solid ${isOpen ? color : 'var(--border2)'}`,
                            background: isOpen ? color : 'var(--bg3)',
                            color: isOpen ? '#fff' : color,
                            fontWeight: 900, fontSize: 16, lineHeight: 1,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all .15s',
                          }}
                        >
                          {isOpen ? '−' : '+'}
                        </button>
                      </td>
                      <td className="text-muted fs-12">{i + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span className="fw-700 fs-13">{method}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}><span className="amt amt-r fw-800">₹{data.amount.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span></td>
                      <td style={{ textAlign: 'right' }}><span className="badge" style={{ fontSize: 12 }}>{data.count}</span></td>
                      <td style={{ textAlign: 'right' }}><span className="fw-700 fs-13" style={{ color }}>{pct}%</span></td>
                      <td>
                        <div style={{ background: 'var(--bg3)', borderRadius: 6, height: 8, overflow: 'hidden', minWidth: 100 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 6, transition: 'width .5s' }} />
                        </div>
                      </td>
                    </tr>

                    {/* ── Expanded panel: date-wise → category breakdown ── */}
                    {isOpen && (
                      <tr key={`${method}-detail`}>
                        <td colSpan={7} style={{ padding: 0, borderBottom: `2px solid ${color}40` }}>
                          <div style={{ background: `${color}08`, padding: '14px 16px 18px 36px', borderTop: `1px solid ${color}30` }}>

                            {/* Panel header */}
                            <div style={{ fontSize: 11, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 16, height: 2, background: color, borderRadius: 2, display: 'inline-block' }} />
                              📅 {method} — Date-wise Category Breakdown
                              <span style={{ width: 16, height: 2, background: color, borderRadius: 2, display: 'inline-block' }} />
                            </div>

                            {/* One card per date */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {sortedDates.map(([dateStr, dayData]) => {
                                const dateLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
                                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                                });
                                const catEntries = Object.entries(dayData.cats).sort((a, b) => b[1].amount - a[1].amount);

                                return (
                                  <div key={dateStr} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>

                                    {/* Date header bar */}
                                    <div style={{
                                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                      padding: '7px 14px',
                                      background: `linear-gradient(90deg, ${color}22, transparent)`,
                                      borderBottom: '1px solid var(--border)',
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{dateLabel}</span>
                                        <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600 }}>
                                          · {catEntries.length} categor{catEntries.length > 1 ? 'ies' : 'y'}
                                        </span>
                                      </div>
                                      <span style={{ fontSize: 13, fontWeight: 900, color }}>{fmt(dayData.total)}</span>
                                    </div>

                                    {/* Category rows */}
                                    <div style={{ padding: '4px 8px 6px' }}>
                                      {catEntries.map(([cat, catData], ci) => {
                                        const catPct   = dayData.total > 0 ? ((catData.amount / dayData.total) * 100).toFixed(0) : 0;
                                        const catColor = CAT_COLORS[ci % CAT_COLORS.length];
                                        return (
                                          <div key={cat} style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '5px 6px',
                                            borderBottom: ci < catEntries.length - 1 ? '1px dashed var(--border)' : 'none',
                                          }}>

                                            {/* Category badge */}
                                            <span style={{
                                              background: `${catColor}20`, color: catColor,
                                              border: `1px solid ${catColor}50`,
                                              borderRadius: 20, padding: '2px 10px',
                                              fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0,
                                            }}>
                                              {cat}
                                            </span>

                                            {/* Item name chips (if entered) */}
                                            {catData.items.length > 0 && (
                                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                                                {catData.items.map((it, ii) => (
                                                  <span key={ii} style={{
                                                    fontSize: 10, color: 'var(--t2)',
                                                    background: 'var(--bg3)', borderRadius: 4, padding: '1px 7px', fontWeight: 600,
                                                  }}>
                                                    {it.name}
                                                    {catData.items.length > 1 && (
                                                      <span style={{ color: 'var(--t3)', marginLeft: 3 }}>· {fmt(it.amount)}</span>
                                                    )}
                                                  </span>
                                                ))}
                                              </div>
                                            )}

                                            {/* Mini bar + pct + amount */}
                                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                              <div style={{ width: 56, height: 5, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${catPct}%`, background: catColor, borderRadius: 4 }} />
                                              </div>
                                              <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, minWidth: 28, textAlign: 'right' }}>{catPct}%</span>
                                              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', minWidth: 72, textAlign: 'right' }}>{fmt(catData.amount)}</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td /><td /><td className="fw-800 fs-13">TOTAL</td>
                <td style={{ textAlign: 'right' }}><span className="amt amt-r fw-800">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span></td>
                <td style={{ textAlign: 'right' }}><span className="fw-700">{filtered.length}</span></td>
                <td style={{ textAlign: 'right' }}><span className="fw-700">100%</span></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── MRP Price Tracker Tab ─────────────────────────────────
// Tracks MRP (printed/market) prices for Grocery, Vegetable, Fruit &
// House Basic Needs items over time, grouped by category, with a
// price-history chart per item. Supports manual entry, checkbox-based
// bulk edit/delete, and JSON import.
//
// Firestore collection: 'mrpprices'
// Doc shape: { userId, category, itemName, mrp, unit, date, notes, createdAt, updatedAt }

const MRP_UNITS = ['KG', 'g', '500g', '250g', 'Litre', 'ml', 'Piece', 'Pack', 'Dozen'];

// Looks up a category's color from the Settings-managed category list
// (falls back to a neutral purple for categories with no color set, e.g.
// free-text categories that don't match any Settings entry).
function mrpCategoryColor(cat, cats) {
  return cats.find(c => c.name === cat)?.color || '#a78bfa';
}

// Accepts "17/06/2026", "17-06-2026", or already-ISO "2026-06-17"
function mrpParseDate(raw) {
  if (!raw) return today();
  const s = String(raw).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) { const [d, m, y] = s.split('-'); return `${y}-${m}-${d}`; }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d, m, y] = s.split('/'); return `${y}-${m}-${d}`; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return today();
}

// ─── Entry Form (Add / Edit) ───────────────────────────────
function MrpEntryForm({ item, cats, onSave, onClose }) {
  const [f, setF] = useState({
    category: item?.category || cats.find(c => c.isFavorite)?.name || cats[0]?.name || 'Grocery',
    itemName: item?.itemName || '',
    mrp: item?.mrp != null ? String(item.mrp) : '',
    unit: item?.unit || 'KG',
    date: item?.date ? fmtDateInput(item.date) : today(),
    notes: item?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    const mrp = parseFloat(f.mrp);
    if (!f.itemName.trim()) { toast.error('Enter item name'); return; }
    if (!mrp || mrp <= 0) { toast.error('Enter a valid MRP price'); return; }
    setLoading(true);
    try {
      await onSave({ ...f, itemName: f.itemName.trim(), mrp });
    } catch (err) {
      console.error('MRP save error:', err);
      toast.error('Save failed: ' + (err?.message || 'unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="fg">
        <label className="fl">Category</label>
        <CategoryDropdown cats={cats} value={f.category} onChange={val => setF(p => ({ ...p, category: val }))} />
      </div>

      <div className="fg">
        <label className="fl">Item Name</label>
        <input className="fi" name="itemName" value={f.itemName} onChange={ch} placeholder="e.g. Tomato, Rice, Toor Dal, Soap" required />
      </div>

      <div className="flex gap-3">
        <div className="fg" style={{ flex: 1 }}>
          <label className="fl">MRP Price (₹)</label>
          <input className="fi" name="mrp" type="number" step="0.01" min="0" value={f.mrp} onChange={ch} placeholder="0.00" required />
        </div>
        <div className="fg" style={{ width: 120 }}>
          <label className="fl">Unit</label>
          <select className="fi" name="unit" value={f.unit} onChange={ch}>
            {MRP_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <div className="fg">
        <label className="fl">Date</label>
        <input className="fi" name="date" type="date" value={f.date} onChange={ch} required />
      </div>

      <div className="fg">
        <label className="fl">Notes (optional)</label>
        <input className="fi" name="notes" value={f.notes} onChange={ch} placeholder="e.g. Local market, brand name..." />
      </div>

      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <span className="spin" /> : null} {item ? 'Update Price' : 'Save Price'}
        </button>
      </div>
    </form>
  );
}

// ─── Paid Via Picker (bank/card aware) ──────────────────────
// Self-contained version of the picker used in the main Expense form —
// used here so a whole scanned bill can be tagged with one payment method.
function PaidViaPicker({ value, onChange }) {
  const [bankPaidVia, setBankPaidVia] = useState([]);
  const [cardPaidVia, setCardPaidVia] = useState([]);
  const STATIC_PAID_VIA = ['Paytm', 'Cash', 'Cash Wallet', '💵 Meal Card', 'UTS Wallet', 'Amazon Wallet'];

  useEffect(() => {
    const uid = auth.currentUser?.uid; if (!uid) return;
    getDocs(query(collection(db, 'bankaccounts'), where('userId', '==', uid)))
      .then(snap => {
        const names = snap.docs.map(d => d.data().name).filter(Boolean).sort();
        setBankPaidVia(names);
        if (!value && names.length > 0) onChange(names[0]);
      })
      .catch(() => {});
    getDocs(query(collection(db, 'cards'), where('userId', '==', uid)))
      .then(snap => {
        const labels = snap.docs.map(d => d.data()).filter(c => c.isActive !== false)
          .map(c => c.last4 ? `${c.name} (****${c.last4})` : c.name).sort();
        setCardPaidVia(labels);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allPaidVia = [
    ...bankPaidVia,
    ...cardPaidVia.filter(c => !bankPaidVia.includes(c)),
    ...STATIC_PAID_VIA.filter(s => !bankPaidVia.includes(s) && !cardPaidVia.includes(s)),
  ];

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {allPaidVia.map(p => {
        const isBank = bankPaidVia.includes(p);
        const isCard = cardPaidVia.includes(p);
        return (
          <button key={p} type="button" onClick={() => onChange(p)}
            style={{
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              border: `2px solid ${value === p ? (isBank ? 'var(--blue)' : isCard ? '#7c3aed' : 'var(--border2)') : 'var(--border2)'}`,
              background: value === p ? (isBank ? 'rgba(77,158,255,.12)' : isCard ? 'rgba(124,58,237,.1)' : 'rgba(148,163,184,.1)') : 'var(--bg3)',
              color: value === p ? (isBank ? 'var(--blue)' : isCard ? '#7c3aed' : 'var(--text)') : 'var(--t3)',
            }}>
            {isBank && '🏦 '}{isCard && !isBank && '💳 '}{p}
          </button>
        );
      })}
    </div>
  );
}

// ─── Bill Scan Review Modal ─────────────────────────────────
// Lets the user check/uncheck, rename, re-categorize, re-date, and correct
// the rate/amount for each item the model extracted, before anything is
// saved. Shows a live category-wise total at the bottom — that total is
// what gets written to the Expenses List tab on confirm.
function ScanReviewModal({ rows, setRows, cats, paidVia, setPaidVia, onConfirm, onClose, saving }) {
  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(r => (r._key === key ? { ...r, [field]: value } : r)));
  };
  const toggleAll = () => {
    const allIn = rows.every(r => r._included);
    setRows(prev => prev.map(r => ({ ...r, _included: !allIn })));
  };
  const includedRows = rows.filter(r => r._included);
  const includedCount = includedRows.length;

  // Live category-wise totals from the currently-included rows — this is
  // exactly what will land on the List tab (grouped by date + category)
  // when the user hits Save.
  const categoryTotals = {};
  includedRows.forEach(r => {
    const cat = r.Type || 'Uncategorized';
    const amt = parseFloat(r.Amount ?? r.MRPOrRate) || 0;
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
  });
  const grandTotal = Object.values(categoryTotals).reduce((s, v) => s + v, 0);

  return (
    <Modal title="📷 Review Scanned Bill" onClose={onClose}>
      <div style={{ padding: '0 20px 4px', fontSize: 12, color: 'var(--t3)' }}>
        Check the items, fix anything the scan got wrong, then save. Rate is used for price tracking; Amount is the line total (what's added to your Expenses list, grouped by date &amp; category).
      </div>
      <div className="tbl-wrap" style={{ margin: '10px 20px', maxHeight: 340, overflowY: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 32 }}><input type="checkbox" checked={rows.length > 0 && rows.every(r => r._included)} onChange={toggleAll} /></th>
              <th>Date</th>
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th style={{ textAlign: 'right' }}>Rate (₹)</th>
              <th style={{ textAlign: 'right' }}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r._key} style={{ opacity: r._included ? 1 : 0.45 }}>
                <td><input type="checkbox" checked={r._included} onChange={e => updateRow(r._key, '_included', e.target.checked)} /></td>
                <td>
                  <input className="fi" type="date" style={{ padding: '5px 6px', fontSize: 12, minWidth: 128 }}
                    value={r.Date} onChange={e => updateRow(r._key, 'Date', e.target.value)} />
                </td>
                <td>
                  <input className="fi" style={{ padding: '5px 8px', fontSize: 12, minWidth: 110 }}
                    value={r.Name} onChange={e => updateRow(r._key, 'Name', e.target.value)} />
                </td>
                <td>
                  <select className="fs" style={{ padding: '5px 8px', fontSize: 12 }}
                    value={r.Type} onChange={e => updateRow(r._key, 'Type', e.target.value)}>
                    {cats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </td>
                <td>
                  <select className="fs" style={{ padding: '5px 8px', fontSize: 12 }}
                    value={r.Qty} onChange={e => updateRow(r._key, 'Qty', e.target.value)}>
                    {MRP_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                <td>
                  <input className="fi" type="number" style={{ padding: '5px 8px', fontSize: 12, textAlign: 'right', width: 80 }}
                    value={r.MRPOrRate} onChange={e => updateRow(r._key, 'MRPOrRate', e.target.value)} />
                </td>
                <td>
                  <input className="fi" type="number" style={{ padding: '5px 8px', fontSize: 12, textAlign: 'right', width: 80 }}
                    value={r.Amount} onChange={e => updateRow(r._key, 'Amount', e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Category-wise sum — this is what gets added to the List tab, per date+category */}
      <div style={{ margin: '0 20px 12px', padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10 }}>
        <div className="fs-11 fw-700 text-muted mb-2" style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>Category Totals (→ List tab)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(categoryTotals).map(([cat, amt]) => (
            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: mrpCategoryColor(cat, cats), fontWeight: 700 }}>{cat}</span>
              <span className="font-mono fw-700">{fmt(amt)}</span>
            </div>
          ))}
          {Object.keys(categoryTotals).length === 0 && <div className="fs-12 text-muted">No items selected</div>}
        </div>
        {Object.keys(categoryTotals).length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border2)' }}>
            <span>Total</span>
            <span className="font-mono">{fmt(grandTotal)}</span>
          </div>
        )}
      </div>

      {/* Paid via — applies to all the Expense entries this scan creates */}
      <div style={{ margin: '0 20px 12px' }}>
        <label className="fl">Paid Via <span className="text-muted" style={{ fontWeight: 400, textTransform: 'none' }}>(applies to the whole bill)</span></label>
        <PaidViaPicker value={paidVia} onChange={setPaidVia} />
      </div>

      <div className="modal-foot" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="fs-12 text-muted">{includedCount} of {rows.length} selected</span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={saving || includedCount === 0}>
            {saving ? <span className="spin" /> : null} Save {includedCount} Item{includedCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main MRP Prices Tab ────────────────────────────────────
// ─── Paytm CSV Review Modal ─────────────────────────────────
// Same shape as the bill-scanner's review popup: check/uncheck, edit
// category per row, delete selected rows, then save. Also carries the
// Bank/Cash "expense type" selector for the whole batch.
// ─── Dividend Candidates (from a bank statement's credit rows) ─────
// Bank statements aren't just expenses — a NACH credit that looks like a
// stock dividend (matched via narration pattern) is offered here instead
// of being silently dropped, writing straight into the same 'dividends'
// collection the Portfolio → Dividends tab reads from.
function DividendCandidatesModal({ rows, setRows, stocks, onConfirm, onClose, saving }) {
  const updateRow = (key, field, value) => setRows(prev => prev.map(r => (r._key === key ? { ...r, [field]: value } : r)));
  const includedRows = rows.filter(r => r._included);

  return (
    <Modal title="💰 Possible Dividend Credits Found" onClose={onClose}>
      <div style={{ padding: '0 20px 4px', fontSize: 12, color: 'var(--t3)' }}>
        These credits look like they could be stock dividends rather than regular income — confirm the stock symbol for each one (a rough guess is pre-filled from the narration where possible) and they'll be added to your Portfolio → Dividends tab. Uncheck anything that isn't actually a dividend.
      </div>

      <div className="tbl-wrap" style={{ margin: '10px 20px', maxHeight: 320, overflowY: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Date</th>
              <th>Stock Symbol</th>
              <th style={{ textAlign: 'right' }}>Amount (₹)</th>
              <th>Shares <span className="text-muted" style={{ fontWeight: 400 }}>(optional)</span></th>
              <th>Narration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r._key} style={{ opacity: r._included ? 1 : 0.4 }}>
                <td><input type="checkbox" checked={r._included} onChange={e => updateRow(r._key, '_included', e.target.checked)} /></td>
                <td>
                  <input className="fi" type="date" style={{ padding: '5px 6px', fontSize: 12, minWidth: 120 }}
                    value={r.date} onChange={e => updateRow(r._key, 'date', e.target.value)} />
                </td>
                <td>
                  <input className="fi" list={`div-stock-${r._key}`} style={{ padding: '5px 8px', fontSize: 12, minWidth: 110 }}
                    value={r.symbol} onChange={e => updateRow(r._key, 'symbol', e.target.value)} placeholder="e.g. FEDERALBNK" />
                  <datalist id={`div-stock-${r._key}`}>
                    {stocks.map(s => <option key={s.id} value={s.symbol}>{s.name}</option>)}
                  </datalist>
                </td>
                <td>
                  <input className="fi" type="number" style={{ padding: '5px 8px', fontSize: 12, textAlign: 'right', width: 90 }}
                    value={r.amount} onChange={e => updateRow(r._key, 'amount', e.target.value)} />
                </td>
                <td>
                  <input className="fi" type="number" style={{ padding: '5px 8px', fontSize: 12, width: 80 }}
                    value={r.shares} onChange={e => updateRow(r._key, 'shares', e.target.value)} placeholder="—" />
                </td>
                <td className="fs-11 text-muted" title={r.description} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
        <span className="fs-12 text-muted">{includedRows.length} of {rows.length} will be added to Dividends</span>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Skip</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={saving || includedRows.length === 0}>
            {saving ? <span className="spin" /> : null} Add {includedRows.length} to Dividends
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PaytmReviewModal({ rows, setRows, cats, paidVia, setPaidVia, onCategoryAdded, onConfirm, onClose, saving }) {
  const [showAddCategory, setShowAddCategory] = useState(false);
  const updateRow = (key, field, value) => setRows(prev => prev.map(r => (r._key === key ? { ...r, [field]: value } : r)));
  const toggleAll = () => {
    const allIn = rows.every(r => r._included);
    setRows(prev => prev.map(r => ({ ...r, _included: !allIn })));
  };
  const deleteSelected = () => setRows(prev => prev.filter(r => !r._included));
  const includedRows = rows.filter(r => r._included);
  const total = includedRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  return (
    <Modal title="📥 Review Statement Transactions" onClose={onClose}>
      <div style={{ padding: '0 20px 4px', fontSize: 12, color: 'var(--t3)' }}>
        Check the transactions to import, fix any category the AI got wrong, or select rows and delete them if they shouldn't be here at all (refunds, failed payments, etc.). Read the full description if a category looks off — that's exactly what the AI based its guess on.
      </div>

      <div style={{ margin: '10px 20px' }}>
        <label className="fl">Paid Via <span className="text-muted" style={{ fontWeight: 400, textTransform: 'none' }}>(applies to all selected transactions)</span></label>
        <PaidViaPicker value={paidVia} onChange={setPaidVia} />
      </div>

      <div className="flex items-center justify-between" style={{ margin: '0 20px 8px', flexWrap: 'wrap', gap: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={deleteSelected} disabled={includedRows.length === 0}>🗑️ Delete Selected ({includedRows.length})</button>
        <div className="flex items-center gap-2">
          <span className="fs-12 text-muted">{includedRows.length} of {rows.length} selected · Total {fmt(total)}</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddCategory(true)}>+ Add Category</button>
        </div>
      </div>
      {showAddCategory && (
        <AddCategoryModal onClose={() => setShowAddCategory(false)} onAdded={(newCat) => { setShowAddCategory(false); onCategoryAdded?.(newCat); }} />
      )}

      <div className="tbl-wrap" style={{ margin: '0 20px 10px', maxHeight: 340, overflowY: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 32 }}><input type="checkbox" checked={rows.length > 0 && rows.every(r => r._included)} onChange={toggleAll} /></th>
              <th>Date</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Amount (₹)</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r._key} style={{ opacity: r._included ? 1 : 0.4 }}>
                <td><input type="checkbox" checked={r._included} onChange={e => updateRow(r._key, '_included', e.target.checked)} /></td>
                <td>
                  <input className="fi" type="date" style={{ padding: '5px 6px', fontSize: 12, minWidth: 120 }}
                    value={r.date} onChange={e => updateRow(r._key, 'date', e.target.value)} />
                </td>
                <td>
                  <input className="fi" style={{ padding: '5px 8px', fontSize: 12, minWidth: 220 }} title={r.description}
                    value={r.description} onChange={e => updateRow(r._key, 'description', e.target.value)} />
                </td>
                <td>
                  <input className="fi" type="number" style={{ padding: '5px 8px', fontSize: 12, textAlign: 'right', width: 90 }}
                    value={r.amount} onChange={e => updateRow(r._key, 'amount', e.target.value)} />
                </td>
                <td>
                  <select className="fs" style={{ padding: '5px 8px', fontSize: 12 }}
                    value={r.category} onChange={e => updateRow(r._key, 'category', e.target.value)}>
                    {cats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    {!cats.some(c => c.name === r.category) && r.category && <option value={r.category}>{r.category}</option>}
                  </select>
                  {r.aiSuggested && r.aiSuggested === r.category && (
                    <div className="fs-10 text-muted" style={{ marginTop: 2 }}>{r.fromTag ? '📌 From Paytm\'s own tag' : '💡 AI suggested'}</div>
                  )}
                  {r.aiSuggested && r.aiSuggested !== r.category && (
                    <div className="fs-10 text-muted" style={{ marginTop: 2 }}>{r.fromTag ? '📌 Paytm tagged' : '💡 AI suggested'}: {r.aiSuggested}</div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="text-muted" style={{ textAlign: 'center', padding: 16 }}>No transactions left — everything was deleted</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
        <span className="fs-12 text-muted">{includedRows.length} transaction{includedRows.length === 1 ? '' : 's'} will be saved</span>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={saving || includedRows.length === 0}>
            {saving ? <span className="spin" /> : null} Save {includedRows.length}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const STATEMENT_SOURCES = [
  { key: 'paytm', label: '🅿️ Paytm', bank: '' },
  { key: 'idfc', label: '🏦 IDFC First Bank', bank: 'IDFC First Bank' },
  { key: 'hdfc', label: '🏦 HDFC Bank', bank: 'HDFC Bank' },
  { key: 'icici', label: '🏦 ICICI Bank', bank: 'ICICI Bank' },
];

function PaytmTab({ cats, onExpensesChanged }) {
  const [source, setSource] = useState('paytm');
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewRows, setReviewRows] = useState(null); // null until a file has been processed
  const [paidVia, setPaidVia] = useState('');
  const [localCats, setLocalCats] = useState([]); // categories added mid-review, before the next full reload picks them up from Settings
  const effectiveCats = [...cats, ...localCats.filter(lc => !cats.some(c => c.name === lc.name))];
  const [dividendCandidates, setDividendCandidates] = useState(null); // possible dividend credits found in a bank statement, or null
  const [pendingExpenseRows, setPendingExpenseRows] = useState(null); // holds expense rows while the dividend modal is up first
  const [stocks, setStocks] = useState([]); // for the dividend quick-add symbol picker
  const fileRef = useRef(null);
  const scanUrl = localStorage.getItem('fintrack_scan_gas_url') || ''; // same Apps Script deployment used by the bill scanner

  // Paytm's "Download Statement" export is an actual Excel file — despite
  // sometimes carrying a .csv-looking name — with a "Passbook Payment
  // History" sheet holding the real transactions (a "Summary" sheet with
  // just totals sits alongside it, and is ignored here).
  const findTransactionSheet = (workbook) => {
    if (workbook.Sheets['Passbook Payment History']) return workbook.Sheets['Passbook Payment History'];
    // Fallback for a differently-named sheet: pick whichever sheet's first
    // row looks like transaction headers, rather than assuming a fixed name.
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      const firstRow = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, blankrows: false })[0] || [];
      const headerText = firstRow.join(' ').toLowerCase();
      if (headerText.includes('date') && (headerText.includes('amount') || headerText.includes('transaction'))) return sheet;
    }
    return workbook.Sheets[workbook.SheetNames[0]];
  };

  // Bank statement exports (IDFC/HDFC/ICICI and most Indian banks) usually
  // have several metadata rows first — account holder name, address,
  // statement period, branch — before the real transaction table begins.
  // This scans for the row that actually looks like column headers,
  // instead of assuming row 0 is the header the way Paytm's file is.
  const findBankHeaderRowAndParse = (sheet) => {
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
    let headerIdx = -1;
    for (let i = 0; i < Math.min(raw.length, 30); i++) {
      const rowText = raw[i].join(' ').toLowerCase();
      const hasDate = rowText.includes('date');
      const hasDesc = rowText.includes('narration') || rowText.includes('description') || rowText.includes('particulars');
      const hasAmount = rowText.includes('withdrawal') || rowText.includes('debit') || rowText.includes('deposit') || rowText.includes('credit') || rowText.includes('amount');
      if (hasDate && hasDesc && hasAmount) { headerIdx = i; break; }
    }
    if (headerIdx === -1) return [];
    const headers = raw[headerIdx].map(h => String(h).trim());
    return raw.slice(headerIdx + 1).map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    });
  };

  const pickField = (row, candidates) => {
    for (const c of candidates) {
      const key = Object.keys(row).find(k => k.trim().toLowerCase() === c.toLowerCase());
      if (key && row[key] !== undefined && row[key] !== '') return row[key];
    }
    return '';
  };

  // Paytm's Amount column is a single signed value — "+1.00" for money in,
  // "-232.00" for money out — which is a much more reliable debit/credit
  // signal than guessing from a separate type column.
  const parseSignedAmount = (raw) => {
    const s = String(raw).trim();
    const n = parseFloat(s.replace(/[₹,\s]/g, ''));
    if (isNaN(n)) return { amount: 0, debit: false };
    return { amount: Math.abs(n), debit: n < 0 || (s.startsWith('-')) };
  };

  const MONTH_NAMES = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const parseDate = (raw) => {
    if (!raw) return today();
    const s = String(raw).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); // DD/MM/YYYY — Paytm, most banks
    if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/); // DD/MM/YY — some bank exports
    if (m) return `20${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    m = s.toLowerCase().match(/^(\d{1,2})[- ]([a-z]{3})[- ](\d{4})/); // "01-Aug-2026" / "01 Aug 2026"
    if (m && MONTH_NAMES[m[2]]) return `${m[3]}-${MONTH_NAMES[m[2]]}-${String(m[1]).padStart(2, '0')}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return today();
  };

  // Bank statements typically use either two separate columns (Withdrawal
  // Amt / Deposit Amt — a value in one XOR the other) or a single signed
  // Amount column with a Dr/Cr indicator elsewhere. This handles both.
  const parseBankAmount = (row) => {
    const withdrawal = pickField(row, ['Withdrawal Amt.', 'Withdrawal Amt', 'Withdrawal', 'Debit Amount', 'Debit']);
    const deposit = pickField(row, ['Deposit Amt.', 'Deposit Amt', 'Deposit', 'Credit Amount', 'Credit']);
    const wAmt = parseFloat(String(withdrawal).replace(/[₹,\s]/g, '')) || 0;
    const dAmt = parseFloat(String(deposit).replace(/[₹,\s]/g, '')) || 0;
    if (wAmt > 0) return { amount: wAmt, debit: true };
    if (dAmt > 0) return { amount: dAmt, debit: false };
    // Fall back to a single signed Amount column, same as Paytm's format
    const single = pickField(row, ['Amount']);
    const { amount, debit } = parseSignedAmount(single);
    return { amount, debit };
  };

  // Paytm already tags many transactions itself (e.g. "#🛒 Groceries",
  // "#🥘 Food", "#🧾 Bill Payments") — this strips the emoji/# and tries to
  // match that tag straight to one of the user's real category names, so
  // clearly-tagged transactions skip the AI call entirely (saves quota,
  // and Paytm's own tag is often more reliable than a guess from raw text
  // anyway). Only untagged/unmatched rows get sent to the AI.
  const matchTagToCategory = (tag, categoryList) => {
    if (!tag) return null;
    const cleaned = tag.replace(/^#/, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim().toLowerCase();
    if (!cleaned) return null;
    // Direct or substring match against the user's actual category names first
    const exact = categoryList.find(c => c.name.toLowerCase() === cleaned);
    if (exact) return exact.name;
    const partial = categoryList.find(c => c.name.toLowerCase().includes(cleaned) || cleaned.includes(c.name.toLowerCase()));
    if (partial) return partial.name;
    // A small set of common Paytm tag → likely category keyword hints, for
    // when the user's category is phrased differently than Paytm's tag
    const HINTS = {
      groceries: ['grocery', 'groceries', 'vegetable', 'food'],
      food: ['food', 'restaurant', 'dining', 'eating'],
      'bill payments': ['bill', 'utility', 'utilities', 'electricity'],
      shopping: ['shopping', 'apparel', 'clothes'],
      'money transfer': ['transfer', 'personal', 'friend', 'family'],
      cashback: null, // cashback is income, not an expense — never auto-categorized as an expense
      recharge: ['recharge', 'mobile', 'phone', 'bill'],
      travel: ['travel', 'transport', 'commute', 'fuel', 'petrol'],
      entertainment: ['entertainment', 'movie', 'subscription'],
      medical: ['medical', 'health', 'pharmacy', 'medicine'],
    };
    const hintKeywords = HINTS[cleaned];
    if (hintKeywords === null) return null; // explicitly excluded (e.g. cashback)
    if (hintKeywords) {
      for (const kw of hintKeywords) {
        const match = categoryList.find(c => c.name.toLowerCase().includes(kw));
        if (match) return match.name;
      }
    }
    return null;
  };

  // Dividend credits from listed companies typically arrive via NACH, often
  // (but not always) with "DIV"/"DIVIDEND"/"FNLDIV"/"FIN.DIV" in the
  // narration. A NACH credit with no dividend keyword is still flagged as a
  // lower-confidence guess, UNLESS it explicitly says interest — since NACH
  // credits without an interest label are usually dividends in practice.
  const isDividendLike = (desc) => {
    const d = (desc || '').toLowerCase();
    // \bint\d*\b catches "INT" whether standalone or immediately followed
    // by digits with no separator (e.g. "1st INT27") — plain \bint\b alone
    // misses that case, since there's no word boundary between a letter
    // and a digit with nothing between them.
    if (/\bint\d*\b|interest/.test(d)) return false;
    if (/\bdiv\b|dividend|fnldiv|fin\.?div/.test(d)) return true;
    if (/^nach\//.test(d)) return true;
    return false;
  };

  // Pulls a rough company/stock name guess out of a NACH narration, e.g.
  // "NACH/FBL FIN.DIV25-26/..." → "FBL", "NACH/KALYAN FNLDIV 2026/..." →
  // "KALYAN" — just a starting point for you to correct in the quick-add form.
  const guessCompanyName = (desc) => {
    const m = (desc || '').match(/^NACH\/([^/]+)/i);
    if (!m) return '';
    return m[1].replace(/\bFIN\.?DIV.*$|\bFNLDIV.*$|\bDIV.*$/i, '').trim();
  };

  const handleCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!scanUrl) { toast.error('Set up the bill-scanner URL first (Expenses → MRP Prices → ⚙️) — the Paytm categorizer reuses that same connection'); if (fileRef.current) fileRef.current.value = ''; return; }

    setProcessing(true);
    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array', cellDates: false });

      var parsedRows;
      if (source === 'paytm') {
        const sheet = findTransactionSheet(workbook);
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (raw.length === 0) { toast.error('No rows found in that file'); return; }
        parsedRows = raw.map(row => {
          const rawAmount = pickField(row, ['Amount']);
          const { amount, debit } = parseSignedAmount(rawAmount);
          return {
            date: parseDate(pickField(row, ['Date', 'Transaction Date', 'Txn Date'])),
            description: pickField(row, ['Transaction Details', 'Description', 'Details', 'Narration', 'Remarks']) || 'Paytm transaction',
            amount,
            debit,
            tag: pickField(row, ['Tags']),
            bankAccount: pickField(row, ['Your Account']),
          };
        }).filter(r => r.amount > 0);
      } else {
        // Generic bank statement (IDFC/HDFC/ICICI and most Indian banks share
        // this basic shape): find the real header row first, since these
        // exports usually have several metadata rows before the table starts.
        const sheetName = workbook.SheetNames[0];
        const raw = findBankHeaderRowAndParse(workbook.Sheets[sheetName]);
        if (raw.length === 0) { toast.error("Couldn't find a transaction table in that file — this bank's exact format may differ from what's expected. Share the file (or its column headers) and I'll adjust the parser."); return; }
        const bankLabel = STATEMENT_SOURCES.find(s => s.key === source)?.bank || 'Bank';
        parsedRows = raw.map(row => {
          const { amount, debit } = parseBankAmount(row);
          return {
            date: parseDate(pickField(row, ['Date', 'Value Date', 'Transaction Date', 'Txn Date'])),
            description: pickField(row, ['Narration', 'Description', 'Particulars', 'Transaction Remarks']) || `${bankLabel} transaction`,
            amount,
            debit,
            tag: '', // bank statements don't carry Paytm-style tags — every debit row goes through the AI
            bankAccount: bankLabel,
          };
        }).filter(r => r.amount > 0);
      }

      if (parsedRows.length === 0) { toast.error("Couldn't read any transactions from that file — share it (or its column headers) and I'll adjust the parser."); return; }

      // Only debit (money OUT) transactions become expenses — credits
      // (cashback, refunds, self-transfers) are dropped from that flow. For
      // bank statements specifically, credits that look like stock
      // dividends are pulled out separately and offered for the Dividend
      // tracker instead of being silently discarded.
      const debitsOnly = parsedRows.filter(r => r.debit);
      let foundDividends = false;
      if (source !== 'paytm') {
        const creditRows = parsedRows.filter(r => !r.debit && isDividendLike(r.description));
        if (creditRows.length > 0) {
          foundDividends = true;
          setDividendCandidates(creditRows.map((r, i) => ({
            _key: `div_${Date.now()}_${i}`,
            _included: true,
            date: r.date,
            amount: r.amount,
            description: r.description,
            symbol: guessCompanyName(r.description),
            shares: '',
          })));
          if (stocks.length === 0) stockMasterService.getAll().then(setStocks).catch(() => {});
          toast.success(`Found ${creditRows.length} possible dividend credit${creditRows.length === 1 ? '' : 's'} — review separately below`);
        }
      }
      if (debitsOnly.length === 0) {
        if (!foundDividends) toast.error('No debit (money out) transactions found in this file — only credits were detected');
        setProcessing(false);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }

      // Try Paytm's own Tags first — only rows with no confident local
      // match get sent to the AI, which keeps API usage down.
      const localMatches = {};
      const needsAi = [];
      debitsOnly.forEach(r => {
        const m = matchTagToCategory(r.tag, effectiveCats);
        if (m) localMatches[r.description] = m;
        else needsAi.push(r);
      });

      let categoryByDesc = { ...localMatches };
      if (needsAi.length > 0) {
        const res = await fetch(scanUrl, {
          method: 'POST',
          body: JSON.stringify({ transactions: needsAi.map(r => r.description), categories: cats.map(c => c.name) }),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) throw new Error(`Categorizer returned ${res.status}`);
        let json;
        try { json = await res.json(); }
        catch { throw new Error('Categorizer did not return valid JSON'); }
        if (!json.success) throw new Error(json.error || 'Categorization failed');
        (json.categories || []).forEach(c => { categoryByDesc[c.description] = c.category; });
      }

      const rows = debitsOnly.map((r, i) => {
        const suggested = categoryByDesc[r.description] || cats[0]?.name || '';
        return {
          _key: `${Date.now()}_${i}`,
          _included: true,
          date: r.date,
          description: r.description,
          amount: r.amount,
          category: suggested,
          aiSuggested: suggested,
          fromTag: !!localMatches[r.description], // true if Paytm's own tag decided this, not the AI
          bankAccount: r.bankAccount,
        };
      });

      const tagCount = Object.keys(localMatches).length;
      const summary = `Categorized ${rows.length} transaction${rows.length === 1 ? '' : 's'}${tagCount > 0 ? ` (${tagCount} from Paytm's own tags, no AI needed)` : ''} — review before saving`;
      if (foundDividends) {
        // Show the dividend prompt first — the expense review opens right
        // after it's dismissed, instead of stacking two modals at once.
        setPendingExpenseRows({ rows, summary });
      } else {
        setReviewRows(rows);
        toast.success(summary);
      }
    } catch (err) {
      console.error('Paytm file processing error:', err);
      toast.error('Processing failed: ' + (err.message || 'unknown error'));
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmSave = async () => {
    const selected = (reviewRows || []).filter(r => r._included);
    if (selected.length === 0) { toast.error('Select at least one transaction'); return; }
    setSaving(true);
    try {
      let saved = 0;
      const dates = [];
      for (const r of selected) {
        try {
          await expenseService.create({
            date: r.date,
            category: r.category,
            itemName: r.description,
            amount: parseFloat(r.amount) || 0,
            paidVia: paidVia || '',
            notes: `Imported from Paytm CSV${paidVia ? ` (${paidVia})` : ''}`,
          });
          saved++;
          dates.push(r.date);
        } catch (err) {
          console.error('Failed to save Paytm transaction', r, err);
        }
      }
      toast.success(`Saved ${saved} of ${selected.length} transaction${selected.length === 1 ? '' : 's'} to the List tab`);
      setReviewRows(null);
      onExpensesChanged?.(dates);
    } catch (err) {
      console.error('Paytm save error:', err);
      toast.error('Save failed: ' + (err?.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDividends = async () => {
    const selected = (dividendCandidates || []).filter(r => r._included);
    if (selected.length === 0) { toast.error('Select at least one credit'); return; }
    setSaving(true);
    try {
      let saved = 0;
      for (const r of selected) {
        if (!r.symbol) { toast.error(`Skipped ₹${r.amount} on ${r.date} — no stock symbol entered`); continue; }
        try {
          const shares = parseFloat(r.shares) || 0;
          await dividendService.create({
            symbol: r.symbol.toUpperCase().trim(),
            stockName: r.symbol.trim(),
            date: r.date,
            shares,
            dividendPerShare: shares > 0 ? (parseFloat(r.amount) || 0) / shares : 0,
            totalAmount: parseFloat(r.amount) || 0,
            notes: `Imported from ${STATEMENT_SOURCES.find(s => s.key === source)?.bank || 'bank'} statement: ${r.description}`,
          });
          saved++;
        } catch (err) {
          console.error('Failed to save dividend', r, err);
        }
      }
      toast.success(`Added ${saved} of ${selected.length} dividend${selected.length === 1 ? '' : 's'} — check Portfolio → Dividends`);
      setDividendCandidates(null);
    } catch (err) {
      console.error('Dividend save error:', err);
      toast.error('Save failed: ' + (err?.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const revealPendingExpenseReview = () => {
    if (!pendingExpenseRows) return;
    setReviewRows(pendingExpenseRows.rows);
    toast.success(pendingExpenseRows.summary);
    setPendingExpenseRows(null);
  };

  const sourceLabel = STATEMENT_SOURCES.find(s => s.key === source)?.label || 'Statement';

  return (
    <div>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="fw-800 mb-2" style={{ fontSize: 15 }}>📥 Statement Import</div>

        <div className="fg" style={{ maxWidth: 260 }}>
          <label className="fl">Source</label>
          <select className="fs" value={source} onChange={e => setSource(e.target.value)}>
            {STATEMENT_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

        <div className="fs-12 text-muted mb-3" style={{ marginTop: 10 }}>
          {source === 'paytm'
            ? <>Upload your Paytm statement (Paytm app → Balance &amp; History → Download Statement — despite the filename, it's actually an Excel file). Transactions already tagged by Paytm itself (Groceries, Food, Bill Payments, etc.) are categorized instantly with no AI call; only untagged ones go through the categorizer.</>
            : <>Upload your {sourceLabel.replace(/^🏦 /, '')} statement (usually an Excel/XLS download from net banking). Every debit transaction is categorized by AI based on its narration, since bank statements don't carry ready-made tags the way Paytm does. This format is unverified against a real {sourceLabel.replace(/^🏦 /, '')} file — if it doesn't parse correctly, share the file (or its column headers) and I'll fix the parser.</>
          }
          {' '}Review and confirm before anything is saved.
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleCsv} disabled={processing} />
        <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={processing}>
          {processing ? <span className="spin" /> : '📥'} {processing ? 'Processing...' : `Upload ${sourceLabel.replace(/^(🅿️|🏦) /, '')} Statement`}
        </button>
        {!scanUrl && (
          <div className="fs-11 text-muted mt-2">⚠️ Needs the bill-scanner connection set up first — go to MRP Prices → ⚙️ to configure it once (this reuses the same connection).</div>
        )}
      </div>

      {reviewRows && (
        <PaytmReviewModal
          rows={reviewRows}
          setRows={setReviewRows}
          cats={effectiveCats}
          paidVia={paidVia}
          setPaidVia={setPaidVia}
          onCategoryAdded={(newCat) => setLocalCats(prev => [...prev, { id: `local_${newCat.name}`, ...newCat }])}
          onConfirm={confirmSave}
          onClose={() => setReviewRows(null)}
          saving={saving}
        />
      )}

      {dividendCandidates && (
        <DividendCandidatesModal
          rows={dividendCandidates}
          setRows={setDividendCandidates}
          stocks={stocks}
          onConfirm={async () => { await confirmDividends(); revealPendingExpenseReview(); }}
          onClose={() => { setDividendCandidates(null); revealPendingExpenseReview(); }}
          saving={saving}
        />
      )}
    </div>
  );
}

function MrpPricesTab({ onExpensesChanged }) {
  const [entries, setEntries] = useState([]);
  const [cats, setCats] = useState([]); // Settings-managed expense categories (shared with the main Expenses tab)
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null); // for chart drill-down
  // Daily list defaults to the current month only — the full history is
  // still used underneath for the Monthly Summary comparisons below, this
  // just keeps the day-by-day table from showing every entry ever added.
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
  const [dateTo, setDateTo] = useState(() => today());
  const [showMonthlySummary, setShowMonthlySummary] = useState(false);
  const [summaryCategory, setSummaryCategory] = useState('');

  // Checkbox bulk-select state
  const [selected, setSelected] = useState(new Set());
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // JSON import state
  const [importing, setImporting] = useState(false);
  const jsonFileRef = useRef(null);

  // Bill photo scan state
  const [scanning, setScanning] = useState(false);
  const [scanReview, setScanReview] = useState(null); // array of editable rows pending confirmation, or null
  const [scanPaidVia, setScanPaidVia] = useState(''); // applies to all Expense entries this scan creates
  const [confirming, setConfirming] = useState(false);
  const photoFileRef = useRef(null);
  const [scanUrl, setScanUrl] = useState(() => localStorage.getItem('fintrack_scan_gas_url') || '');
  const [showScanUrlInput, setShowScanUrlInput] = useState(false);
  const [scanUrlInput, setScanUrlInput] = useState('');
  const saveScanUrl = () => {
    const url = scanUrlInput.trim();
    if (!url) { toast.error('Enter a valid URL'); return; }
    localStorage.setItem('fintrack_scan_gas_url', url);
    setScanUrl(url);
    setShowScanUrlInput(false);
    toast.success('Bill scanner URL saved!');
  };

  const load = useCallback(async () => {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); toast.error('Not signed in'); return; }
    try {
      const [snap, expCats] = await Promise.all([
        getDocs(query(collection(db, 'mrpprices'), where('userId', '==', uid))),
        categoryService.getAll('expense'),
      ]);
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => new Date(b.date) - new Date(a.date));
      setEntries(rows);
      setCats(expCats);
    } catch (err) {
      console.error('MRP load error:', err);
      toast.error('Failed to load MRP prices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (data) => {
    const uid = auth.currentUser?.uid;
    if (!uid) { toast.error('Not signed in'); throw new Error('Not signed in'); }
    const nowISO = new Date().toISOString();
    if (edit) {
      await updateDoc(doc(db, 'mrpprices', edit.id), {
        category: data.category, itemName: data.itemName, mrp: data.mrp,
        unit: data.unit, date: data.date, notes: data.notes || '',
        updatedAt: nowISO,
      });
      toast.success('Price updated!');
    } else {
      await addDoc(collection(db, 'mrpprices'), {
        category: data.category, itemName: data.itemName, mrp: data.mrp,
        unit: data.unit, date: data.date, notes: data.notes || '',
        userId: uid, createdAt: nowISO, updatedAt: nowISO,
      });
      toast.success('Price added!');
    }
    setModal(false); setEdit(null); load();
  };

  const del = async () => {
    try {
      await deleteDoc(doc(db, 'mrpprices', delId));
      toast.success('Deleted');
      setDelId(null); load();
    } catch (err) { console.error(err); toast.error('Failed to delete'); }
  };

  // ─── Checkbox selection (across all visible entries) ───
  const allVisibleIds = entries
    .filter(e => !catFilter || e.category === catFilter)
    .filter(e => !search || (e.itemName || '').toLowerCase().includes(search.toLowerCase()))
    .map(e => e.id);
  const toggleSelect = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllVisible = () => setSelected(
    allVisibleIds.every(id => selected.has(id)) && allVisibleIds.length > 0
      ? new Set([...selected].filter(id => !allVisibleIds.includes(id)))
      : new Set([...selected, ...allVisibleIds])
  );
  const bulkDelete = async () => {
    setBulkDeleting(true);
    try {
      for (const id of selected) await deleteDoc(doc(db, 'mrpprices', id));
      toast.success(`Deleted ${selected.size} price entries!`);
      setSelected(new Set()); setConfirmBulkDel(false); load();
    } catch (err) { console.error(err); toast.error('Bulk delete failed'); }
    finally { setBulkDeleting(false); }
  };

  // ─── Shared row importer — used by both JSON-file import and photo scan ───
  // Expects rows like: { Name, Type, Qty, Date, MRPOrRate, Notes? }
  const importRows = async (rows) => {
    const uid = auth.currentUser?.uid;
    if (!uid) { toast.error('Not signed in'); return { imported: 0, skipped: rows.length }; }

    let imported = 0;
    let skipped = 0;
    const skippedRows = [];
    const nowISO = new Date().toISOString();
    for (const row of rows) {
      const itemName = row.Name || row.name || row.itemName || row.Item;
      const mrpRaw = row.MRPOrRate ?? row.MRP ?? row.mrp ?? row.Rate ?? row.Price;
      const mrp = parseFloat(mrpRaw);
      if (!itemName || !mrp || mrp <= 0 || Number.isNaN(mrp)) {
        skipped++; skippedRows.push(row);
        continue; // skip invalid rows
      }

      // Normalize category: trim whitespace, match case-insensitively against
      // the user's actual Settings categories (shared with the main Expenses
      // tab) so MRP entries use the same category names throughout the app.
      let rawCategory = String(row.Type || row.Category || row.category || cats[0]?.name || 'Grocery').trim();
      const matched = cats.find(c => c.name.toLowerCase() === rawCategory.toLowerCase());
      const category = matched ? matched.name : rawCategory;

      const unit = row.Qty || row.Unit || row.unit || 'KG';
      const date = mrpParseDate(row.Date || row.date);

      try {
        const docRef = await addDoc(collection(db, 'mrpprices'), {
          category, itemName: String(itemName).trim(), mrp, unit,
          date, notes: row.Notes || row.notes || '',
          userId: uid, createdAt: nowISO, updatedAt: nowISO,
        });
        console.log('MRP import: wrote doc', docRef.id, { category, itemName, mrp, date });
        imported++;
      } catch (writeErr) {
        console.error('MRP import: write failed for row', row, writeErr);
        skipped++; skippedRows.push(row);
      }
    }
    if (skippedRows.length) console.warn('MRP import: skipped rows', skippedRows);
    return { imported, skipped, total: rows.length };
  };

  // ─── JSON Import ───
  // Expects an array of objects like:
  // { "Name": "Tomato", "Type": "Vegetable", "Qty": "KG", "Date": "17/06/2026", "MRPOrRate": "41" }
  const handleJsonImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uid = auth.currentUser?.uid;
    if (!uid) { toast.error('Not signed in'); e.target.value = ''; return; }

    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Flatten supported JSON shapes into a single list of row objects:
      //  1) Flat array: [{ Name, Type, Qty, Date, MRPOrRate }, ...]
      //  2) Nested/grouped object: { Date: "21/06/2026", Vegetables: [...], Fruits: [...] }
      //     — any top-level key holding an array is treated as a group of items;
      //       the group name becomes the category (Type) when the item has none,
      //       and the top-level Date applies to items that don't specify their own.
      //  3) Single flat object: treated as one row.
      let rows = [];
      if (Array.isArray(parsed)) {
        rows = parsed;
      } else if (parsed && typeof parsed === 'object') {
        const topDate = parsed.Date || parsed.date || null;
        const arrayKeys = Object.keys(parsed).filter(k => Array.isArray(parsed[k]));
        if (arrayKeys.length > 0) {
          arrayKeys.forEach(groupKey => {
            // Singularize common plural group names (Vegetables -> Vegetable, Fruits -> Fruit)
            let groupCategory = groupKey.replace(/s$/i, '');
            parsed[groupKey].forEach(item => {
              rows.push({
                ...item,
                Date: item.Date || item.date || topDate,
                Type: item.Type || item.Category || item.category || groupCategory,
              });
            });
          });
        } else {
          rows = [parsed];
        }
      }

      const { imported, skipped, total } = await importRows(rows);
      if (imported > 0) toast.success(`Imported ${imported} of ${total} price entries!`);
      if (skipped > 0) toast.error(`${skipped} row(s) skipped — check console for details`);
      await load();
    } catch (err) {
      console.error('MRP JSON import error:', err);
      toast.error('Import failed: ' + (err?.message || 'invalid JSON file'));
    } finally {
      setImporting(false);
      if (jsonFileRef.current) jsonFileRef.current.value = '';
    }
  };

  // ─── Bill Photo Scan ───
  // Resizes the photo client-side (keeps upload small + cheap), sends it to
  // the Apps Script → Gemini proxy, then feeds the returned rows through
  // the exact same importRows() path as JSON import.
  const compressImageToBase64 = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read photo'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('Could not decode photo'));
      img.onload = () => {
        // 1400px / quality 0.7 — a bit tighter than before specifically for
        // mobile: phone camera photos are often 3000px+ and several MB,
        // which makes the upload itself slow on mobile data even before
        // Gemini starts processing it. This keeps most bills well under 1MB.
        const MAX_DIM = 1400;
        let { width, height } = img;
        if (width > height && width > MAX_DIM) { height = Math.round(height * (MAX_DIM / width)); width = MAX_DIM; }
        else if (height > MAX_DIM) { width = Math.round(width * (MAX_DIM / height)); height = MAX_DIM; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // "data:image/jpeg;base64,...."
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  const scanAbortRef = useRef(null); // lets the Cancel button actually stop an in-flight scan

  const cancelScan = () => {
    if (scanAbortRef.current) scanAbortRef.current.abort();
    setScanning(false);
    toast('Scan cancelled', { icon: '✋' });
    if (photoFileRef.current) photoFileRef.current.value = '';
  };

  const handleBillPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!scanUrl) { setShowScanUrlInput(true); toast.error('Set your bill-scanner URL first'); if (photoFileRef.current) photoFileRef.current.value = ''; return; }

    setScanning(true);
    const controller = new AbortController();
    scanAbortRef.current = controller;
    // 150s of actual network time, but a mobile browser pauses this timer
    // while the tab is backgrounded (e.g. while you're in the native camera
    // app or another app) — so this alone can't catch every stuck case,
    // which is exactly why there's now a manual Cancel button too.
    const timeoutId = setTimeout(() => controller.abort(), 150000);

    // If you switch away (camera app, another tab, lock screen) and come
    // back while it's still scanning, let you know it's still working
    // rather than leaving you guessing whether it's frozen.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && scanAbortRef.current === controller) {
        toast('Still scanning your bill…', { icon: '⏳' });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    try {
      const base64Image = await compressImageToBase64(file);
      const res = await fetch(scanUrl, {
        method: 'POST',
        body: JSON.stringify({ image: base64Image, categories: cats.map(c => c.name) }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Scanner returned ${res.status}`);

      let json;
      try { json = await res.json(); }
      catch { throw new Error('Scanner did not return valid JSON — check the deployment is set to "Anyone" access.'); }
      if (!json.success) throw new Error(json.error || 'Scan failed');

      const items = Array.isArray(json.items) ? json.items : [];
      if (items.length === 0) { toast.error('No items detected on the bill — try a clearer photo'); return; }

      // Apply the bill's date (if the model found one) to every row that lacks its own,
      // and give each row a stable key + "included" flag for the review popup.
      const rows = items.map((it, i) => ({
        _key: `${Date.now()}_${i}`,
        _included: true,
        Name: it.Name || '',
        Type: it.Type || cats[0]?.name || 'Grocery',
        Qty: it.Qty || 'KG',
        MRPOrRate: it.Rate ?? it.MRPOrRate ?? '',
        Amount: it.Amount ?? it.Rate ?? it.MRPOrRate ?? '', // line total — falls back to Rate if the model didn't return one
        Date: it.Date || json.date || today(),
      }));

      setScanReview(rows);
      toast.success(`Found ${rows.length} item${rows.length === 1 ? '' : 's'} — review before saving`);
    } catch (err) {
      console.error('Bill photo scan error:', err);
      if (err.name === 'AbortError') {
        toast.error('Scan timed out or was cancelled. Try again with a clearer, closer photo, or on a stronger connection.');
      } else {
        toast.error('Scan failed: ' + (err.message || 'unknown error'));
      }
    } finally {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisible);
      scanAbortRef.current = null;
      setScanning(false);
      if (photoFileRef.current) photoFileRef.current.value = '';
    }
  };

  // Called from the review popup once the user confirms the (possibly edited) rows
  const confirmScanImport = async () => {
    const selected = (scanReview || []).filter(r => r._included);
    if (selected.length === 0) { toast.error('Select at least one item'); return; }
    setConfirming(true);
    try {
      const { imported, skipped, total } = await importRows(selected);
      if (imported > 0) toast.success(`Added ${imported} of ${total} items to MRP tracker!`);
      if (skipped > 0) toast.error(`${skipped} item(s) skipped — check console for details`);

      // Group by (date, category) and sum the line Amount, then write one
      // Expense entry per group — this is what makes the scanned bill show
      // up as a total on the main Expenses List tab, split by category the
      // same way the receipt itself is.
      const groups = {};
      selected.forEach(r => {
        const date = r.Date || today();
        const category = r.Type || cats[0]?.name || 'Grocery';
        const amt = parseFloat(r.Amount ?? r.MRPOrRate) || 0;
        const key = `${date}__${category}`;
        if (!groups[key]) groups[key] = { date, category, amount: 0, count: 0, names: [] };
        groups[key].amount += amt;
        groups[key].count += 1;
        if (r.Name) groups[key].names.push(r.Name);
      });

      let expensesCreated = 0;
      const affectedDates = [];
      for (const g of Object.values(groups)) {
        if (g.amount <= 0) continue;
        // Use the actual item names (same text saved to the MRP Prices tab)
        // as the note, instead of just a count — e.g. "Tomato, Onion, Ginger"
        const itemList = g.names.join(', ');
        try {
          await expenseService.create({
            date: g.date,
            category: g.category,
            itemName: `Bill scan — ${g.category}`,
            paidVia: scanPaidVia || '',
            amount: g.amount,
            notes: itemList || `${g.count} item${g.count === 1 ? '' : 's'} from scanned bill`,
          });
          expensesCreated++;
          affectedDates.push(g.date);
        } catch (err) {
          console.error('Failed to create expense for scanned bill group', g, err);
        }
      }
      if (expensesCreated > 0) {
        toast.success(`Added ${expensesCreated} expense${expensesCreated === 1 ? '' : 's'} to the List tab (by category)`);
        onExpensesChanged?.(affectedDates);
      }

      setScanReview(null);
      await load();
    } catch (err) {
      console.error('Confirm scan import error:', err);
      toast.error('Save failed: ' + (err.message || 'unknown error'));
    } finally {
      setConfirming(false);
    }
  };


  const filtered = entries
    .filter(e => e.date >= dateFrom && e.date <= dateTo)
    .filter(e => !catFilter || e.category === catFilter)
    .filter(e => !search || (e.itemName || '').toLowerCase().includes(search.toLowerCase()));

  // Same date range as `filtered`, but without the category filter applied —
  // this is what the category pill counts are based on, so switching
  // categories doesn't change what "100% of visible entries" means.
  const dateFilteredEntries = entries.filter(e => e.date >= dateFrom && e.date <= dateTo);

  // Per-category counts, derived from actual entries in the selected date
  // range (not just the Settings list, and not the full history) so a
  // category that was scanned/imported without an exact Settings match
  // still shows up correctly, and the pill counts match what's visible below.
  const catCounts = dateFilteredEntries.reduce((acc, e) => {
    const name = e.category || 'Uncategorized';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  // Ordered list of category names to render: known Settings categories that
  // have entries, first (in Settings order), then any leftover category
  // names present in the data but not in the Settings list.
  const knownNames = cats.map(c => c.name);
  const categoryGroups = [
    ...knownNames.filter(n => catCounts[n] > 0),
    ...Object.keys(catCounts).filter(n => !knownNames.includes(n)),
  ];

  // ─── Monthly Summary (avg / low / high per product, by period) ───
  // Answers "what did this cost this month vs last month vs the last 3
  // months vs this time last year" without having to scroll through every
  // daily entry — once a month is over, this is the view that matters, not
  // the day-by-day log.
  //
  // Dates are stored as plain "YYYY-MM-DD" strings, so every boundary here
  // is also a plain string — comparing strings lexicographically gives the
  // correct chronological order with zero timezone risk. (An earlier
  // version built these boundaries with `new Date(y, m, d)`, which uses
  // local time, then compared against `new Date(dateString)`, which parses
  // as UTC — mixing those two is what caused Last Month to sometimes come
  // up empty.)
  const now = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // just a day-count lookup, no timezone-sensitive comparison involved
  const monthStartStr = (y, m) => `${y}-${pad2(m + 1)}-01`;
  const monthEndStr = (y, m) => `${y}-${pad2(m + 1)}-${pad2(daysInMonth(y, m))}`;
  const shiftMonth = (y, m, delta) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; };
  const nowYear = now.getFullYear(), nowMonth = now.getMonth();
  const todayStr = today();
  const last = shiftMonth(nowYear, nowMonth, -1);
  const threeAgo = shiftMonth(nowYear, nowMonth, -2);
  const summaryPeriods = [
    { key: 'current', label: 'Current Month', startStr: monthStartStr(nowYear, nowMonth), endStr: todayStr },
    { key: 'last', label: 'Last Month', startStr: monthStartStr(last.y, last.m), endStr: monthEndStr(last.y, last.m) },
    { key: '3month', label: 'Last 3 Months', startStr: monthStartStr(threeAgo.y, threeAgo.m), endStr: todayStr },
    { key: 'lastyear', label: 'Last Year (same month)', startStr: monthStartStr(nowYear - 1, nowMonth), endStr: monthEndStr(nowYear - 1, nowMonth) },
  ];
  const summaryCatEntries = entries.filter(e => e.category === (summaryCategory || categoryGroups[0]));
  const summaryProducts = [...new Set(summaryCatEntries.map(e => e.itemName))].filter(Boolean).sort();
  const summaryCell = (product, period) => {
    const vals = summaryCatEntries
      .filter(e => e.itemName === product && e.date >= period.startStr && e.date <= period.endStr)
      .map(e => parseFloat(e.mrp) || 0)
      .filter(v => v > 0);
    if (vals.length === 0) return null;
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    return { avg, low: Math.min(...vals), high: Math.max(...vals), count: vals.length };
  };

  const itemMap = {};
  filtered.forEach(e => {
    const key = `${e.category}__${(e.itemName || '').toLowerCase()}`;
    if (!itemMap[key]) itemMap[key] = { category: e.category, itemName: e.itemName, unit: e.unit, history: [] };
    itemMap[key].history.push(e);
  });
  Object.values(itemMap).forEach(it => {
    it.history.sort((a, b) => new Date(a.date) - new Date(b.date));
    it.latest = it.history[it.history.length - 1];
    it.minPrice = Math.min(...it.history.map(h => +h.mrp));
    it.maxPrice = Math.max(...it.history.map(h => +h.mrp));
    it.priceDiff = it.maxPrice - it.minPrice;
    it.pctChange = it.history[0].mrp > 0 ? (((it.history[it.history.length - 1].mrp - it.history[0].mrp) / it.history[0].mrp) * 100) : 0;
  });
  const itemList = Object.values(itemMap).sort((a, b) => b.priceDiff - a.priceDiff);

  // ─── Stat cards ───
  const totalItems = itemList.length;
  const totalEntries = filtered.length;
  const biggestJump = itemList[0];
  const avgPrice = totalItems > 0 ? (itemList.reduce((s, it) => s + (+it.latest.mrp), 0) / totalItems) : 0;

  // ─── Chart data: price-difference (max - min) per item, top 12 ───
  const diffChartData = itemList.slice(0, 12).map(it => ({
    name: it.itemName.length > 14 ? it.itemName.slice(0, 14) + '…' : it.itemName,
    fullName: it.itemName,
    min: it.minPrice,
    max: it.maxPrice,
    diff: +it.priceDiff.toFixed(2),
  }));

  // ─── Chart data: history line for selected item ───
  const historyChartData = selectedItem
    ? (itemMap[selectedItem]?.history.map(h => ({ date: fmtDate(h.date), mrp: +h.mrp })) || [])
    : [];

  if (loading) return <div className="card"><div className="empty"><div className="spin" style={{ margin: '0 auto' }} /></div></div>;

  return (
    <div>
      {/* Header / Action buttons */}
      <div className="flex items-center gap-3 mb-4" style={{ flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div className="fw-800" style={{ fontSize: 16 }}>🏷️ MRP Price Tracker</div>
          <div className="text-muted fs-12">Track Grocery, Vegetable, Fruit & House Basic Needs prices over time</div>
        </div>
        <input ref={jsonFileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleJsonImport} disabled={importing} />
        <button className="btn btn-secondary" onClick={() => jsonFileRef.current?.click()} disabled={importing}>
          {importing ? <span className="spin" /> : '📥'} Import JSON
        </button>
        <input ref={photoFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBillPhoto} disabled={scanning} />
        <button className="btn btn-secondary" onClick={() => photoFileRef.current?.click()} disabled={scanning}>
          {scanning ? <span className="spin" /> : '📷'} {scanning ? 'Scanning...' : 'Scan Bill'}
        </button>
        {scanning && (
          <button className="btn btn-danger btn-sm" onClick={cancelScan} title="Stop this scan and try again">✋ Cancel</button>
        )}
        <button className="btn btn-secondary" onClick={() => setShowMonthlySummary(v => !v)}>
          {showMonthlySummary ? '🙈 Hide' : '📊 Show'} Monthly Summary
        </button>
        <button className="btn-icon" style={{ border: '1px solid var(--border2)', borderRadius: 8, padding: '5px 8px' }}
          onClick={() => { setShowScanUrlInput(v => !v); setScanUrlInput(scanUrl); }} title="Configure bill scanner URL">⚙️</button>
        <button className="btn btn-primary" onClick={() => { setEdit(null); setModal(true); }}>➕ Add Price</button>
      </div>

      {showMonthlySummary && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="flex items-center justify-between mb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="fw-800 fs-13">📊 Monthly Price Summary</div>
            <select className="fs" style={{ minWidth: 160 }} value={summaryCategory || categoryGroups[0] || ''} onChange={e => setSummaryCategory(e.target.value)}>
              {categoryGroups.length === 0 && <option value="">No categories yet</option>}
              {categoryGroups.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          {summaryProducts.length === 0 ? (
            <div className="fs-12 text-muted" style={{ padding: 16, textAlign: 'center' }}>No price entries in this category yet</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Period</th>
                    {summaryProducts.map(p => <th key={p} style={{ textAlign: 'right' }}>{p}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {summaryPeriods.map(period => (
                    <tr key={period.key} style={period.key === 'current' ? { background: 'var(--bg3)' } : undefined}>
                      <td className={period.key === 'current' ? 'fw-800' : 'fw-700'} style={{ whiteSpace: 'nowrap' }}>{period.label}</td>
                      {summaryProducts.map(p => {
                        const cell = summaryCell(p, period);
                        return (
                          <td key={p} style={{ textAlign: 'right' }}>
                            {cell ? (
                              <div>
                                <div className="fw-700 fs-12">{fmt(cell.avg)}</div>
                                <div className="fs-10 text-muted">{fmt(cell.low)}–{fmt(cell.high)}</div>
                              </div>
                            ) : <span className="text-muted fs-12">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="fs-11 text-muted mt-2">Each cell shows Average, with the Low–High range below it. The Current Month row is highlighted — that's the range worth checking before you buy.</div>
        </div>
      )}

      {showScanUrlInput && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="fs-12 fw-700 mb-2">📷 Bill Scanner Setup (Apps Script + OpenAI, one-time)</div>
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--t2)', marginBottom: 10, lineHeight: 1.7 }}>
            1. Deploy the BillScanner Apps Script (from a personal Gmail account) → Web app → Execute as Me, access Anyone<br />
            2. Add your OpenAI API key in the script's Project Settings → Script Properties as <code>OPENAI_API_KEY</code><br />
            3. Copy the deployed /exec URL and paste it below
          </div>
          <div className="flex gap-2">
            <input className="fi" style={{ flex: 1, fontSize: 12 }} placeholder="https://script.google.com/macros/s/XXXXXXXX/exec"
              value={scanUrlInput} onChange={e => setScanUrlInput(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={saveScanUrl}>Save URL</button>
            {scanUrl && <button className="btn btn-secondary btn-sm" onClick={() => { localStorage.removeItem('fintrack_scan_gas_url'); setScanUrl(''); setShowScanUrlInput(false); toast.success('URL cleared'); }}>Clear</button>}
          </div>
        </div>
      )}


      {/* Category filter pills + search */}
      <div className="flex items-center gap-3 mb-4" style={{ flexWrap: 'wrap' }}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button onClick={() => setCatFilter('')}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `2px solid ${!catFilter ? 'var(--blue)' : 'var(--border2)'}`, background: !catFilter ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: !catFilter ? 'var(--blue)' : 'var(--t3)' }}>
            🌐 All <span style={{ opacity: .7 }}>({entries.length})</span>
          </button>
          {categoryGroups.map(name => {
            const color = mrpCategoryColor(name, cats);
            return (
              <button key={name} onClick={() => setCatFilter(catFilter === name ? '' : name)}
                style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `2px solid ${catFilter === name ? color : 'var(--border2)'}`, background: catFilter === name ? `${color}20` : 'var(--bg3)', color: catFilter === name ? color : 'var(--t3)' }}>
                {name} <span style={{ opacity: .7 }}>({catCounts[name] || 0})</span>
              </button>
            );
          })}
        </div>
        <div className="search" style={{ flex: 1, minWidth: 180 }}>
          <input placeholder="🔍 Search item name..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} className="btn-ghost">✕</button>}
        </div>
        <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
      </div>
      <div className="fs-11 text-muted mb-3">Showing {fmtDate(dateFrom)} – {fmtDate(dateTo)} below. Full history is still used for the Monthly Summary comparisons above.</div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
          <span className="fs-12 fw-700" style={{ color: 'var(--blue)' }}>{selected.size} selected</span>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmBulkDel(true)} disabled={bulkDeleting}>
            {bulkDeleting ? <span className="spin" /> : '🗑️'} Delete Selected
          </button>
          {selected.size === 1 && (
            <button className="btn btn-secondary btn-sm" onClick={() => {
              const id = [...selected][0];
              const e = entries.find(x => x.id === id);
              if (e) { setEdit(e); setModal(true); }
            }}>✏️ Edit Selected</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="card"><div className="empty">
          <div className="empty-icon">🏷️</div>
          <div className="empty-title">No MRP prices logged yet</div>
          <div className="empty-sub">Add your first price manually, or import a JSON file with your price list</div>
        </div></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="empty">
          <div className="empty-icon">🔍</div>
          <div className="empty-title">No matching price entries</div>
          <div className="empty-sub">Try a different category or search term</div>
          <button className="btn btn-secondary mt-3" onClick={() => { setCatFilter(''); setSearch(''); }}>Clear filters</button>
        </div></div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="stats mb-4">
            <div className="stat" style={{ '--c': 'var(--blue)' }}>
              <div className="stat-icon">📦</div>
              <div className="stat-val" style={{ color: 'var(--blue)' }}>{totalItems}</div>
              <div className="stat-label">Tracked Items</div>
            </div>
            <div className="stat" style={{ '--c': 'var(--green)' }}>
              <div className="stat-icon">🧾</div>
              <div className="stat-val" style={{ color: 'var(--green)' }}>{totalEntries}</div>
              <div className="stat-label">Price Entries</div>
            </div>
            <div className="stat" style={{ '--c': 'var(--orange)' }}>
              <div className="stat-icon">📈</div>
              <div className="stat-val" style={{ color: 'var(--orange)', fontSize: biggestJump ? 14 : undefined }}>{biggestJump ? biggestJump.itemName : '—'}</div>
              <div className="stat-label">Biggest Price Swing {biggestJump ? `(₹${biggestJump.priceDiff.toFixed(2)})` : ''}</div>
            </div>
            <div className="stat" style={{ '--c': 'var(--purple, #7c3aed)' }}>
              <div className="stat-icon">💰</div>
              <div className="stat-val" style={{ color: 'var(--purple, #7c3aed)' }}>₹{avgPrice.toFixed(0)}</div>
              <div className="stat-label">Avg Latest Price</div>
            </div>
          </div>

          {/* Price High-Difference Table */}
          {itemList.length > 0 && (
            <div className="card mb-4">
              <div className="card-title">📊 Price Range (Min vs Max MRP) — Top 5 Items by Difference</div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ textAlign: 'right' }}>Min Price</th>
                      <th style={{ textAlign: 'right' }}>Max Price</th>
                      <th style={{ textAlign: 'right' }}>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemList.slice(0, 5).map(it => (
                      <tr key={it.itemName} style={{ cursor: 'pointer' }} onClick={() => setSelectedItem(`${it.category}__${it.itemName.toLowerCase()}`)}>
                        <td className="fw-700">{it.itemName}</td>
                        <td style={{ textAlign: 'right' }} className="amt amt-g">{fmt(it.minPrice)}</td>
                        <td style={{ textAlign: 'right' }} className="amt amt-r">{fmt(it.maxPrice)}</td>
                        <td style={{ textAlign: 'right' }} className="fw-800">{fmt(it.priceDiff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-muted fs-11 mt-2">💡 Click a row to see its full price history chart</div>
            </div>
          )}

          {/* Item history line chart (drill-down) */}
          {selectedItem && historyChartData.length > 0 && (
            <div className="card mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="card-title" style={{ margin: 0 }}>📈 {itemMap[selectedItem].itemName} — Price History</div>
                <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 13 }}>✕ Close</button>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={historyChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--t3)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }} formatter={(val) => [`₹${val}`, 'MRP']} />
                  <Line type="monotone" dataKey="mrp" stroke="#4d9eff" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Grouped tables by category, with checkboxes for bulk edit/delete */}
          {categoryGroups.filter(name => !catFilter || catFilter === name).map(catName => {
            const catColor = mrpCategoryColor(catName, cats);
            const catEntries = filtered.filter(e => e.category === catName).sort((a, b) => new Date(b.date) - new Date(a.date));
            if (catEntries.length === 0) return null;
            const catIds = catEntries.map(e => e.id);
            const allCatSelected = catIds.length > 0 && catIds.every(id => selected.has(id));

            return (
              <div key={catName} className="card mb-4">
                <div className="card-title" style={{ color: catColor }}>{catName} ({catEntries.length} entries)</div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input type="checkbox" checked={allCatSelected}
                            onChange={() => setSelected(p => {
                              const n = new Set(p);
                              if (allCatSelected) catIds.forEach(id => n.delete(id));
                              else catIds.forEach(id => n.add(id));
                              return n;
                            })} />
                        </th>
                        <th>Item</th>
                        <th style={{ textAlign: 'right' }}>MRP</th>
                        <th>Unit</th>
                        <th>Date</th>
                        <th>Notes</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {catEntries.map(e => (
                        <tr key={e.id} style={{ background: selected.has(e.id) ? 'rgba(77,158,255,.07)' : 'transparent' }}>
                          <td>
                            <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} />
                          </td>
                          <td><span className="fw-700 fs-13" style={{ cursor: 'pointer' }} onClick={() => setSelectedItem(`${e.category}__${(e.itemName || '').toLowerCase()}`)}>{e.itemName}</span></td>
                          <td style={{ textAlign: 'right' }}><span className="amt amt-r fw-800">₹{(+e.mrp).toFixed(2)}</span></td>
                          <td><span style={{ fontSize: 12, color: 'var(--t3)' }}>{e.unit}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                          <td style={{ fontSize: 12, color: 'var(--t3)' }}>{e.notes || '—'}</td>
                          <td>
                            <div className="actions" style={{ justifyContent: 'center' }}>
                              <button className="btn-icon" onClick={() => { setEdit(e); setModal(true); }}>✏️</button>
                              <button className="btn-icon" onClick={() => setDelId(e.id)}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Note: entries with a category name that doesn't exactly match a
              Settings category still render above, in their own group named
              after whatever value is actually stored — see categoryGroups. */}

          {/* Summary table: per-item min/max/diff across all entries */}
          {itemList.length > 0 && (
            <div className="card mb-4">
              <div className="card-title">📋 Item Summary — Price Differences</div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Latest</th>
                      <th style={{ textAlign: 'right' }}>Min</th>
                      <th style={{ textAlign: 'right' }}>Max</th>
                      <th style={{ textAlign: 'right' }}>Difference</th>
                      <th>Entries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemList.map(it => {
                      const key = `${it.category}__${(it.itemName || '').toLowerCase()}`;
                      const isUp = it.pctChange > 0;
                      return (
                        <tr key={key} style={{ cursor: 'pointer' }} onClick={() => setSelectedItem(key)}>
                          <td><span className="fw-700 fs-13">{it.itemName}</span></td>
                          <td><span style={{ fontSize: 11, color: mrpCategoryColor(it.category, cats), fontWeight: 700 }}>{it.category}</span></td>
                          <td style={{ textAlign: 'right' }}><span className="amt amt-r fw-800">₹{(+it.latest.mrp).toFixed(2)}</span></td>
                          <td style={{ textAlign: 'right', color: 'var(--green)' }}>₹{it.minPrice.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--red, #f43f5e)' }}>₹{it.maxPrice.toFixed(2)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="fw-700" style={{ color: it.priceDiff > 0 ? 'var(--orange)' : 'var(--t3)' }}>
                              ₹{it.priceDiff.toFixed(2)} {it.history.length > 1 && (<span style={{ fontSize: 10 }}>{isUp ? '▲' : '▼'} {Math.abs(it.pctChange).toFixed(0)}%</span>)}
                            </span>
                          </td>
                          <td><span className="badge" style={{ fontSize: 11 }}>{it.history.length}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {modal && (
        <Modal title={edit ? '✏️ Edit MRP Price' : '➕ Add MRP Price'} onClose={() => { setModal(false); setEdit(null); }}>
          <MrpEntryForm item={edit} cats={cats} onSave={save} onClose={() => { setModal(false); setEdit(null); }} />
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
      {scanReview && (
        <ScanReviewModal
          rows={scanReview}
          setRows={setScanReview}
          cats={cats}
          paidVia={scanPaidVia}
          setPaidVia={setScanPaidVia}
          onConfirm={confirmScanImport}
          onClose={() => setScanReview(null)}
          saving={confirming}
        />
      )}
      {confirmBulkDel && (
        <div className="modal-overlay" onClick={() => setConfirmBulkDel(false)}>
          <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Delete {selected.size} price entries?</div>
            <div className="text-muted fs-13 mb-4">This action cannot be undone.</div>
            <div className="flex gap-3" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmBulkDel(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={bulkDelete} disabled={bulkDeleting}>{bulkDeleting ? <span className="spin" /> : null} Delete {selected.size}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Compare Tab ───────────────────────────────────────────
const INSIGHTS_PERIODS = [
  { key: 'weekly',    label: 'Weekly',   unit: 'wk', tag: '8-week' },
  { key: '3m',        label: '3 Months', unit: 'mo', tag: '3-month' },
  { key: '6m',        label: '6 Months', unit: 'mo', tag: '6-month' },
  { key: '1y',        label: '1 Year',   unit: 'mo', tag: '1-year' },
];

// ─── Add Category (quick-add from the Insights → Group by Category view) ──
// Creates a new expense category directly, without leaving this page.
// Note: a brand-new category won't appear in "Group by Category" until you
// log at least one expense in it — this view is driven by actual
// transactions, not the master category list, same as the rest of Insights.
const ADD_CAT_COLORS = ['#4d9eff', '#22c55e', '#a78bfa', '#f97316', '#f43f5e', '#fbbf24', '#38bdf8', '#e879f9', '#10d98a', '#fb7185'];
function AddCategoryModal({ onClose, onAdded }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(ADD_CAT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error('Enter a category name'); return; }
    setSaving(true);
    try {
      await categoryService.create({ name: name.trim(), type: 'expense', color });
      toast.success(`Added "${name.trim()}" — log an expense in it to see it here`);
      onAdded({ name: name.trim(), color });
    } catch (err) {
      console.error('Add category failed:', err);
      toast.error('Failed to add category: ' + (err?.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="➕ Add Category" onClose={onClose}>
      <div className="fg">
        <label className="fl">Category Name</label>
        <input className="fi" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pet Care, Subscriptions" autoFocus />
      </div>
      <div className="fg">
        <label className="fl">Color</label>
        <div className="flex gap-2" style={{ marginTop: 6, flexWrap: 'wrap' }}>
          {ADD_CAT_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `3px solid ${color === c ? 'var(--text)' : 'transparent'}`, cursor: 'pointer' }} />
          ))}
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? <span className="spin" /> : null} Add Category</button>
      </div>
    </Modal>
  );
}

function InsightsTab({ showFixed, isFixedCat }) {
  const now = new Date();
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const PALETTE_INS = ['#4d9eff','#22c55e','#f97316','#a78bfa','#f43f5e','#fbbf24','#2dd4bf','#fb923c','#38bdf8','#818cf8','#84cc16','#ec4899'];

  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState('3m'); // 'weekly' | '3m' | '6m' | '1y'
  const [showPeriodTable, setShowPeriodTable] = useState(false); // hidden by default
  const [showPieChart, setShowPieChart] = useState(false); // hidden by default
  const [showGroupedByCategory, setShowGroupedByCategory] = useState(false); // hidden by default
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [catSort, setCatSort] = useState({ key: 'total', dir: 'desc' }); // key: 'total' | 'avg' | a month index (number)
  const [monthData, setMonthData]   = useState([]); // period buckets, array of { label, total, ...cats, _items }
  const [allCats, setAllCats]       = useState([]);

  const periodCfg = INSIGHTS_PERIODS.find(p => p.key === period) || INSIGHTS_PERIODS[1];

  // Monday of the week containing date d (local, date-only)
  const mondayOf = (d) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay();
    x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
    return x;
  };
  const parseDateOnly = (val) => {
    if (!val) return null;
    if (val instanceof Date) return new Date(val.getFullYear(), val.getMonth(), val.getDate());
    if (typeof val === 'object' && typeof val.toDate === 'function') {
      const d = val.toDate();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const str = String(val);
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const load = async () => {
    setLoading(true);
    try {
      // Weekly view needs day-level data — fetch the underlying months, then bucket by week.
      // Monthly views (3m/6m/1y) fetch and bucket by calendar month directly.
      const monthsToFetch = period === 'weekly' ? 2 : (period === '3m' ? 3 : period === '6m' ? 6 : 12);
      const months = [];
      for (let i = monthsToFetch - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ m: d.getMonth() + 1, y: d.getFullYear(), label: `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
      }
      const fetched = await Promise.all(months.map(({ m, y }) => expenseService.getAll({ month: m, year: y })));

      let rows;
      if (period === 'weekly') {
        const flatRaw = fetched.flat();
        const flat = showFixed ? flatRaw : flatRaw.filter(i => !isFixedCat || !isFixedCat(i.category));
        const thisMonday = mondayOf(now);
        const weeks = [];
        for (let i = 7; i >= 0; i--) {
          const start = new Date(thisMonday); start.setDate(start.getDate() - i * 7);
          const end = new Date(start); end.setDate(end.getDate() + 6);
          weeks.push({ start, end, label: `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]}` });
        }
        rows = weeks.map(({ start, end, label }) => {
          const items = flat.filter(i => { const d = parseDateOnly(i.date); return d && d >= start && d <= end; });
          const total = items.reduce((s, i) => s + +i.amount, 0);
          const cats = {};
          items.forEach(i => { cats[i.category] = (cats[i.category] || 0) + +i.amount; });
          return { label, total, ...cats, _items: items };
        });
      } else {
        // Trust the server's own month/year scoping — same approach the page used before, just over more months.
        rows = months.map(({ label }, idx) => {
          const rawItems = fetched[idx];
          const items = showFixed ? rawItems : rawItems.filter(i => !isFixedCat || !isFixedCat(i.category));
          const total = items.reduce((s, i) => s + +i.amount, 0);
          const cats = {};
          items.forEach(i => { cats[i.category] = (cats[i.category] || 0) + +i.amount; });
          return { label, total, ...cats, _items: items };
        });
      }
      setMonthData(rows);
      const flatForCats = showFixed ? fetched.flat() : fetched.flat().filter(i => !isFixedCat || !isFixedCat(i.category));
      const catSet = new Set(flatForCats.map(i => i.category).filter(Boolean));
      setAllCats([...catSet].sort());
    } catch (e) { toast.error('Failed to load insights'); console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [showFixed, period]);

  // All categories with spend in the selected period — used for the table below (no cap, per user request)
  const allCatTotals = allCats
    .map(cat => ({ cat, total: monthData.reduce((s, d) => s + (d[cat] || 0), 0) }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total);

  // Top 8 only — feeds the stacked bar chart's legend/series, where more
  // than ~8 segments becomes visually unreadable. The table further down
  // uses allCatTotals instead, so it isn't limited by this.
  const topCats = allCatTotals.slice(0, 8);

  // Per-bucket averages per category
  const avgByCat = topCats.map(({ cat, total }) => ({
    cat,
    avg: monthData.length > 0 ? total / monthData.length : 0,
    color: PALETTE_INS[topCats.findIndex(c => c.cat === cat) % PALETTE_INS.length],
  })).sort((a, b) => b.avg - a.avg).slice(0, 10);

  // Shared row data for the Category × Month table, the pie chart, and the
  // group-by-category accordion — one place computes it, three views use it.
  const catRows = allCatTotals.map(({ cat, total }, i) => {
    const vals = monthData.map(d => d[cat] || 0);
    const avg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    return { cat, vals, avg, total, color: PALETTE_INS[i % PALETTE_INS.length] };
  });
  const sortedCatRows = [...catRows].sort((a, b) => {
    const va = catSort.key === 'total' ? a.total : catSort.key === 'avg' ? a.avg : (a.vals[catSort.key] || 0);
    const vb = catSort.key === 'total' ? b.total : catSort.key === 'avg' ? b.avg : (b.vals[catSort.key] || 0);
    return catSort.dir === 'desc' ? vb - va : va - vb;
  });
  const toggleCatSort = (key) => setCatSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
  const sortArrow = (key) => catSort.key === key ? (catSort.dir === 'desc' ? ' ▼' : ' ▲') : '';
  const toggleCatExpand = (cat) => setExpandedCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  // Per-month category totals for stacked bar
  const stackedData = monthData.map(d => {
    const row = { label: d.label };
    topCats.slice(0, 8).forEach(({ cat }) => { row[cat] = d[cat] || 0; });
    return row;
  });

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s, p) => s + (p.value || 0), 0);
    return (
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, maxWidth: 220 }}>
        <div className="fw-800 mb-2">{label}</div>
        {payload.map((p, i) => p.value > 0 && (
          <div key={i} className="flex justify-between gap-3 mb-1">
            <span style={{ color: p.fill || p.color }}>{p.name}</span>
            <span className="fw-700">₹{Number(p.value).toLocaleString('en-IN')}</span>
          </div>
        ))}
        {payload.length > 1 && (
          <div className="flex justify-between gap-3 mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="fw-700 text-muted">Total</span>
            <span className="fw-800">₹{total.toLocaleString('en-IN')}</span>
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="spin-center"><div className="spin spin-lg" /></div>;

  return (
    <div>
      {!showFixed && (
        <div style={{ background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'var(--orange)', fontWeight:700 }}>
          🔀 Variable expenses only — Fixed categories excluded
        </div>
      )}

      {/* ── Period Filter ── */}
      <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
        {INSIGHTS_PERIODS.map(p => (
          <button key={p.key} className={`btn btn-sm ${period === p.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Averages by Category ── */}
      <div className="card mb-4">
        <div className="card-title" style={{ marginBottom: 16 }}>
          📊 Averages by Category
          <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 400, marginLeft: 8 }}>· {periodCfg.tag}</span>
        </div>
        {avgByCat.length === 0 ? (
          <div className="empty"><div className="empty-icon">📊</div><div className="empty-title">No data</div></div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {avgByCat.map((c, i) => {
              const maxAvg = avgByCat[0].avg;
              const pct = maxAvg > 0 ? (c.avg / maxAvg) * 100 : 0;
              return (
                <div key={c.cat}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                      <span className="fs-13 fw-600">{c.cat}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="fs-12 text-muted">avg/{periodCfg.unit}</span>
                      <span className="fs-13 fw-800" style={{ color: c.color, minWidth: 72, textAlign: 'right' }}>
                        ₹{c.avg.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg3)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: c.color, borderRadius: 6, transition: 'width .4s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Expenses by Category (stacked bar, 3-month) ── */}
      <div className="card mb-4">
        <div className="card-title" style={{ marginBottom: 16 }}>
          🗂️ Expenses by Category
          <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 400, marginLeft: 8 }}>· {periodCfg.tag}</span>
        </div>
        {stackedData.length === 0 ? (
          <div className="empty"><div className="empty-icon">🗂️</div><div className="empty-title">No data</div></div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stackedData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {topCats.slice(0, 8).map(({ cat }, i) => (
                  <Bar key={cat} dataKey={cat} stackId="a" fill={PALETTE_INS[i % PALETTE_INS.length]} maxBarSize={64} />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {/* Pie chart — hidden by default */}
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => setShowPieChart(v => !v)}>
              {showPieChart ? '🙈 Hide' : '🥧 Show'} Pie Chart
            </button>
            {showPieChart && (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={catRows} dataKey="total" nameKey="cat" cx="50%" cy="50%" outerRadius={100} label={({ cat, percent }) => `${cat} ${(percent * 100).toFixed(0)}%`}>
                    {catRows.map((r, i) => <Cell key={r.cat} fill={r.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `₹${(+v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}

            {/* Category × Month table — shows every category, unlike the chart above (capped to top 8 for readability). Click any month or Avg header to sort by that column's price. */}
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--t3)', fontWeight: 700 }}>Category</th>
                    {monthData.map((d, i) => (
                      <th key={i} onClick={() => toggleCatSort(i)} style={{ textAlign: 'right', padding: '6px 10px', color: catSort.key === i ? 'var(--blue)' : 'var(--t3)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }} title="Click to sort by this column">
                        {d.label}{sortArrow(i)}
                      </th>
                    ))}
                    <th onClick={() => toggleCatSort('avg')} style={{ textAlign: 'right', padding: '6px 10px', color: catSort.key === 'avg' ? 'var(--blue)' : 'var(--t3)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }} title="Click to sort by average">
                      Avg/{periodCfg.unit}{sortArrow('avg')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCatRows.map(({ cat, vals, avg, color }) => {
                    const maxVal = Math.max(...vals);
                    return (
                      <tr key={cat} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '7px 10px' }}>
                          <div className="flex items-center gap-2">
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span className="fw-600">{cat}</span>
                          </div>
                        </td>
                        {vals.map((v, j) => (
                          <td key={j} style={{ textAlign: 'right', padding: '7px 10px', fontWeight: v === maxVal && v > 0 ? 800 : 400, color: v === maxVal && v > 0 ? 'var(--red)' : v === 0 ? 'var(--t3)' : 'var(--text)' }}>
                            {v > 0 ? `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                          </td>
                        ))}
                        <td style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 700, color }}>
                          ₹{avg.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 800, fontSize: 12, color: 'var(--t3)' }}>TOTAL</td>
                    {monthData.map((d, i) => (
                      <td key={i} style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 800 }}>
                        ₹{d.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 800 }}>
                      ₹{(monthData.length > 0 ? monthData.reduce((s, d) => s + d.total, 0) / monthData.length : 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Group by Category — hidden by default. Expand a category to see its month-by-month breakdown and the actual transactions behind each period. */}
            <div className="flex items-center gap-2" style={{ marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowGroupedByCategory(v => !v)}>
                {showGroupedByCategory ? '🙈 Hide' : '📂 Show'} Group by Category
              </button>
              {showGroupedByCategory && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddCategory(true)}>+ Add Category</button>
              )}
            </div>
            {showAddCategory && (
              <AddCategoryModal onClose={() => setShowAddCategory(false)} onAdded={() => setShowAddCategory(false)} />
            )}
            {showGroupedByCategory && sortedCatRows.length === 0 && (
              <div className="text-muted fs-12" style={{ marginTop: 12, padding: 16, textAlign: 'center', background: 'var(--bg3)', borderRadius: 10 }}>
                No categories with any spend in the selected period ({period}). Try widening the period above, or check that expenses have been logged with a category.
              </div>
            )}
            {showGroupedByCategory && sortedCatRows.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="flex items-center justify-between" style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 10, fontWeight: 800, fontSize: 13 }}>
                  <span>Grand Total ({sortedCatRows.length} categor{sortedCatRows.length === 1 ? 'y' : 'ies'})</span>
                  <span style={{ color: 'var(--blue)' }}>₹{sortedCatRows.reduce((s, r) => s + r.total, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                </div>
                {sortedCatRows.map(({ cat, vals, avg, total, color }) => {
                  const isOpen = expandedCats.has(cat);
                  return (
                    <div key={cat} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <button onClick={() => toggleCatExpand(cat)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <div className="flex items-center gap-2">
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span className="fw-700 fs-13">{cat}</span>
                          <span className="text-muted fs-11">{isOpen ? '▲' : '▼'}</span>
                        </div>
                        <span className="fw-800 fs-13" style={{ color }}>₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginTop: 10, marginBottom: 10 }}>
                            {monthData.map((d, i) => (
                              <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '6px 10px' }}>
                                <div className="fs-10 text-muted">{d.label}</div>
                                <div className="fw-700 fs-12">{vals[i] > 0 ? `₹${vals[i].toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}</div>
                              </div>
                            ))}
                          </div>
                          <div className="fs-11 text-muted mb-2">Avg/{periodCfg.unit}: <span className="fw-700" style={{ color }}>₹{avg.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                          {/* Actual transactions in this category, across the selected period */}
                          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                            {monthData.flatMap(d => (d._items || []).filter(it => it.category === cat))
                              .sort((a, b) => new Date(b.date) - new Date(a.date))
                              .map(it => (
                                <div key={it.id} className="flex justify-between fs-11" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                  <span className="text-muted">{fmtDate(it.date)} · {it.itemName || it.notes || '—'}</span>
                                  <span className="fw-600">₹{(+it.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Transposed view: Period (weekly/monthly/etc, per the selector above) on rows, Category on columns — hidden by default */}
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 14 }} onClick={() => setShowPeriodTable(v => !v)}>
              {showPeriodTable ? '🙈 Hide' : '📊 Show'} Period × Category Table
            </button>
            {showPeriodTable && (
              <div style={{ marginTop: 12, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--t3)', fontWeight: 700 }}>{period === 'weekly' ? 'Week' : 'Month'}</th>
                      {allCatTotals.map(({ cat }, i) => (
                        <th key={cat} style={{ textAlign: 'right', padding: '6px 10px', color: PALETTE_INS[i % PALETTE_INS.length], fontWeight: 700 }}>{cat}</th>
                      ))}
                      <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--t3)', fontWeight: 700 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthData.map((d, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 700 }}>{d.label}</td>
                        {allCatTotals.map(({ cat }) => {
                          const v = d[cat] || 0;
                          return (
                            <td key={cat} style={{ textAlign: 'right', padding: '7px 10px', color: v === 0 ? 'var(--t3)' : 'var(--text)' }}>
                              {v > 0 ? `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 800 }}>₹{d.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 800, color: 'var(--t3)' }}>TOTAL</td>
                      {allCatTotals.map(({ cat, total }) => (
                        <td key={cat} style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 800 }}>₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      ))}
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 800 }}>
                        ₹{monthData.reduce((s, d) => s + d.total, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Expenses Page ────────────────────────────────────
export default function ExpensesPage() {
  const now = new Date();
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0,10));
  const [sortOrder, setSortOrder] = useState('desc');
  const [sortField, setSortField] = useState('date');
  const [tab, setTab] = useState('list');
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);
  const [showFixed, setShowFixed] = useState(true);
  const [collapsedDates, setCollapsedDates] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exp, c] = await Promise.all([expenseService.getAll({ dateFrom, dateTo, category: catFilter || undefined, search: search || undefined }), categoryService.getAll('expense')]);
      setItems(exp); setCats(c); setSelected(new Set());
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, catFilter, search]);

  useEffect(() => { const t = setTimeout(load, search ? 400 : 0); return () => clearTimeout(t); }, [load]);

  // Called after the MRP tab's bill scanner creates new Expense entries.
  // If any of those dates fall outside the currently-viewed date range,
  // widen the range so the new entries are actually visible on this tab
  // (widening triggers the effect above automatically); otherwise the
  // dates were already in range, so just force a manual reload.
  const handleExpensesChangedFromScan = (dates) => {
    if (!dates || dates.length === 0) return;
    let newFrom = dateFrom, newTo = dateTo;
    dates.forEach(d => { if (d < newFrom) newFrom = d; if (d > newTo) newTo = d; });
    if (newFrom !== dateFrom) setDateFrom(newFrom);
    if (newTo !== dateTo) setDateTo(newTo);
    if (newFrom === dateFrom && newTo === dateTo) load();
  };

  const save = async data => {
    try {
      const nowISO = new Date().toISOString();
      if (edit) {
        await expenseService.update(edit.id, {
          ...data,
          updatedAt: nowISO,
          lastEvent: 'update',
        });
        toast.success('Updated!');
      } else {
        await expenseService.create({
          ...data,
          createdAt: nowISO,
          updatedAt: nowISO,
          lastEvent: 'insert',
        });
        toast.success('Expense added!');
      }
      setModal(false); setEdit(null); load();
    } catch { toast.error('Failed to save'); }
  };

  const del = async () => { try { await expenseService.delete(delId); toast.success('Deleted'); setDelId(null); load(); } catch { toast.error('Failed'); } };

  const parseDate = (raw) => {
    if (!raw) return today();
    if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) { const [d, m, y] = raw.split('-'); return `${y}-${m}-${d}`; }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) { const [d, m, y] = raw.split('/'); return `${y}-${m}-${d}`; }
    return raw;
  };

  const handleCSVImport = async e => {
    const file = e.target.files[0]; if (!file) return;
    setImporting(true); setImportProgress({ current: 0, total: 0 });
    try {
      const rows = await importCSV(file);
      const validRows = rows.filter(row => parseFloat(row.amount || row['Amount']));
      setImportProgress({ current: 0, total: validRows.length });
      let imported = 0;
      for (const row of validRows) {
        const amount = parseFloat(row.amount || row['Amount']);
        const nowISO = new Date().toISOString();
        await expenseService.create({ date: parseDate(row.date || row['Date'] || today()), category: row.category || row['Category'] || 'Grocery', itemName: row.item || row['Item'] || row.itemName || 'Imported', amount, notes: row.notes || row['Notes'] || '', createdAt: nowISO, updatedAt: nowISO, lastEvent: 'insert' });
        imported++; setImportProgress({ current: imported, total: validRows.length });
      }
      toast.success(`Imported ${imported} expenses!`); load();
    } catch (err) { console.error(err); toast.error('Import failed. Check CSV format.'); }
    finally { setImporting(false); setImportProgress({ current: 0, total: 0 }); e.target.value = ''; }
  };

  // ─── Checkbox selection ────────────────────────────────
  const toggleSelect = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(selected.size === sortedItems.length ? new Set() : new Set(sortedItems.map(i => i.id)));
  const bulkDelete = async () => {
    setBulkDeleting(true);
    try {
      for (const id of selected) await expenseService.delete(id);
      toast.success(`Deleted ${selected.size} records!`);
      setSelected(new Set()); setConfirmBulkDel(false); load();
    } catch { toast.error('Failed'); }
    finally { setBulkDeleting(false); }
  };

  const [migrating, setMigrating] = useState(false);
  const [migrateDone, setMigrateDone] = useState(true); // hidden by default

  // One-time migration: copy itemName → notes for all records across ALL months
  const migrateItemToNotes = async () => {
    if (!window.confirm('This will copy Item Name → Notes for ALL your expense records (all months). Continue?')) return;
    setMigrating(true);
    try {
      // Load ALL expenses (no month filter) by calling Firestore directly
      const { collection, query, where, getDocs, doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../utils/firebase');
      const { auth } = await import('../utils/firebase');
      const uid = auth.currentUser?.uid;
      if (!uid) { toast.error('Not logged in'); return; }
      const q = query(collection(db, 'expenses'), where('userId', '==', uid));
      const snap = await getDocs(q);
      let updated = 0;
      for (const d of snap.docs) {
        const data = d.data();
        if (data.itemName && data.itemName.trim()) {
          await updateDoc(doc(db, 'expenses', d.id), { notes: data.itemName.trim(), itemName: '' });
          updated++;
        }
      }
      toast.success(`Migrated ${updated} records — Item Name → Notes`);
      setMigrateDone(true);
      load();
    } catch (e) { console.error(e); toast.error('Migration failed'); }
    finally { setMigrating(false); }
  };

  // Fixed category detection
  const ALWAYS_FIXED = new Set(['house rent','house rent / advance','rd','rd amount','gold investment']);
  const fixedCatNames = new Set([
    ...cats.filter(c => c.isFixed).map(c => c.name.toLowerCase()),
    ...ALWAYS_FIXED
  ]);
  const isFixedCat = (name) => fixedCatNames.has((name || '').toLowerCase());

  // Apply global toggle
  const filteredByToggle = showFixed ? items : items.filter(i => !isFixedCat(i.category));

  const sortedItems = [...filteredByToggle].sort((a, b) => {
    let valA, valB;
    if (sortField === 'amount')    { valA = +a.amount; valB = +b.amount; }
    else if (sortField === 'updatedAt') { valA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0; valB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0; }
    else                           { valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); }
    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  const totalAll = items.reduce((s, i) => s + +i.amount, 0);
  const total = filteredByToggle.reduce((s, i) => s + +i.amount, 0);
  const favCats = cats.filter(c => c.isFavorite);
  const otherCats = cats.filter(c => !c.isFavorite);

  const SortBtn = ({ field, label }) => (
    <button className="btn-ghost" style={{ fontSize: 12, fontWeight: 700, color: sortField === field ? 'var(--blue)' : 'var(--t3)', padding: '2px 6px' }}
      onClick={() => { if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); else { setSortField(field); setSortOrder('desc'); } }}>
      {label} {sortField === field ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
    </button>
  );

  return (
    <div>
      {/* Import Overlay */}
      {importing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 16, padding: '32px 40px', textAlign: 'center', minWidth: 280 }}>
            <div className="spin spin-lg" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Importing CSV...</div>
            <div className="text-muted fs-13">{importProgress.total > 0 ? `${importProgress.current} of ${importProgress.total} records` : 'Reading file...'}</div>
            {importProgress.total > 0 && <div style={{ marginTop: 12, background: 'var(--bg3)', borderRadius: 8, height: 8, overflow: 'hidden' }}><div style={{ height: '100%', background: 'var(--green)', borderRadius: 8, width: `${(importProgress.current / importProgress.total) * 100}%`, transition: 'width .3s' }} /></div>}
          </div>
        </div>
      )}

      <div className="page-head">
        <div><div className="page-title">💸 Expenses</div><div className="page-sub">{filteredByToggle.length} records • Total: <span className="amt amt-r">{fmt(total)}</span>{!showFixed && <span style={{marginLeft:8,fontSize:11,color:'var(--orange)',fontWeight:700}}>(Variable only)</span>}</div></div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
            {importing ? <><span className="spin" /> Importing...</> : '⬆️ Import CSV'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} disabled={importing} />
          </label>
          <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(items.map(i => ({ date: fmtDate(i.date), category: i.category, paidVia: i.paidVia || '', amount: i.amount, notes: i.notes || '' })), 'expenses.csv')}>⬇️ Export</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>+ Add</button>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
      </div>

      {/* One-time migration banner */}
      {!migrateDone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16 }}>🔄</span>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--t2)' }}>
            <strong>One-time migration:</strong> Copy all existing <em>Item Name</em> data into <em>Notes</em> field across all records.
          </div>
          <button className="btn btn-sm" onClick={migrateItemToNotes} disabled={migrating}
            style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {migrating ? <><span className="spin" style={{ width: 11, height: 11, borderWidth: 2 }} /> Migrating...</> : '▶ Run Migration'}
          </button>
          <button onClick={() => setMigrateDone(true)} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {[
          { key: 'list',      label: '📋 List' },
          { key: 'recurring', label: '🔄 Recurring' },
          { key: 'daily',     label: '📅 Daily' },
          { key: 'insights',  label: '💡 Insights' },
          { key: 'paidvia',   label: '💳 Paid Via' },
          { key: 'mrpprices', label: '🏷️ MRP Prices' },
          { key: 'paytm',     label: '🅿️ Statement Import' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 14px', borderRadius: '8px 8px 0 0', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === t.key ? 'var(--bg3)' : 'transparent', color: tab === t.key ? 'var(--text)' : 'var(--t3)', borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Global Fixed/Variable Toggle Bar ─── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:12, padding:'10px 16px', marginBottom:14, flexWrap:'wrap' }}>
        <span style={{ fontSize:16 }}>🎛️</span>
        <span className="fw-700 fs-13">Expense View:</span>
        <div className="flex gap-2">
          <button onClick={() => setShowFixed(true)}
            style={{ padding:'5px 14px', borderRadius:20, border:`2px solid ${showFixed ? 'var(--blue)' : 'var(--border2)'}`, background: showFixed ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: showFixed ? 'var(--blue)' : 'var(--t3)', fontWeight:700, fontSize:12, cursor:'pointer' }}>
            📊 All Expenses
          </button>
          <button onClick={() => setShowFixed(false)}
            style={{ padding:'5px 14px', borderRadius:20, border:`2px solid ${!showFixed ? 'var(--orange)' : 'var(--border2)'}`, background: !showFixed ? 'rgba(249,115,22,.15)' : 'var(--bg3)', color: !showFixed ? 'var(--orange)' : 'var(--t3)', fontWeight:700, fontSize:12, cursor:'pointer' }}>
            🔀 Variable Only
          </button>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:12, fontSize:12, flexWrap:'wrap' }}>
          <span style={{ color:'var(--orange)', fontWeight:700 }}>📌 Fixed: <span style={{ color:'var(--text)' }}>{fmt(items.filter(i => isFixedCat(i.category)).reduce((s,i)=>s+ +i.amount,0))}</span></span>
          <span style={{ color:'var(--blue)', fontWeight:700 }}>🔀 Variable: <span style={{ color:'var(--text)' }}>{fmt(items.filter(i => !isFixedCat(i.category)).reduce((s,i)=>s+ +i.amount,0))}</span></span>
        </div>
      </div>

      {/* Filters — show only on list tab */}
      {tab === 'list' && (
        <>
          <div className="filters">
            <div className="search" style={{ flex: 1 }}>
              <span className="si">🔍</span>
              <input placeholder="Search items or notes..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="btn-ghost">✕</button>}
            </div>
            <select className="fs btn-sm" value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ minWidth: 160 }}>
              <option value="">All Categories</option>
              {favCats.length > 0 && <optgroup label="⭐ Favourites">{favCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</optgroup>}
              {otherCats.length > 0 && <optgroup label="All Categories">{otherCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</optgroup>}
            </select>
          </div>

          {/* Sort + Bulk delete bar */}
          <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
            <span className="fw-600 fs-12 text-muted">Sort:</span>
            <SortBtn field="date" label="Date" />
            <SortBtn field="amount" label="Amount" />
            <SortBtn field="updatedAt" label="Updated" />
            {selected.size > 0 && (
              <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
                <span className="fs-12 fw-700" style={{ color: 'var(--blue)' }}>{selected.size} selected</span>
                <button className="btn btn-danger btn-sm" onClick={() => setConfirmBulkDel(true)} disabled={bulkDeleting}>
                  {bulkDeleting ? <span className="spin" /> : '🗑️'} Delete Selected
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
              </div>
            )}
          </div>

          {loading ? <div className="spin-center"><div className="spin spin-lg" /></div>
            : sortedItems.length === 0
              ? <div className="card"><div className="empty"><div className="empty-icon">💸</div><div className="empty-title">No expenses found</div><div className="empty-sub">Add your first expense or change filters</div></div></div>
              : (() => {
                  // Group items by date
                  const dateGroups = [];
                  const dateMap = {};
                  sortedItems.forEach(i => {
                    const dk = i.date
                      ? (i.date instanceof Date ? i.date.toISOString().slice(0, 10) : String(i.date).slice(0, 10))
                      : 'unknown';
                    if (!dateMap[dk]) { dateMap[dk] = []; dateGroups.push(dk); }
                    dateMap[dk].push(i);
                  });
                  const allDates = dateGroups;
                  const allCollapsed = allDates.every(d => collapsedDates.has(d));

                  // Duplicate detection: same date + description + amount is
                  // almost certainly the same expense entered twice (e.g.
                  // once manually, once via a Paytm/bank statement import).
                  // First occurrence (oldest by id order) is marked to keep;
                  // any later ones sharing the same fingerprint are flagged.
                  const dupFingerprint = (i) => {
                    const dk = i.date ? (i.date instanceof Date ? i.date.toISOString().slice(0, 10) : String(i.date).slice(0, 10)) : '';
                    return `${dk}__${(i.itemName || '').trim().toLowerCase()}__${(+i.amount || 0).toFixed(2)}`;
                  };
                  const dupGroups = {};
                  sortedItems.forEach(i => { const k = dupFingerprint(i); (dupGroups[k] = dupGroups[k] || []).push(i); });
                  const dupStatus = {}; // id -> 'keep' | 'duplicate'
                  Object.values(dupGroups).forEach(group => {
                    if (group.length < 2) return;
                    group.forEach((i, idx) => { dupStatus[i.id] = idx === 0 ? 'keep' : 'duplicate'; });
                  });
                  const toggleDate = (dk) => setCollapsedDates(prev => {
                    const n = new Set(prev); n.has(dk) ? n.delete(dk) : n.add(dk); return n;
                  });
                  const expandAll = () => setCollapsedDates(new Set());
                  const collapseAll = () => setCollapsedDates(new Set(allDates));
                  return (
                    <>
                      {/* Expand / Collapse All */}
                      <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'flex-start' }}>
                        <button className="btn-ghost" style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', padding: '3px 10px', border: '1px solid var(--border2)', borderRadius: 8 }}
                          onClick={allCollapsed ? expandAll : collapseAll}>
                          {allCollapsed ? '▶ Expand All' : '▼ Collapse All'}
                        </button>
                      </div>
                      <div className="tbl-wrap"><table className="tbl" style={{ fontSize: 14 }}>
                        <thead>
                          <tr>
                            <th style={{ width: 36 }}>
                              <input type="checkbox" checked={selected.size === sortedItems.length && sortedItems.length > 0} onChange={toggleAll}
                                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--blue)' }} />
                            </th>
                            <th style={{ fontSize: 14 }}><div className="flex items-center gap-1">Date <SortBtn field="date" label="" /></div></th>
                            <th style={{ fontSize: 14 }}>Category</th>
                            <th style={{ textAlign: 'right', fontSize: 14 }}><div className="flex items-center gap-1" style={{ justifyContent: 'flex-end' }}>Amount <SortBtn field="amount" label="" /></div></th>
                            <th style={{ fontSize: 14 }}>Paid Via</th>
                            <th style={{ fontSize: 14 }}>Notes</th>
                            <th style={{ fontSize: 14 }}><div className="flex items-center gap-1">Updated (IST) <SortBtn field="updatedAt" label="" /></div></th>
                            <th style={{ textAlign: 'center', fontSize: 14 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allDates.map(dk => {
                            const rows = dateMap[dk];
                            const dayTotal = rows.reduce((s, r) => s + +r.amount, 0);
                            const isCollapsed = collapsedDates.has(dk);
                            return (
                              <>
                                {/* Date group header row */}
                                <tr key={`grp-${dk}`}
                                  onClick={() => toggleDate(dk)}
                                  style={{ cursor: 'pointer', background: 'var(--bg2)', userSelect: 'none' }}>
                                  <td colSpan={1} style={{ padding: '8px 10px' }}>
                                    <span style={{ fontSize: 13, color: 'var(--t3)', fontWeight: 700 }}>{isCollapsed ? '▶' : '▼'}</span>
                                  </td>
                                  <td colSpan={2} style={{ padding: '8px 10px' }}>
                                    <div className="flex items-center gap-2">
                                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--blue)', fontFamily: 'monospace' }}>{fmtDate(dk)}</span>
                                      <span style={{ fontSize: 11, color: 'var(--t3)', background: 'var(--bg3)', borderRadius: 10, padding: '1px 8px', fontWeight: 700 }}>{rows.length} item{rows.length > 1 ? 's' : ''}</span>
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '8px 14px' }}>
                                    <span className="amt amt-r fw-800" style={{ fontSize: 14 }}>{fmt(dayTotal)}</span>
                                  </td>
                                  <td colSpan={4} />
                                </tr>
                                {/* Expense rows for this date */}
                                {!isCollapsed && rows.map(i => {
                                  const dup = dupStatus[i.id]; // 'keep' | 'duplicate' | undefined
                                  const rowBg = selected.has(i.id) ? 'rgba(77,158,255,.07)'
                                    : dup === 'keep' ? 'rgba(34,197,94,.08)'
                                    : dup === 'duplicate' ? 'rgba(244,63,94,.1)'
                                    : 'transparent';
                                  return (
                                  <tr key={i.id} style={{ background: rowBg }}>
                                    <td>
                                      <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSelect(i.id)}
                                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--blue)' }} />
                                    </td>
                                    <td style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--t3)', fontWeight: 500, paddingLeft: 24 }}>—</td>
                                    <td><div className="flex items-center gap-1"><span className="badge badge-r" style={{ fontSize: 13, padding: '4px 12px' }}>{i.category}</span>{isFixedCat(i.category) && <span title="Fixed expense" style={{ fontSize: 10, background: 'rgba(249,115,22,.15)', color: 'var(--orange)', borderRadius: 20, padding: '1px 6px', fontWeight: 700 }}>📌</span>}{dup === 'keep' && <span title="Kept — an identical entry (same date, description & amount) exists elsewhere" style={{ fontSize: 10, background: 'rgba(34,197,94,.15)', color: 'var(--green)', borderRadius: 20, padding: '1px 6px', fontWeight: 700 }}>✅ Kept</span>}{dup === 'duplicate' && <span title="Possible duplicate — same date, description & amount as another entry" style={{ fontSize: 10, background: 'rgba(244,63,94,.15)', color: 'var(--red)', borderRadius: 20, padding: '1px 6px', fontWeight: 700 }}>⚠️ Duplicate</span>}</div></td>
                                    <td style={{ textAlign: 'right' }}><span className="amt amt-r" style={{ fontSize: 15, fontWeight: 800 }}>{fmt(i.amount)}</span></td>
                                    <td><span style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 13, fontWeight: 700, color: 'var(--blue)', whiteSpace: 'nowrap' }}>{i.paidVia || '—'}</span></td>
                                    <td style={{ fontSize: 14 }}>
                                      {i.notes
                                        ? <NoteCell note={i.notes} />
                                        : <span style={{ color: 'var(--t3)', fontSize: 14 }}>—</span>}
                                    </td>
                                    <td style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                                      {i.updatedAt ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                          <span style={{
                                            fontSize: 9, fontWeight: 800, borderRadius: 4, padding: '1px 5px', width: 'fit-content',
                                            background: i.lastEvent === 'update' ? 'rgba(77,158,255,.15)' : 'rgba(34,197,94,.15)',
                                            color: i.lastEvent === 'update' ? 'var(--blue)' : 'var(--green)',
                                          }}>
                                            {i.lastEvent === 'update' ? '✏️ updated' : '➕ inserted'}
                                          </span>
                                          <span>{fmtIST(i.updatedAt)}</span>
                                        </div>
                                      ) : '—'}
                                    </td>
                                    <td>
                                      <div className="actions" style={{ justifyContent: 'center' }}>
                                        <button className="btn-icon" onClick={() => { setEdit(i); setModal(true); }}>✏️</button>
                                        <button className="btn-icon" onClick={() => setDelId(i.id)}>🗑️</button>
                                      </div>
                                    </td>
                                  </tr>
                                  );
                                })}
                              </>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td /><td colSpan={2} className="text-muted" style={{ padding: '11px 14px', fontSize: 14 }}>TOTAL ({sortedItems.length} records){selected.size > 0 && ` • ${selected.size} selected`}</td>
                            <td style={{ textAlign: 'right', padding: '11px 14px' }}><span className="amt amt-r fw-800" style={{ fontSize: 15 }}>{fmt(total)}</span></td>
                            <td colSpan={4} />
                          </tr>
                        </tfoot>
                      </table></div>
                    </>
                  );
                })()}
        </>
      )}

      {tab === 'recurring' && <RecurringTab cats={cats} showFixed={showFixed} isFixedCat={isFixedCat} onPaymentRecorded={load} />}
      {tab === 'daily'     && <DailySpendingTab items={filteredByToggle} showFixed={showFixed} />}
      {tab === 'insights'  && <InsightsTab showFixed={showFixed} isFixedCat={isFixedCat} />}
      {tab === 'paidvia'   && <PaidViaTab items={filteredByToggle} showFixed={showFixed} isFixedCat={isFixedCat} />}
      {tab === 'mrpprices' && <MrpPricesTab onExpensesChanged={handleExpensesChangedFromScan} />}
      {tab === 'paytm'     && <PaytmTab cats={cats} onExpensesChanged={handleExpensesChangedFromScan} />}

      {modal && <Modal title={edit ? '✏️ Edit Expense' : '➕ Add Expense'} onClose={() => { setModal(false); setEdit(null); }}><ExpForm item={edit} cats={cats} onSave={save} onClose={() => { setModal(false); setEdit(null); }} /></Modal>}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}

      {/* Bulk Delete Confirm */}
      {confirmBulkDel && (
        <div className="overlay" onClick={() => setConfirmBulkDel(false)}>
          <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🗑️</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Delete {selected.size} records?</div>
            <div className="text-muted fs-13 mb-5">This cannot be undone.</div>
            <div className="flex gap-3" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmBulkDel(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={bulkDelete} disabled={bulkDeleting}>{bulkDeleting ? <span className="spin" /> : null} Delete {selected.size} records</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}