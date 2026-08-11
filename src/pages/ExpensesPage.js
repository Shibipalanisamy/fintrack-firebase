import { useState, useEffect, useCallback, useRef } from 'react';
import { db, auth } from '../utils/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { expenseService, categoryService, recurringService, groupService } from '../utils/dbService';
import { fmt, fmtDate, fmtDateInput, today, exportCSV, importCSV } from '../utils/helpers';
import { Modal, ConfirmDelete, MonthYearFilter, DateStepper, DateRangeFilter } from '../components/UI';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend, CartesianGrid, LineChart, Line, ReferenceLine } from 'recharts';
import { PALETTE } from '../utils/helpers';
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
function PercentageTab({ items, showFixed, isFixedCat, allItems, cats = [], onBudgetSave }) {
  const total = items.reduce((s, i) => s + +i.amount, 0);
  const catMap = {};
  items.forEach(i => { catMap[i.category] = (catMap[i.category] || 0) + +i.amount; });
  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  // Budget state — stored in Firestore on the category document (budget field)
  const [editBudget, setEditBudget] = useState(null); // category name being edited
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  // Build budgets map from cats prop: { categoryName: amount }
  const budgets = {};
  cats.forEach(c => { if (c.budget > 0) budgets[c.name] = c.budget; });

  const saveBudget = async (cat, val) => {
    const catObj = cats.find(c => c.name === cat);
    if (!catObj) return;
    setSavingBudget(true);
    try {
      const budgetVal = parseFloat(val) || 0;
      await onBudgetSave(catObj.id, { budget: budgetVal > 0 ? budgetVal : 0 });
    } finally {
      setSavingBudget(false);
      setEditBudget(null);
    }
  };
  const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
  const budgetedCats = Object.keys(budgets).filter(k => budgets[k] > 0);
  const pieData = sorted.slice(0, 10).map(([name, value], idx) => ({ name, value, color: PALETTE[idx % PALETTE.length] }));

  // Category sub-tab: 'all' | 'variable' | 'fixed'
  const [catTab, setCatTab] = useState('all');
  const sortedVariable = sorted.filter(([cat]) => !isFixedCat(cat));
  const sortedFixed    = sorted.filter(([cat]) =>  isFixedCat(cat));
  const catTabRows     = catTab === 'variable' ? sortedVariable : catTab === 'fixed' ? sortedFixed : sorted;
  const catTabTotal    = catTabRows.reduce((s, [, amt]) => s + amt, 0);

  const varItems  = allItems ? allItems.filter(i => !isFixedCat(i.category)) : items;
  const fixItems  = allItems ? allItems.filter(i => isFixedCat(i.category)) : [];
  const varTotal  = varItems.reduce((s,i) => s + +i.amount, 0);
  const fixTotal  = fixItems.reduce((s,i) => s + +i.amount, 0);
  const grandTotal = (allItems || items).reduce((s,i) => s + +i.amount, 0);

  const buildPie = (list) => {
    const m = {}; list.forEach(i => { m[i.category] = (m[i.category]||0) + +i.amount; });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,value],idx)=>({ name, value, color: PALETTE[idx%PALETTE.length] }));
  };
  const varPie = buildPie(varItems);
  const fixPie = buildPie(fixItems);

  if (items.length === 0) return <div className="card"><div className="empty"><div className="empty-icon">📊</div><div className="empty-title">No data</div><div className="empty-sub">{showFixed ? 'Add expenses to see breakdown' : 'No variable expenses found'}</div></div></div>;

  const PieCard = ({ title, data, chartTotal, color }) => (
    <div className="card" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div className="card-title">{title}</div>
      <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <ResponsiveContainer width={150} height={150}>
          <PieChart><Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>{data.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie><Tooltip formatter={(v)=>[`Rs ${fmt(v)}`,'']} /></PieChart>
        </ResponsiveContainer>
        <div style={{ flex:1 }}>
          {data.map((d,i)=>(
            <div key={i} className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2 fs-12"><span style={{ width:8,height:8,borderRadius:'50%',background:d.color,flexShrink:0 }}/><span className="text-muted">{d.name}</span></div>
              <span className="fw-700 fs-12" style={{ color:d.color }}>{chartTotal > 0 ? ((d.value/chartTotal)*100).toFixed(1) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Split summary cards */}
      {allItems && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div style={{ background:'rgba(249,115,22,.06)', border:'1px solid rgba(249,115,22,.2)', borderRadius:12, padding:14 }}>
            <div className="fw-700 fs-13 mb-1" style={{ color:'var(--orange)' }}>📌 Fixed Expenses</div>
            <div className="fw-900 fs-20" style={{ color:'var(--orange)' }}>{fmt(fixTotal)}</div>
            <div className="fs-11 text-muted mt-1">{grandTotal>0?((fixTotal/grandTotal)*100).toFixed(1):0}% of total spend</div>
          </div>
          <div style={{ background:'rgba(77,158,255,.06)', border:'1px solid rgba(77,158,255,.2)', borderRadius:12, padding:14 }}>
            <div className="fw-700 fs-13 mb-1" style={{ color:'var(--blue)' }}>🔀 Variable Expenses</div>
            <div className="fw-900 fs-20" style={{ color:'var(--blue)' }}>{fmt(varTotal)}</div>
            <div className="fs-11 text-muted mt-1">{grandTotal>0?((varTotal/grandTotal)*100).toFixed(1):0}% of total spend</div>
          </div>
        </div>
      )}

      {/* Dual charts */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:16, marginBottom:16 }}>
        {varPie.length > 0 && <PieCard title="🔀 Variable Expenses" data={varPie} chartTotal={varTotal} />}
        {showFixed && fixPie.length > 0 && <PieCard title="📌 Fixed Expenses" data={fixPie} chartTotal={fixTotal} />}
      </div>

      {/* Budget summary strip */}
      {budgetedCats.length > 0 && (
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
          <div style={{ background:'rgba(77,158,255,.07)', border:'1px solid rgba(77,158,255,.2)', borderRadius:10, padding:'8px 14px', fontSize:12 }}>
            <span className="text-muted">Total Budget: </span><span className="fw-800" style={{ color:'var(--blue)' }}>{fmt(totalBudget)}</span>
          </div>
          <div style={{ background: total <= totalBudget ? 'rgba(34,197,94,.07)' : 'rgba(244,63,94,.07)', border:`1px solid ${total <= totalBudget ? 'rgba(34,197,94,.2)' : 'rgba(244,63,94,.2)'}`, borderRadius:10, padding:'8px 14px', fontSize:12 }}>
            <span className="text-muted">Spent vs Budget: </span>
            <span className="fw-800" style={{ color: total <= totalBudget ? 'var(--green)' : 'var(--red)' }}>
              {total <= totalBudget ? `✅ ${fmt(totalBudget - total)} under` : `⚠️ ${fmt(total - totalBudget)} over`}
            </span>
          </div>
        </div>
      )}

      {/* Full table with budget */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div className="card-title" style={{ marginBottom:0 }}>📊 Category-wise Breakdown</div>
          <div className="fs-11 text-muted">Click 🎯 to set budget per category</div>
        </div>

        {/* Fixed / Variable sub-tabs */}
        <div style={{ display:'flex', gap:6, marginBottom:12 }}>
          {[
            { key:'all',      label:`All (${sorted.length})`,           color:'var(--text)' },
            { key:'variable', label:`🔀 Variable (${sortedVariable.length})`, color:'var(--blue)' },
            { key:'fixed',    label:`📌 Fixed (${sortedFixed.length})`,      color:'var(--orange)' },
          ].map(t => (
            <button key={t.key} onClick={() => setCatTab(t.key)}
              style={{
                padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer', border:'1.5px solid',
                borderColor: catTab === t.key ? t.color : 'var(--border2)',
                background:  catTab === t.key ? (t.key==='variable' ? 'rgba(77,158,255,.12)' : t.key==='fixed' ? 'rgba(249,115,22,.12)' : 'var(--bg3)') : 'var(--bg3)',
                color:       catTab === t.key ? t.color : 'var(--t3)',
                transition:  'all .15s',
              }}>{t.label}</button>
          ))}
        </div>

        {catTabRows.length === 0
          ? <div style={{ padding:'24px 0', textAlign:'center', color:'var(--t3)', fontSize:13 }}>
              No {catTab === 'fixed' ? 'fixed' : 'variable'} expense categories found.
            </div>
          : <div className="tbl-wrap"><table className="tbl">
          <thead><tr>
            <th>#</th><th>Category</th>
            <th style={{ textAlign:'right' }}>Spent</th>
            <th style={{ textAlign:'right' }}>Budget</th>
            <th style={{ textAlign:'right' }}>Balance</th>
            <th style={{ textAlign:'right' }}>%</th>
            <th>Bar</th>
            <th></th>
          </tr></thead>
          <tbody>{catTabRows.map(([cat, amt], i) => {
            const pct      = catTabTotal > 0 ? ((amt / catTabTotal) * 100).toFixed(1) : '0.0';
            const totalPct = total > 0        ? ((amt / total)       * 100).toFixed(1) : '0.0';
            const budget = budgets[cat] || 0;
            const balance = budget > 0 ? budget - amt : null;
            const overBudget = balance !== null && balance < 0;
            const budgetPct = budget > 0 ? Math.min(100, (amt / budget) * 100) : parseFloat(pct);
            const isFixed = isFixedCat(cat);
            return (
              <tr key={cat} style={{ background: overBudget ? 'rgba(244,63,94,.04)' : 'transparent' }}>
                <td className="text-muted fs-12">{i + 1}</td>
                <td className="fw-600 fs-13">
                  <div className="flex items-center gap-1">
                    {cat}
                    {isFixed && catTab === 'all' && <span style={{ fontSize:9, background:'rgba(249,115,22,.15)', color:'var(--orange)', borderRadius:20, padding:'1px 6px', fontWeight:700 }}>📌</span>}
                    {overBudget && <span style={{ fontSize:10, background:'rgba(244,63,94,.15)', color:'var(--red)', borderRadius:20, padding:'1px 6px', fontWeight:700 }}>Over</span>}
                  </div>
                </td>
                <td style={{ textAlign:'right' }}><span className="amt amt-r">{fmt(amt)}</span></td>
                <td style={{ textAlign:'right' }}>
                  {editBudget === cat ? (
                    <div className="flex gap-1" style={{ justifyContent:'flex-end' }}>
                      <input autoFocus type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)}
                        onKeyDown={e => { if(e.key==='Enter') saveBudget(cat, budgetInput); if(e.key==='Escape') setEditBudget(null); }}
                        style={{ width:80, padding:'3px 6px', borderRadius:6, border:'1.5px solid var(--blue)', background:'var(--bg3)', color:'var(--text)', fontSize:12, outline:'none' }}
                        placeholder="0" min="0" />
                      <button onClick={() => saveBudget(cat, budgetInput)} disabled={savingBudget} style={{ background:'var(--green)', border:'none', borderRadius:5, padding:'3px 7px', color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>{savingBudget ? '…' : '✓'}</button>
                      <button onClick={() => setEditBudget(null)} style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:5, padding:'3px 7px', cursor:'pointer', fontSize:11, color:'var(--t3)' }}>✕</button>
                    </div>
                  ) : (
                    <span className={`fw-600 fs-12 ${budget>0?'':'text-muted'}`} style={{ color: budget>0?'var(--blue)':undefined }}>
                      {budget > 0 ? fmt(budget) : '—'}
                    </span>
                  )}
                </td>
                <td style={{ textAlign:'right' }}>
                  {balance !== null
                    ? <span className={`fw-700 fs-12 ${balance >= 0 ? 'amt-g' : 'amt-r'}`}>{balance >= 0 ? '+' : ''}{fmt(balance)}</span>
                    : <span className="text-muted fs-12">—</span>}
                </td>
                <td style={{ textAlign:'right' }}>
                  <span className="fw-700" style={{ color: PALETTE[i % PALETTE.length] }}>{pct}%</span>
                  {catTab !== 'all' && <div className="fs-10 text-muted">{totalPct}% of all</div>}
                </td>
                <td style={{ width:110 }}>
                  <div style={{ background:'var(--bg3)', borderRadius:4, height:6, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${budgetPct}%`, background: overBudget ? 'var(--red)' : PALETTE[i % PALETTE.length], borderRadius:4, transition:'width .4s' }} />
                  </div>
                  {budget > 0 && <div className="fs-10 text-muted mt-1">{(amt/budget*100).toFixed(0)}% of budget</div>}
                </td>
                <td>
                  <button title="Set budget" onClick={() => { setEditBudget(cat); setBudgetInput(budget > 0 ? String(budget) : ''); }}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--t3)', padding:'2px 4px' }}>🎯</button>
                </td>
              </tr>
            );
          })}</tbody>
          <tfoot><tr>
            <td colSpan={2} className="text-muted fs-12" style={{ padding:'10px 14px' }}>
              {catTab === 'all' ? 'TOTAL' : catTab === 'fixed' ? '📌 FIXED TOTAL' : '🔀 VARIABLE TOTAL'}
            </td>
            <td style={{ textAlign:'right', padding:'10px 14px' }}><span className="amt amt-r fw-800">{fmt(catTabTotal)}</span></td>
            <td style={{ textAlign:'right', padding:'10px 14px' }}><span className="fw-700" style={{ color:'var(--blue)' }}>{totalBudget > 0 ? fmt(totalBudget) : '—'}</span></td>
            <td style={{ textAlign:'right', padding:'10px 14px' }}>
              {totalBudget > 0 && <span className={`fw-800 ${catTabTotal <= totalBudget ? 'amt-g' : 'amt-r'}`}>{catTabTotal <= totalBudget ? '+' : ''}{fmt(totalBudget - catTabTotal)}</span>}
            </td>
            <td style={{ textAlign:'right', padding:'10px 14px' }}><span className="fw-800">100%</span></td>
            <td colSpan={2} />
          </tr></tfoot>
        </table></div>}
      </div>
    </div>
  );
}

// ─── Group Summary Tab ─────────────────────────────────────
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
function GroupSummaryTab({ items, showFixed, cats }) {
  const [groups, setGroups]         = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [expanded, setExpanded]     = useState({});
  const [othersExpanded, setOthersExpanded] = useState(false);
  const [groupModal, setGroupModal] = useState(false);   // false | 'add' | groupObj
  const [deleteGroup, setDeleteGroup] = useState(null);  // groupObj to confirm delete
  const [deleting, setDeleting]     = useState(false);
  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      let g = await groupService.getAll();
      if (g.length === 0) {
        await groupService.seedDefaults(auth.currentUser?.uid);
        g = await groupService.getAll();
      }
      setGroups(g);
    } catch { toast.error('Failed to load groups'); }
    finally { setLoadingGroups(false); }
  };

  useEffect(() => { loadGroups(); }, []);

  const total = items.reduce((s, i) => s + +i.amount, 0);

  const getGroupItems = (g) => items.filter(i => g.categories.some(c => c.toLowerCase() === i.category?.toLowerCase()));
  const getGroupTotal = (g) => getGroupItems(g).reduce((s, i) => s + +i.amount, 0);

  const ungroupedItems = items.filter(i => !groups.some(g => g.categories.some(c => c.toLowerCase() === i.category?.toLowerCase())));
  const ungroupedTotal = ungroupedItems.reduce((s, i) => s + +i.amount, 0);

  const saveGroup = async (data) => {
    try {
      if (groupModal === 'add') {
        await groupService.create({ ...data, order: groups.length });
      } else {
        await groupService.update(groupModal.id, data);
      }
      toast.success(groupModal === 'add' ? 'Group created!' : 'Group updated!');
      setGroupModal(false);
      loadGroups();
    } catch { toast.error('Failed to save group'); }
  };

  const confirmDelete = async () => {
    if (!deleteGroup) return;
    setDeleting(true);
    try {
      await groupService.delete(deleteGroup.id);
      toast.success('Group deleted');
      setDeleteGroup(null);
      loadGroups();
    } catch { toast.error('Failed to delete'); }
    finally { setDeleting(false); }
  };

  if (loadingGroups) return <div className="spin-center"><div className="spin spin-lg" /></div>;
  if (items.length === 0) return <div className="card"><div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No data</div><div className="empty-sub">{showFixed ? 'Add expenses to see group summary' : 'No variable expenses found'}</div></div></div>;

  return (
    <div>
      {/* Header row with Add Group button */}
      <div className="flex items-center justify-between mb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="fw-700 fs-14" style={{ color: 'var(--text)' }}>🗂️ Expense Groups</div>
        <button className="btn btn-primary btn-sm" onClick={() => setGroupModal('add')}>+ Add Group</button>
      </div>

      {!showFixed && (
        <div style={{ background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'var(--orange)', fontWeight:700 }}>
          🔀 Variable expenses only — Fixed expenses excluded
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        {groups.map(g => {
          const amt = getGroupTotal(g);
          const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : 0;
          
          return (
            <div key={g.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, borderLeft: `4px solid ${g.color}`, position: 'relative' }}>
              {/* Edit / Delete buttons */}
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                <button onClick={e => { e.stopPropagation(); setGroupModal(g); }}
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, padding: '2px 6px', fontSize: 11, cursor: 'pointer', color: 'var(--t3)' }} title="Edit group">✏️</button>
                <button onClick={e => { e.stopPropagation(); setDeleteGroup(g); }}
                  style={{ background: 'rgba(244,63,94,.08)', border: '1px solid rgba(244,63,94,.2)', borderRadius: 6, padding: '2px 6px', fontSize: 11, cursor: 'pointer', color: 'var(--red)' }} title="Delete group">🗑️</button>
              </div>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{g.icon}</div>
              <div className="fs-12 fw-700 text-muted mb-1" style={{ paddingRight: 48 }}>{g.label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: g.color }}>{fmt(amt)}</div>
              <div className="fs-11 text-muted mt-1">{pct}% of total</div>
              <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 4, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: g.color, borderRadius: 4 }} />
              </div>
              <div className="fs-10 text-muted mt-1">{g.categories.length} categories</div>
            </div>
          );
        })}
        {ungroupedTotal > 0 && (
          <div onClick={() => setOthersExpanded(p => !p)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, borderLeft: '4px solid #94a3b8', cursor: 'pointer' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>📦</div>
            <div className="fs-12 fw-700 text-muted mb-1">Others</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#94a3b8' }}>{fmt(ungroupedTotal)}</div>
            <div className="fs-11 text-muted mt-1">{total > 0 ? ((ungroupedTotal / total) * 100).toFixed(1) : 0}% of total</div>
            <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>{othersExpanded ? '▲ Collapse' : '▼ Expand'}</div>
          </div>
        )}
      </div>

      {/* Detailed breakdown per group */}
      {groups.map(g => {
        const groupItems = getGroupItems(g);
        const groupTotal = getGroupTotal(g);
        
        if (groupTotal === 0) return null;
        
        const catMap = {};
        groupItems.forEach(i => { catMap[i.category] = (catMap[i.category] || 0) + +i.amount; });
        
        return (
          <div key={g.id} className="card" style={{ marginBottom: 12 }}>
            <div className="flex justify-between items-center" style={{ cursor: 'pointer' }} onClick={() => setExpanded(p => ({ ...p, [g.id]: !p[g.id] }))}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 20 }}>{g.icon}</span>
                <div>
                  <div className="fw-700 fs-14">{g.label}</div>
                  <div className="fs-11 text-muted">{groupItems.length} transactions</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span style={{ fontWeight: 900, fontSize: 16, color: g.color }}>{fmt(groupTotal)}</span>
                <span className="text-muted fs-12">{total > 0 ? ((groupTotal / total) * 100).toFixed(1) : 0}%</span>
                <button onClick={e => { e.stopPropagation(); setGroupModal(g); }}
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, padding: '2px 7px', fontSize: 11, cursor: 'pointer', color: 'var(--t3)' }}>✏️</button>
                <button onClick={e => { e.stopPropagation(); setDeleteGroup(g); }}
                  style={{ background: 'rgba(244,63,94,.08)', border: '1px solid rgba(244,63,94,.2)', borderRadius: 6, padding: '2px 7px', fontSize: 11, cursor: 'pointer', color: 'var(--red)' }}>🗑️</button>
                <span className="text-muted">{expanded[g.id] ? '▲' : '▼'}</span>
              </div>
            </div>
            {expanded[g.id] && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                {Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                  <div key={cat} className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div style={{ borderRadius: 4, height: 4, width: `${Math.max(8, (amt / groupTotal) * 80)}px`, maxWidth: 80, background: g.color, opacity: 0.6 }} />
                      <span className="fs-13">{cat}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="amt fs-13">{fmt(amt)}</span>
                      <span className="text-muted fs-11">{((amt / groupTotal) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Others breakdown */}
      {ungroupedTotal > 0 && othersExpanded && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="flex justify-between items-center" style={{ cursor: 'pointer' }} onClick={() => setOthersExpanded(false)}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 20 }}>📦</span>
              <div>
                <div className="fw-700 fs-14">Others</div>
                <div className="fs-11 text-muted">{ungroupedItems.length} transactions</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span style={{ fontWeight: 900, fontSize: 16, color: '#94a3b8' }}>{fmt(ungroupedTotal)}</span>
              <span className="text-muted fs-12">{total > 0 ? ((ungroupedTotal / total) * 100).toFixed(1) : 0}%</span>
              <span className="text-muted">▲</span>
            </div>
          </div>
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            {(() => {
              const catMap = {};
              ungroupedItems.forEach(i => { catMap[i.category || 'Uncategorised'] = (catMap[i.category || 'Uncategorised'] || 0) + +i.amount; });
              return Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                <div key={cat} className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <div style={{ borderRadius: 4, height: 4, width: `${Math.max(8, (amt / ungroupedTotal) * 80)}px`, maxWidth: 80, background: '#94a3b8', opacity: 0.6 }} />
                    <span className="fs-13">{cat}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="amt fs-13">{fmt(amt)}</span>
                    <span className="text-muted fs-11">{((amt / ungroupedTotal) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Add / Edit Group Modal */}
      {groupModal && (
        <Modal
          title={groupModal === 'add' ? '➕ Add Group' : `✏️ Edit — ${groupModal.label}`}
          onClose={() => setGroupModal(false)}>
          <GroupForm
            group={groupModal === 'add' ? null : groupModal}
            allCats={cats}
            onSave={saveGroup}
            onClose={() => setGroupModal(false)} />
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteGroup && (
        <div className="overlay" onClick={() => setDeleteGroup(null)}>
          <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🗑️</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Delete "{deleteGroup.label}"?</div>
            <div className="text-muted fs-13 mb-5">This removes the group definition only. Your expense records are not affected.</div>
            <div className="flex gap-3" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteGroup(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? <span className="spin" /> : null} Delete Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
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

const BLANK_REC = { name: '', category: '', amount: '', frequency: 'monthly', nextDue: today(), paidVia: '', notes: '', isActive: true, autoRenew: false, matureDate: '', matureAmount: '', expectedSpendingAmount: '', expectedSpendingDate: '', type: 'general', interestRate: '', rdStartDate: today() };

function RecurringTab({ cats, showFixed, isFixedCat, onPaymentRecorded }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(false);
  const [edit, setEdit]     = useState(null);
  const [delId, setDelId]   = useState(null);
  const [form, setForm]     = useState(BLANK_REC);
  const [adding, setAdding] = useState(false);
  const [rdSummaryOpen, setRdSummaryOpen] = useState(true);

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
      const data = await recurringService.getAll();
      setItems(data);
      await autoRenewOverdue(data);
    }
    catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  // Auto-advance any item with "Auto-renew" enabled whose due date has passed —
  // records the payment and rolls nextDue forward without needing a manual "Pay" click.
  // Catches up multiple missed cycles if the app wasn't opened for a while.
  const autoRenewOverdue = async (list) => {
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
    </div>
  );
}

// ─── Category Detail Tab ───────────────────────────────────
function CategoryDetailTab({ cats }) {
  const now = new Date();
  const [selCat, setSelCat]       = useState('');
  const [selYear, setSelYear]     = useState(now.getFullYear());
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir]     = useState('desc');
  const [search, setSearch]       = useState('');
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  useEffect(() => {
    if (!selCat) return;
    setLoading(true);
    expenseService.getAll({ year: selYear, category: selCat })
      .then(data => setRecords(data))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, [selCat, selYear]);

  const sorted = [...records]
    .filter(r => !search || (r.notes||'').toLowerCase().includes(search.toLowerCase()) || (r.paidVia||'').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const va = sortField==='amount' ? +a.amount : new Date(a.date).getTime();
      const vb = sortField==='amount' ? +b.amount : new Date(b.date).getTime();
      return sortDir==='asc' ? va-vb : vb-va;
    });

  const total = sorted.reduce((s,r) => s + +r.amount, 0);
  const avgAmt = sorted.length > 0 ? total / sorted.length : 0;
  const monthMap = {};
  sorted.forEach(r => { const m = new Date(r.date).getMonth(); monthMap[m] = (monthMap[m]||0) + +r.amount; });

  const SH = ({ field, label }) => (
    <span onClick={() => { if(sortField===field) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortField(field); setSortDir('desc'); } }}
      style={{ cursor:'pointer', userSelect:'none' }}>
      {label} {sortField===field ? (sortDir==='asc'?'↑':'↓') : <span style={{color:'var(--t3)',fontSize:10}}>↕</span>}
    </span>
  );

  return (
    <div>
      {/* Controls */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:16 }}>
        <select className="fs" value={selCat} onChange={e => setSelCat(e.target.value)} style={{ minWidth:200 }}>
          <option value="">— Choose a Category —</option>
          {cats.filter(c=>c.isFavorite).length > 0 && (
            <optgroup label="⭐ Favourites">
              {cats.filter(c=>c.isFavorite).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </optgroup>
          )}
          <optgroup label="All Categories">
            {cats.filter(c=>!c.isFavorite).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </optgroup>
        </select>
        <select className="fs btn-sm" value={selYear} onChange={e => setSelYear(+e.target.value)}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <label className="flex items-center gap-2 fs-13" style={{ cursor:'pointer', userSelect:'none' }}>
          <input type="checkbox" checked={showNotes} onChange={e => setShowNotes(e.target.checked)} style={{ accentColor:'var(--blue)' }} />
          Show Notes column
        </label>
      </div>

      {!selCat ? (
        <div className="card"><div className="empty"><div className="empty-icon">🔎</div><div className="empty-title">Choose a category</div><div className="empty-sub">Select a category and year to see all records</div></div></div>
      ) : loading ? (
        <div className="spin-center"><div className="spin spin-lg" /></div>
      ) : (
        <>
          {/* Summary stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10, marginBottom:14 }}>
            {[
              { icon:'📋', label:'Total Records',  val: records.length,               c:'var(--blue)' },
              { icon:'💸', label:'Total Spent',     val: fmt(total),                   c:'var(--red)' },
              { icon:'📊', label:'Avg per Entry',   val: fmt(avgAmt),                  c:'var(--orange)' },
              { icon:'📅', label:'Active Months',   val: Object.keys(monthMap).length, c:'var(--purple)' },
            ].map((s,i) => (
              <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', borderLeft:`3px solid ${s.c}` }}>
                <div style={{ fontSize:11, color:'var(--t3)', marginBottom:2 }}>{s.icon} {s.label}</div>
                <div style={{ fontSize:15, fontWeight:900, color:s.c }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Monthly breakdown chips */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:14 }}>
            {MONTHS_SHORT.map((m, i) => monthMap[i] ? (
              <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'5px 12px', fontSize:12 }}>
                <span className="fw-700">{m}</span> <span className="amt-r fw-700">{fmt(monthMap[i])}</span>
                <span className="text-muted" style={{ fontSize:10, marginLeft:4 }}>{records.length > 0 ? ((monthMap[i]/total)*100).toFixed(0) : 0}%</span>
              </div>
            ) : null)}
          </div>

          {/* Note / paid-via search filter */}
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:8, padding:'7px 12px', marginBottom:12 }}>
            <span style={{ fontSize:13 }}>🔍</span>
            <input style={{ background:'none', border:'none', outline:'none', color:'var(--text)', fontSize:13, flex:1 }}
              placeholder="Filter by notes or paid via..."
              value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', color:'var(--t3)', cursor:'pointer', fontSize:12 }}>✕</button>}
          </div>

          {sorted.length === 0 ? (
            <div className="card"><div className="empty"><div className="empty-icon">🔎</div><div className="empty-title">No matching records</div></div></div>
          ) : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr>
                <th><SH field="date" label="Date" /></th>
                <th style={{ textAlign:'right' }}><SH field="amount" label="Amount" /></th>
                <th>Paid Via</th>
                {showNotes && <th>Notes</th>}
              </tr></thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.id}>
                    <td className="font-mono fs-12 text-muted">{fmtDate(r.date)}</td>
                    <td style={{ textAlign:'right' }}><span className="amt amt-r fw-700">{fmt(r.amount)}</span></td>
                    <td><span style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', fontSize:12, fontWeight:700, color:'var(--blue)' }}>{r.paidVia || '—'}</span></td>
                    {showNotes && <td className="text-muted fs-12">{r.notes || '—'}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td className="text-muted fs-12" style={{ padding:'10px 14px' }}>TOTAL ({sorted.length} records)</td>
                <td style={{ textAlign:'right', padding:'10px 14px' }}><span className="amt amt-r fw-800">{fmt(total)}</span></td>
                <td colSpan={showNotes ? 2 : 1} />
              </tr></tfoot>
            </table></div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Paid Via Tab ──────────────────────────────────────────
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

const MRP_CATEGORIES = [
  { key: 'Grocery',           label: '🛒 Grocery',            color: '#4d9eff' },
  { key: 'Vegetable',         label: '🥦 Vegetable',          color: '#22c55e' },
  { key: 'Fruit',             label: '🍎 Fruit',              color: '#e879f9' },
  { key: 'House Basic Needs', label: '🏠 House Basic Needs',  color: '#f97316' },
];

const MRP_UNITS = ['KG', 'g', '500g', '250g', 'Litre', 'ml', 'Piece', 'Pack', 'Dozen'];

function mrpCategoryColor(cat) {
  return MRP_CATEGORIES.find(c => c.key === cat)?.color || '#a78bfa';
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
function MrpEntryForm({ item, onSave, onClose }) {
  const [f, setF] = useState({
    category: item?.category || MRP_CATEGORIES[0].key,
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
      <div>
        <label className="fl">Category</label>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {MRP_CATEGORIES.map(c => (
            <button key={c.key} type="button" onClick={() => setF(p => ({ ...p, category: c.key }))}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `2px solid ${f.category === c.key ? c.color : 'var(--border2)'}`,
                background: f.category === c.key ? `${c.color}20` : 'var(--bg3)',
                color: f.category === c.key ? c.color : 'var(--t3)',
              }}>
              {c.label}
            </button>
          ))}
        </div>
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

// ─── Main MRP Prices Tab ────────────────────────────────────
function MrpPricesTab() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null); // for chart drill-down

  // Checkbox bulk-select state
  const [selected, setSelected] = useState(new Set());
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // JSON import state
  const [importing, setImporting] = useState(false);
  const jsonFileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); toast.error('Not signed in'); return; }
    try {
      const snap = await getDocs(query(collection(db, 'mrpprices'), where('userId', '==', uid)));
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => new Date(b.date) - new Date(a.date));
      setEntries(rows);
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

        // Normalize category: trim whitespace, match case-insensitively against known categories
        let rawCategory = String(row.Type || row.Category || row.category || 'Grocery').trim();
        const matched = MRP_CATEGORIES.find(c => c.key.toLowerCase() === rawCategory.toLowerCase());
        const category = matched ? matched.key : rawCategory;

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
      if (imported > 0) toast.success(`Imported ${imported} of ${rows.length} price entries!`);
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

  // ─── Group by category, then by item ───
  const filtered = entries
    .filter(e => !catFilter || e.category === catFilter)
    .filter(e => !search || (e.itemName || '').toLowerCase().includes(search.toLowerCase()));

  // Per-category counts (based on category only, ignoring search) for the filter pills
  const catCounts = MRP_CATEGORIES.reduce((acc, c) => {
    acc[c.key] = entries.filter(e => e.category === c.key).length;
    return acc;
  }, {});

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
        <button className="btn btn-primary" onClick={() => { setEdit(null); setModal(true); }}>➕ Add Price</button>
      </div>

      {/* Category filter pills + search */}
      <div className="flex items-center gap-3 mb-4" style={{ flexWrap: 'wrap' }}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button onClick={() => setCatFilter('')}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `2px solid ${!catFilter ? 'var(--blue)' : 'var(--border2)'}`, background: !catFilter ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: !catFilter ? 'var(--blue)' : 'var(--t3)' }}>
            🌐 All <span style={{ opacity: .7 }}>({entries.length})</span>
          </button>
          {MRP_CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCatFilter(catFilter === c.key ? '' : c.key)}
              style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `2px solid ${catFilter === c.key ? c.color : 'var(--border2)'}`, background: catFilter === c.key ? `${c.color}20` : 'var(--bg3)', color: catFilter === c.key ? c.color : 'var(--t3)' }}>
              {c.label} <span style={{ opacity: .7 }}>({catCounts[c.key] || 0})</span>
            </button>
          ))}
        </div>
        <div className="search" style={{ flex: 1, minWidth: 180 }}>
          <input placeholder="🔍 Search item name..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} className="btn-ghost">✕</button>}
        </div>
      </div>

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

          {/* Price High-Difference Chart */}
          {diffChartData.length > 0 && (
            <div className="card mb-4">
              <div className="card-title">📊 Price Range (Min vs Max MRP) — Top Items by Difference</div>
              <ResponsiveContainer width="100%" height={Math.max(260, diffChartData.length * 38)}>
                <BarChart data={diffChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--t3)' }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: 'var(--t2)' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
                    formatter={(val, name) => [`₹${val}`, name === 'min' ? 'Min Price' : name === 'max' ? 'Max Price' : 'Difference']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="min" name="Min Price" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={14} />
                  <Bar dataKey="max" name="Max Price" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
              <div className="text-muted fs-11 mt-2">💡 Click an item row below to see its full price history chart</div>
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
          {MRP_CATEGORIES.filter(c => !catFilter || catFilter === c.key).map(cat => {
            const catEntries = filtered.filter(e => e.category === cat.key).sort((a, b) => new Date(b.date) - new Date(a.date));
            if (catEntries.length === 0) return null;
            const catIds = catEntries.map(e => e.id);
            const allCatSelected = catIds.length > 0 && catIds.every(id => selected.has(id));

            return (
              <div key={cat.key} className="card mb-4">
                <div className="card-title" style={{ color: cat.color }}>{cat.label} ({catEntries.length} entries)</div>
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

          {/* Fallback: entries whose category doesn't match any known category (e.g. typo, custom value) */}
          {(() => {
            const knownKeys = MRP_CATEGORIES.map(c => c.key);
            const otherEntries = filtered.filter(e => !knownKeys.includes(e.category)).sort((a, b) => new Date(b.date) - new Date(a.date));
            if (otherEntries.length === 0 || (catFilter && catFilter !== '')) return null;
            const otherIds = otherEntries.map(e => e.id);
            const allOtherSelected = otherIds.length > 0 && otherIds.every(id => selected.has(id));
            return (
              <div className="card mb-4">
                <div className="card-title" style={{ color: 'var(--t3)' }}>📂 Other / Uncategorized ({otherEntries.length} entries)</div>
                <div className="text-muted fs-11 mb-2">These entries have a category value that doesn't match Grocery, Vegetable, Fruit, or House Basic Needs — likely from an import. Edit them to assign a known category.</div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input type="checkbox" checked={allOtherSelected}
                            onChange={() => setSelected(p => {
                              const n = new Set(p);
                              if (allOtherSelected) otherIds.forEach(id => n.delete(id));
                              else otherIds.forEach(id => n.add(id));
                              return n;
                            })} />
                        </th>
                        <th>Item</th>
                        <th>Category (as stored)</th>
                        <th style={{ textAlign: 'right' }}>MRP</th>
                        <th>Unit</th>
                        <th>Date</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {otherEntries.map(e => (
                        <tr key={e.id} style={{ background: selected.has(e.id) ? 'rgba(77,158,255,.07)' : 'transparent' }}>
                          <td><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} /></td>
                          <td><span className="fw-700 fs-13">{e.itemName}</span></td>
                          <td><span style={{ fontSize: 11, color: 'var(--red, #f43f5e)', fontWeight: 700 }}>"{e.category}"</span></td>
                          <td style={{ textAlign: 'right' }}><span className="amt amt-r fw-800">₹{(+e.mrp).toFixed(2)}</span></td>
                          <td><span style={{ fontSize: 12, color: 'var(--t3)' }}>{e.unit}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
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
          })()}

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
                          <td><span style={{ fontSize: 11, color: mrpCategoryColor(it.category), fontWeight: 700 }}>{it.category}</span></td>
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
          <MrpEntryForm item={edit} onSave={save} onClose={() => { setModal(false); setEdit(null); }} />
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
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
const COMPARE_MODES = [
  { key: '2y',  label: '2 Years',  months: 24 },
  { key: '1y',  label: '1 Year',   months: 12 },
  { key: '6m',  label: '6 Months', months: 6 },
  { key: '3m',  label: '3 Months', months: 3 },
  { key: 'week',label: 'Weekly',   months: 0 },
];

// ─── Compare Tab ───────────────────────────────────────────
function CompareTab({ showFixed, isFixedCat }) {
  const [mode, setMode] = useState('6m');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selCats, setSelCats] = useState(new Set());
  const [allCats, setAllCats] = useState([]);
  const [view, setView] = useState('bar'); // bar | line | table | category

  const now = new Date();
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const load = async () => {
    setLoading(true);
    try {
      if (mode === 'week') {
        const allItems = await expenseService.getAll({ year: now.getFullYear() });
        const prevYearItems = await expenseService.getAll({ year: now.getFullYear() - 1 });
        const allCombined = [...prevYearItems, ...allItems];
        const combined = showFixed ? allCombined : allCombined.filter(i => !isFixedCat || !isFixedCat(i.category));
        const weeks = [];
        for (let w = 11; w >= 0; w--) {
          const weekEnd = new Date(now);
          weekEnd.setDate(now.getDate() - w * 7);
          const weekStart = new Date(weekEnd);
          weekStart.setDate(weekEnd.getDate() - 6);
          const label = `${weekStart.getDate()} ${MONTHS_SHORT[weekStart.getMonth()]}`;
          const weekItems = combined.filter(i => { const d = new Date(i.date); return d >= weekStart && d <= weekEnd; });
          const total = weekItems.reduce((s, i) => s + +i.amount, 0);
          const cats = {};
          weekItems.forEach(i => { cats[i.category] = (cats[i.category] || 0) + +i.amount; });
          weeks.push({ label, total, ...cats, _items: weekItems });
        }
        setData(weeks);
        const catSet = new Set(combined.map(i => i.category).filter(Boolean));
        setAllCats([...catSet].sort());
      } else {
        const mCount = COMPARE_MODES.find(m => m.key === mode).months;
        const months = [];
        for (let i = mCount - 1; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push({ m: d.getMonth() + 1, y: d.getFullYear(), label: `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
        }
        const fetched = await Promise.all(months.map(({ m, y }) => expenseService.getAll({ month: m, year: y })));
        const rows = months.map(({ label }, idx) => {
          const rawItems = fetched[idx];
          const items = showFixed ? rawItems : rawItems.filter(i => !isFixedCat || !isFixedCat(i.category));
          const total = items.reduce((s, i) => s + +i.amount, 0);
          const cats = {};
          items.forEach(i => { cats[i.category] = (cats[i.category] || 0) + +i.amount; });
          return { label, total, ...cats, _items: items };
        });
        setData(rows);
        const allFlat = showFixed ? fetched.flat() : fetched.flat().filter(i => !isFixedCat || !isFixedCat(i.category));
        const catSet = new Set(allFlat.map(i => i.category).filter(Boolean));
        setAllCats([...catSet].sort());
      }
    } catch (e) { toast.error('Failed to load'); console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [mode, showFixed]);

  // ── Derived stats ──────────────────────────────────────────
  const topCats = allCats
    .map(cat => ({ cat, total: data.reduce((s, d) => s + (d[cat] || 0), 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const displayCats = selCats.size > 0 ? topCats.filter(c => selCats.has(c.cat)) : topCats.slice(0, 6);
  const toggleCat = (cat) => setSelCats(s => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  const totals = data.map(d => d.total);
  const avg = totals.length > 0 ? totals.reduce((s, v) => s + v, 0) / totals.length : 0;
  const maxPeriod = data.reduce((m, d) => d.total > (m?.total || 0) ? d : m, null);
  const minPeriod = data.filter(d => d.total > 0).reduce((m, d) => d.total < (m?.total || Infinity) ? d : m, null);
  const trend = totals.length >= 2 ? totals[totals.length - 1] - totals[0] : 0;
  const trendPct = totals.length >= 2 && totals[0] > 0 ? ((totals[totals.length - 1] - totals[0]) / totals[0]) * 100 : 0;

  // Last vs second-last period change
  const lastTotal = totals[totals.length - 1] || 0;
  const prevTotal = totals[totals.length - 2] || 0;
  const momChange = prevTotal > 0 ? ((lastTotal - prevTotal) / prevTotal) * 100 : 0;

  // ── Top Movers: categories with biggest change last vs prev period ──
  const topMovers = data.length >= 2
    ? allCats.map(cat => {
        const last = data[data.length - 1][cat] || 0;
        const prev = data[data.length - 2][cat] || 0;
        return { cat, last, prev, change: last - prev, pct: prev > 0 ? ((last - prev) / prev) * 100 : (last > 0 ? 100 : 0) };
      })
      .filter(m => m.last > 0 || m.prev > 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 5)
    : [];

  // ── Export CSV ─────────────────────────────────────────────
  const handleExport = () => {
    if (!data.length) return;
    const headers = ['Period', 'Total', ...topCats.map(c => c.cat)];
    const rows = data.map(d => [d.label, d.total, ...topCats.map(c => d[c.cat] || 0)]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `compare_${mode}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported!');
  };

  // ── Shared Tooltip ─────────────────────────────────────────
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s, p) => s + (p.value || 0), 0);
    return (
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12, padding: '12px 16px', fontSize: 12, maxWidth: 240, boxShadow: '0 4px 20px rgba(0,0,0,.2)' }}>
        <div className="fw-800 mb-2" style={{ fontSize: 13 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} className="flex justify-between gap-4 mb-1">
            <span style={{ color: p.color || p.fill, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill, display: 'inline-block', flexShrink: 0 }} />
              {p.name}
            </span>
            <span className="fw-700">₹{Number(p.value).toLocaleString('en-IN')}</span>
          </div>
        ))}
        {payload.length > 1 && (
          <div className="flex justify-between gap-4 mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="fw-700 text-muted">Total</span>
            <span className="fw-800">₹{total.toLocaleString('en-IN')}</span>
          </div>
        )}
        {payload.length === 1 && avg > 0 && (
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--t3)' }}>
            {payload[0].value > avg
              ? <span style={{ color: '#f43f5e' }}>▲ {((payload[0].value / avg - 1) * 100).toFixed(1)}% above avg</span>
              : <span style={{ color: '#22c55e' }}>▼ {((1 - payload[0].value / avg) * 100).toFixed(1)}% below avg</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* ── Header controls ─────────────────────────────────── */}
      <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Period mode pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {COMPARE_MODES.map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              style={{ padding: '6px 16px', borderRadius: 20, border: `2px solid ${mode === m.key ? 'var(--blue)' : 'var(--border2)'}`, background: mode === m.key ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: mode === m.key ? 'var(--blue)' : 'var(--t2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all .15s' }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Right: view toggle + export */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border2)', padding: 3, gap: 2 }}>
            {[
              { v: 'bar',      icon: '📊', label: 'Bar' },
              { v: 'line',     icon: '📈', label: 'Line' },
              { v: 'table',    icon: '📋', label: 'Table' },
              { v: 'category', icon: '🗂️', label: 'Category' },
            ].map(({ v, icon, label }) => (
              <button key={v} onClick={() => setView(v)}
                title={label}
                style={{ padding: '5px 11px', borderRadius: 8, border: 'none', background: view === v ? 'var(--bg2)' : 'transparent', color: view === v ? 'var(--blue)' : 'var(--t3)', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s', boxShadow: view === v ? '0 1px 4px rgba(0,0,0,.15)' : 'none' }}>
                {icon} {label}
              </button>
            ))}
          </div>
          <button onClick={handleExport} title="Export CSV"
            style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border2)', background: 'var(--bg3)', color: 'var(--t2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            ⬇️ Export
          </button>
        </div>
      </div>

      {!showFixed && (
        <div style={{ background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'var(--orange)', fontWeight:700 }}>
          🔀 Variable only — Fixed (House Rent, RD, Gold) excluded from all comparisons
        </div>
      )}

      {loading ? <div className="spin-center"><div className="spin spin-lg" /></div> : (
        <>
          {/* ── Summary stat cards ────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
            {/* Average */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', borderLeft: '3px solid var(--blue)' }}>
              <div className="fs-11 text-muted mb-1">📊 Period Average</div>
              <div className="fw-800 fs-15" style={{ color: 'var(--blue)' }}>{fmt(avg)}</div>
              <div className="fs-10 text-muted mt-1">{data.length} periods</div>
            </div>
            {/* Highest */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', borderLeft: '3px solid var(--red)' }}>
              <div className="fs-11 text-muted mb-1">📈 Highest</div>
              <div className="fw-800 fs-15" style={{ color: 'var(--red)' }}>{maxPeriod ? fmt(maxPeriod.total) : '—'}</div>
              <div className="fs-10 text-muted mt-1">{maxPeriod?.label || ''}</div>
            </div>
            {/* Lowest */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', borderLeft: '3px solid var(--green)' }}>
              <div className="fs-11 text-muted mb-1">📉 Lowest</div>
              <div className="fw-800 fs-15" style={{ color: 'var(--green)' }}>{minPeriod ? fmt(minPeriod.total) : '—'}</div>
              <div className="fs-10 text-muted mt-1">{minPeriod?.label || ''}</div>
            </div>
            {/* Overall trend */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', borderLeft: `3px solid ${trend <= 0 ? 'var(--green)' : 'var(--red)'}` }}>
              <div className="fs-11 text-muted mb-1">{trend <= 0 ? '✅' : '⚠️'} Overall Trend</div>
              <div className="fw-800 fs-15" style={{ color: trend <= 0 ? 'var(--green)' : 'var(--red)' }}>{trend >= 0 ? '+' : ''}{fmt(trend)}</div>
              <div className="fs-10 text-muted mt-1">{trendPct >= 0 ? '+' : ''}{trendPct.toFixed(1)}% first→last</div>
            </div>
            {/* MoM change */}
            {data.length >= 2 && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', borderLeft: `3px solid ${momChange <= 0 ? 'var(--green)' : '#f59e0b'}` }}>
                <div className="fs-11 text-muted mb-1">{momChange <= 0 ? '🎉' : '🔔'} vs Last Period</div>
                <div className="fw-800 fs-15" style={{ color: momChange <= 0 ? 'var(--green)' : '#f59e0b' }}>{momChange >= 0 ? '+' : ''}{momChange.toFixed(1)}%</div>
                <div className="fs-10 text-muted mt-1">{data[data.length - 2]?.label} → {data[data.length - 1]?.label}</div>
              </div>
            )}
          </div>

          {/* ── Top Movers ────────────────────────────────────── */}
          {topMovers.length > 0 && (
            <div className="card mb-4">
              <div className="card-title" style={{ marginBottom: 10 }}>🔥 Top Movers <span className="text-muted fw-400 fs-12">({data[data.length - 2]?.label} → {data[data.length - 1]?.label})</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {topMovers.map((m, i) => (
                  <div key={m.cat} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', border: `1px solid ${m.change > 0 ? 'rgba(244,63,94,.2)' : 'rgba(34,197,94,.2)'}` }}>
                    <div className="flex justify-between items-start">
                      <div className="fw-700 fs-12" style={{ color: 'var(--text)', maxWidth: 120 }}>{m.cat}</div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: m.change > 0 ? 'var(--red)' : 'var(--green)', background: m.change > 0 ? 'rgba(244,63,94,.1)' : 'rgba(34,197,94,.1)', borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>
                        {m.change > 0 ? '▲' : '▼'} {Math.abs(m.pct).toFixed(0)}%
                      </span>
                    </div>
                    <div className="fs-11 text-muted mt-1">{fmt(m.prev)} → <span className="fw-700" style={{ color: m.change > 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(m.last)}</span></div>
                    {/* Mini progress bar */}
                    <div style={{ marginTop: 8, background: 'var(--border)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (m.last / Math.max(m.last, m.prev)) * 100)}%`, background: m.change > 0 ? 'var(--red)' : 'var(--green)', borderRadius: 4, transition: 'width .4s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── BAR CHART VIEW ────────────────────────────────── */}
          {view === 'bar' && (
            <div className="card mb-4">
              <div className="flex justify-between items-center mb-3">
                <div className="card-title" style={{ margin: 0 }}>💰 Total Expenses — {COMPARE_MODES.find(m => m.key === mode)?.label}</div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} width={52} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={avg} stroke="var(--blue)" strokeDasharray="5 3" strokeWidth={1.5}
                    label={{ value: `Avg ₹${avg >= 1000 ? (avg/1000).toFixed(1)+'k' : avg.toFixed(0)}`, position: 'insideTopRight', fontSize: 10, fill: 'var(--blue)', fontWeight: 700 }} />
                  <Bar dataKey="total" name="Total Spend" radius={[6,6,0,0]} maxBarSize={52}>
                    {data.map((d, i) => (
                      <Cell key={i} fill={d.total > avg * 1.2 ? '#f43f5e' : d.total < avg * 0.8 ? '#22c55e' : '#4d9eff'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-3" style={{ flexWrap: 'wrap', fontSize: 11, color: 'var(--t3)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#22c55e', display: 'inline-block' }} /> Below avg (&lt;80%)</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#4d9eff', display: 'inline-block' }} /> Near avg</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#f43f5e', display: 'inline-block' }} /> Above avg (&gt;120%)</span>
                <span style={{ marginLeft: 'auto' }}>Avg: <strong>{fmt(avg)}</strong></span>
              </div>
            </div>
          )}

          {/* ── LINE CHART VIEW ───────────────────────────────── */}
          {view === 'line' && (
            <div className="card mb-4">
              <div className="card-title mb-3">📈 Spend Trend — {COMPARE_MODES.find(m => m.key === mode)?.label}</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} width={52} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={avg} stroke="var(--blue)" strokeDasharray="5 3" strokeWidth={1.5}
                    label={{ value: `Avg`, position: 'insideTopRight', fontSize: 10, fill: 'var(--blue)', fontWeight: 700 }} />
                  <Line type="monotone" dataKey="total" name="Total Spend" stroke="#4d9eff" strokeWidth={2.5} dot={{ r: 5, fill: '#4d9eff', stroke: 'var(--bg)', strokeWidth: 2 }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="fs-11 text-muted mt-2" style={{ textAlign: 'center' }}>
                Dashed line = average ({fmt(avg)})
              </div>
            </div>
          )}

          {/* ── TABLE VIEW ────────────────────────────────────── */}
          {view === 'table' && (
            <div className="card mb-4">
              <div className="card-title">📋 Period-wise Breakdown</div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ textAlign: 'right' }}>vs Avg</th>
                      <th style={{ textAlign: 'right' }}>vs Prev</th>
                      <th style={{ textAlign: 'right' }}>MoM %</th>
                      <th>Top Category</th>
                      <th style={{ textAlign: 'right' }}>Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((d, i) => {
                      const vsAvg = d.total - avg;
                      const vsAvgPct = avg > 0 ? (vsAvg / avg) * 100 : 0;
                      const vsPrev = i > 0 ? d.total - data[i-1].total : null;
                      const vsPrevPct = i > 0 && data[i-1].total > 0 ? ((d.total - data[i-1].total) / data[i-1].total) * 100 : null;
                      const topCat = allCats.map(c => ({ c, v: d[c] || 0 })).sort((a,b) => b.v - a.v)[0];
                      const isHigh = d.total > avg * 1.2;
                      const isLow = d.total < avg * 0.8;
                      return (
                        <tr key={i} style={{ background: isHigh ? 'rgba(244,63,94,.04)' : isLow ? 'rgba(34,197,94,.04)' : 'transparent' }}>
                          <td>
                            <div className="flex items-center gap-2">
                              {isHigh && <span style={{ fontSize: 10, background: 'rgba(244,63,94,.12)', color: 'var(--red)', borderRadius: 20, padding: '1px 6px', fontWeight: 800 }}>HIGH</span>}
                              {isLow && <span style={{ fontSize: 10, background: 'rgba(34,197,94,.12)', color: 'var(--green)', borderRadius: 20, padding: '1px 6px', fontWeight: 800 }}>LOW</span>}
                              <span className="fw-700">{d.label}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}><span className="amt fw-800">{fmt(d.total)}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <div>
                              <span className={`fw-700 fs-12 ${vsAvg <= 0 ? 'amt-g' : 'amt-r'}`}>{vsAvg >= 0 ? '+' : ''}{fmt(vsAvg)}</span>
                              <div className="fs-10 text-muted">{vsAvgPct >= 0 ? '+' : ''}{vsAvgPct.toFixed(1)}%</div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {vsPrev !== null
                              ? <span className={`fw-700 fs-12 ${vsPrev <= 0 ? 'amt-g' : 'amt-r'}`}>{vsPrev >= 0 ? '+' : ''}{fmt(vsPrev)}</span>
                              : <span className="text-muted fs-12">—</span>}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {vsPrevPct !== null
                              ? <span style={{ fontSize: 11, fontWeight: 800, color: vsPrevPct <= 0 ? 'var(--green)' : 'var(--red)', background: vsPrevPct <= 0 ? 'rgba(34,197,94,.1)' : 'rgba(244,63,94,.1)', borderRadius: 20, padding: '2px 7px' }}>
                                  {vsPrevPct >= 0 ? '+' : ''}{vsPrevPct.toFixed(1)}%
                                </span>
                              : <span className="text-muted fs-12">—</span>}
                          </td>
                          <td>
                            {topCat?.v > 0
                              ? <span style={{ background: 'var(--bg3)', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{topCat.c} · {fmt(topCat.v)}</span>
                              : <span className="text-muted fs-12">—</span>}
                          </td>
                          <td style={{ textAlign: 'right' }} className="text-muted fs-12">{d._items?.length || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="fw-700 text-muted fs-12" style={{ padding: '8px 14px' }}>AVERAGE</td>
                      <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="fw-800">{fmt(avg)}</span></td>
                      <td colSpan={5} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── CATEGORY VIEW ─────────────────────────────────── */}
          {view === 'category' && (
            <div>
              {/* Category chips with spend totals */}
              <div className="card mb-3">
                <div className="flex justify-between items-center mb-3">
                  <div className="fs-13 fw-700">Filter Categories <span className="text-muted fw-400">(top 12 by spend)</span></div>
                  {selCats.size > 0 && (
                    <button onClick={() => setSelCats(new Set())} style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Clear ({selCats.size})
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button onClick={() => setSelCats(new Set())}
                    style={{ padding: '5px 14px', borderRadius: 20, border: `1.5px solid ${selCats.size === 0 ? 'var(--blue)' : 'var(--border2)'}`, background: selCats.size === 0 ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: selCats.size === 0 ? 'var(--blue)' : 'var(--t3)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Top 6
                  </button>
                  {topCats.map((c, i) => {
                    const color = PALETTE[i % PALETTE.length];
                    const active = selCats.has(c.cat);
                    const grandTotal = topCats.reduce((s, t) => s + t.total, 0);
                    const pct = grandTotal > 0 ? (c.total / grandTotal * 100).toFixed(0) : 0;
                    return (
                      <button key={c.cat} onClick={() => toggleCat(c.cat)}
                        style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${active ? color : 'var(--border2)'}`, background: active ? color + '20' : 'var(--bg3)', color: active ? color : 'var(--t2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        {c.cat}
                        <span style={{ opacity: .7, fontWeight: 400 }}>{pct}%</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stacked bar chart by category */}
              <div className="card mb-4">
                <div className="card-title">🗂️ Category Breakdown by Period</div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} width={52} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    {displayCats.map((c, i) => (
                      <Bar key={c.cat} dataKey={c.cat} stackId="a" fill={PALETTE[topCats.findIndex(t => t.cat === c.cat) % PALETTE.length]} maxBarSize={52} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Category × Period table with mini sparkbars */}
              <div className="card">
                <div className="card-title">📊 Category × Period Table</div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Category</th>
                        {data.map((d, i) => <th key={i} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{d.label}</th>)}
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right' }}>Avg/Period</th>
                        <th style={{ textAlign: 'right' }}>Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayCats.map((c, ci) => {
                        const color = PALETTE[topCats.findIndex(t => t.cat === c.cat) % PALETTE.length];
                        const vals = data.map(d => d[c.cat] || 0);
                        const catTotal = vals.reduce((s, v) => s + v, 0);
                        const catAvg = vals.length > 0 ? catTotal / vals.length : 0;
                        const maxVal = Math.max(...vals);
                        const catTrend = vals.length >= 2 ? vals[vals.length - 1] - vals[0] : 0;
                        return (
                          <tr key={c.cat}>
                            <td>
                              <div className="flex items-center gap-2">
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                <span className="fw-600 fs-13">{c.cat}</span>
                              </div>
                            </td>
                            {vals.map((v, i) => (
                              <td key={i} style={{ textAlign: 'right' }}>
                                <div>
                                  <span className={`fw-700 fs-12 ${v === maxVal && v > 0 ? 'amt-r' : v === 0 ? 'text-muted' : ''}`}>{v > 0 ? fmt(v) : '—'}</span>
                                  {v > 0 && <div style={{ background: color + '30', borderRadius: 3, height: 3, width: `${Math.max(8, (v / maxVal) * 60)}px`, marginLeft: 'auto', marginTop: 3 }} />}
                                </div>
                              </td>
                            ))}
                            <td style={{ textAlign: 'right' }}><span className="amt fw-800">{fmt(catTotal)}</span></td>
                            <td style={{ textAlign: 'right' }} className="text-muted fs-12">{fmt(catAvg)}</td>
                            <td style={{ textAlign: 'right' }}>
                              {vals.length >= 2
                                ? <span style={{ fontSize: 11, fontWeight: 800, color: catTrend <= 0 ? 'var(--green)' : 'var(--red)' }}>
                                    {catTrend >= 0 ? '▲' : '▼'} {fmt(Math.abs(catTrend))}
                                  </span>
                                : <span className="text-muted fs-12">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="fw-700 text-muted fs-12" style={{ padding: '8px 14px' }}>TOTAL</td>
                        {data.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '8px 14px' }}><span className="fw-800">{fmt(d.total)}</span></td>)}
                        <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="fw-800">{fmt(data.reduce((s, d) => s + d.total, 0))}</span></td>
                        <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="fw-700">{fmt(avg)}</span></td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Insights Tab ─────────────────────────────────────────
const INSIGHTS_PERIODS = [
  { key: 'weekly',    label: 'Weekly',   unit: 'wk', tag: '8-week' },
  { key: '3m',        label: '3 Months', unit: 'mo', tag: '3-month' },
  { key: '6m',        label: '6 Months', unit: 'mo', tag: '6-month' },
  { key: '1y',        label: '1 Year',   unit: 'mo', tag: '1-year' },
];

function InsightsTab({ showFixed, isFixedCat }) {
  const now = new Date();
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const PALETTE_INS = ['#4d9eff','#22c55e','#f97316','#a78bfa','#f43f5e','#fbbf24','#2dd4bf','#fb923c','#38bdf8','#818cf8','#84cc16','#ec4899'];

  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState('3m'); // 'weekly' | '3m' | '6m' | '1y'
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

  // Top cats by total spend across the selected period
  const topCats = allCats
    .map(cat => ({ cat, total: monthData.reduce((s, d) => s + (d[cat] || 0), 0) }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  // Per-bucket averages per category
  const avgByCat = topCats.map(({ cat, total }) => ({
    cat,
    avg: monthData.length > 0 ? total / monthData.length : 0,
    color: PALETTE_INS[topCats.findIndex(c => c.cat === cat) % PALETTE_INS.length],
  })).sort((a, b) => b.avg - a.avg).slice(0, 10);

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

            {/* Category × Month mini table */}
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--t3)', fontWeight: 700 }}>Category</th>
                    {monthData.map((d, i) => (
                      <th key={i} style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--t3)', fontWeight: 700 }}>{d.label}</th>
                    ))}
                    <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--t3)', fontWeight: 700 }}>Avg/{periodCfg.unit}</th>
                  </tr>
                </thead>
                <tbody>
                  {topCats.slice(0, 8).map(({ cat }, i) => {
                    const color = PALETTE_INS[i % PALETTE_INS.length];
                    const vals = monthData.map(d => d[cat] || 0);
                    const avg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
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
          { key: 'percent',   label: '📊 % Breakdown' },
          { key: 'groups',    label: '🗂️ Group Summary' },
          { key: 'insights',  label: '💡 Insights' },
          { key: 'compare',   label: '🔀 Compare' },
          { key: 'catdetail', label: '🔎 Category Detail' },
          { key: 'paidvia',   label: '💳 Paid Via' },
          { key: 'mrpprices', label: '🏷️ MRP Prices' },
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
                                {!isCollapsed && rows.map(i => (
                                  <tr key={i.id} style={{ background: selected.has(i.id) ? 'rgba(77,158,255,.07)' : 'transparent' }}>
                                    <td>
                                      <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSelect(i.id)}
                                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--blue)' }} />
                                    </td>
                                    <td style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--t3)', fontWeight: 500, paddingLeft: 24 }}>—</td>
                                    <td><div className="flex items-center gap-1"><span className="badge badge-r" style={{ fontSize: 13, padding: '4px 12px' }}>{i.category}</span>{isFixedCat(i.category) && <span title="Fixed expense" style={{ fontSize: 10, background: 'rgba(249,115,22,.15)', color: 'var(--orange)', borderRadius: 20, padding: '1px 6px', fontWeight: 700 }}>📌</span>}</div></td>
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
                                ))}
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
      {tab === 'percent'   && <PercentageTab items={filteredByToggle} showFixed={showFixed} isFixedCat={isFixedCat} allItems={items} cats={cats} onBudgetSave={async (catId, data) => { await categoryService.update(catId, data); load(); }} />}
      {tab === 'groups'    && <GroupSummaryTab items={filteredByToggle} showFixed={showFixed} cats={cats} />}
      {tab === 'insights'  && <InsightsTab showFixed={showFixed} isFixedCat={isFixedCat} />}
      {tab === 'compare'   && <CompareTab showFixed={showFixed} isFixedCat={isFixedCat} />}
      {tab === 'catdetail' && <CategoryDetailTab cats={cats} />}
      {tab === 'paidvia'   && <PaidViaTab items={filteredByToggle} showFixed={showFixed} isFixedCat={isFixedCat} />}
      {tab === 'mrpprices' && <MrpPricesTab />}

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