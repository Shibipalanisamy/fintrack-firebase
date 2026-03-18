import { useState, useEffect, useCallback, useRef } from 'react';
import { expenseService, categoryService, recurringService } from '../utils/dbService';
import { fmt, fmtDate, fmtDateInput, today, exportCSV, importCSV } from '../utils/helpers';
import { Modal, ConfirmDelete, MonthYearFilter } from '../components/UI';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend, CartesianGrid } from 'recharts';
import { PALETTE } from '../utils/helpers';
import toast from 'react-hot-toast';

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

// ─── Group Definitions ─────────────────────────────────────
const EXPENSE_GROUPS = [
  {
    key: 'house', label: 'House Expenses', icon: '🏠', color: '#f97316',
    categories: ['Gas Booking or Advance','Snacks','Grocery','Water Can and Advance','Internet / Modem','Meat or Egg','Dry Fruits','Flour','Vegetables for Office','Vegetables','Vegetable','Milk','Oil','Fruits','Rice','Electricity Bill','Curd','Paneer','House Rent / Advance','House Rent','Rent','Basic Needs','Wife Basic Needs']
  },
  {
    key: 'investment', label: 'Investments', icon: '📈', color: '#22c55e',
    categories: ['Stock Investment','RD Amount','Wife Investment Amount','SIP Mutual Fund','Gold Investment','PPF','Term Insurance','Business Investment','Bank Deposit']
  },
  {
    key: 'wheel', label: 'Wheel Expenses', icon: '🚗', color: '#93c5fd',
    categories: ['Bike Petrol','Cab','Bike Service','Car Petrol','Gokul Bike Petrol','Share Auto','Parking']
  },
  {
    key: 'booking', label: 'Booking / Travel', icon: '🎫', color: '#a78bfa',
    categories: ['Bus Booking','Train Booking','Home Town Bus Fee','MTC Bus Fees','Home Town Fees']
  },
  {
    key: 'medical', label: 'Medical', icon: '🏥', color: '#f43f5e',
    categories: ['Medical Treatment','Doctor Consultation Fees','Hospital Fees','Health Insurance','Scan and Test']
  },
];

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
  const PAID_VIA = ['HDFC Bank','Axis Bank','IDFC First Bank','Paytm','ICICI','ICICI Credit Card','Cash Wallet','Meal Card','Cash','UTS Wallet','Amazon Wallet'];
  const [f, setF] = useState({ date: today(), category: cats.find(c => c.isFavorite)?.name || cats[0]?.name || 'Grocery', itemName: '', paidVia: 'HDFC Bank', amount: '', notes: '', ...(item ? { ...item, date: fmtDateInput(item.date) } : {}) });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async e => { e.preventDefault(); const amt = parseFloat(f.amount); if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; } setLoading(true); try { await onSave({ ...f, amount: amt }); } finally { setLoading(false); } };
  return (
    <form onSubmit={submit}>
      <div className="frow"><div className="fg"><label className="fl">Date</label><input className="fi" type="date" name="date" value={f.date} onChange={ch} required max={today()} /></div></div>
      <div className="fg"><label className="fl">Amount (Rs) — type expression like 100+50</label><AmountInput value={f.amount} onChange={val => setF(p => ({ ...p, amount: val }))} /></div>
      <div className="fg"><label className="fl">Category</label><CategoryDropdown cats={cats} value={f.category} onChange={val => setF(p => ({ ...p, category: val }))} /></div>

      <div className="fg">
        <label className="fl">Paid Via</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4 }}>
          {PAID_VIA.map(p => (
            <button key={p} type="button" onClick={() => setF(prev => ({ ...prev, paidVia: p }))}
              style={{ padding: '7px 6px', borderRadius: 8, border: `2px solid ${f.paidVia === p ? 'var(--blue)' : 'var(--border2)'}`, background: f.paidVia === p ? 'rgba(77,158,255,.12)' : 'var(--bg3)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: f.paidVia === p ? 'var(--blue)' : 'var(--t3)', textAlign: 'center', lineHeight: 1.3 }}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" name="notes" value={f.notes} onChange={ch} rows={2} /></div>
      <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spin" /> : null}{item ? 'Update' : 'Add Expense'}</button></div>
    </form>
  );
}

// ─── Percentage Tab ────────────────────────────────────────
function PercentageTab({ items, showFixed, isFixedCat, allItems }) {
  const total = items.reduce((s, i) => s + +i.amount, 0);
  const catMap = {};
  items.forEach(i => { catMap[i.category] = (catMap[i.category] || 0) + +i.amount; });
  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const pieData = sorted.slice(0, 10).map(([name, value], idx) => ({ name, value, color: PALETTE[idx % PALETTE.length] }));

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

      {/* Full table */}
      <div className="card">
        <div className="card-title">📊 Category-wise Breakdown</div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>#</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>%</th><th>Bar</th></tr></thead>
          <tbody>{sorted.map(([cat, amt], i) => {
            const pct = ((amt / total) * 100).toFixed(1);
            return (
              <tr key={cat}>
                <td className="text-muted fs-12">{i + 1}</td>
                <td className="fw-600 fs-13">{cat}</td>
                <td style={{ textAlign: 'right' }}><span className="amt amt-r">{fmt(amt)}</span></td>
                <td style={{ textAlign: 'right' }}><span className="fw-700" style={{ color: PALETTE[i % PALETTE.length] }}>{pct}%</span></td>
                <td style={{ width: 120 }}>
                  <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: PALETTE[i % PALETTE.length], borderRadius: 4 }} />
                  </div>
                </td>
              </tr>
            );
          })}</tbody>
          <tfoot><tr><td colSpan={2} className="text-muted fs-12" style={{ padding: '10px 14px' }}>TOTAL</td><td style={{ textAlign: 'right', padding: '10px 14px' }}><span className="amt amt-r fw-800">{fmt(total)}</span></td><td style={{ textAlign: 'right', padding: '10px 14px' }}><span className="fw-800">100%</span></td><td /></tr></tfoot>
        </table></div>
      </div>
    </div>
  );
}

// ─── Group Summary Tab ─────────────────────────────────────
function GroupSummaryTab({ items, showFixed }) {
  const total = items.reduce((s, i) => s + +i.amount, 0);

  const getGroupTotal = (group) => {
    return items.filter(i => group.categories.some(c => c.toLowerCase() === i.category?.toLowerCase())).reduce((s, i) => s + +i.amount, 0);
  };

  const getGroupItems = (group) => {
    return items.filter(i => group.categories.some(c => c.toLowerCase() === i.category?.toLowerCase()));
  };

  const [expanded, setExpanded] = useState({});
  const [othersExpanded, setOthersExpanded] = useState(false);

  const ungroupedItems = items.filter(i => !EXPENSE_GROUPS.some(g => g.categories.some(c => c.toLowerCase() === i.category?.toLowerCase())));
  const ungroupedTotal = ungroupedItems.reduce((s, i) => s + +i.amount, 0);

  if (items.length === 0) return <div className="card"><div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No data</div><div className="empty-sub">{showFixed ? 'Add expenses to see group summary' : 'No variable expenses found'}</div></div></div>;

  return (
    <div>
      {!showFixed && (
        <div style={{ background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'var(--orange)', fontWeight:700 }}>
          🔀 Variable expenses only — Fixed (House Rent, RD, Gold Investment) excluded
        </div>
      )}
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        {EXPENSE_GROUPS.map(g => {
          const amt = getGroupTotal(g);
          const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : 0;
          return (
            <div key={g.key} style={{ background: 'var(--bg2)', border: `1px solid var(--border)`, borderRadius: 12, padding: 14, borderLeft: `4px solid ${g.color}` }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{g.icon}</div>
              <div className="fs-12 fw-700 text-muted mb-1">{g.label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: g.color }}>{fmt(amt)}</div>
              <div className="fs-11 text-muted mt-1">{pct}% of total</div>
              <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 4, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: g.color, borderRadius: 4 }} />
              </div>
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
      {EXPENSE_GROUPS.map(g => {
        const groupItems = getGroupItems(g);
        const groupTotal = getGroupTotal(g);
        if (groupTotal === 0) return null;
        const catMap = {};
        groupItems.forEach(i => { catMap[i.category] = (catMap[i.category] || 0) + +i.amount; });
        return (
          <div key={g.key} className="card" style={{ marginBottom: 12 }}>
            <div className="flex justify-between items-center" style={{ cursor: 'pointer' }} onClick={() => setExpanded(p => ({ ...p, [g.key]: !p[g.key] }))}>
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
                <span className="text-muted">{expanded[g.key] ? '▲' : '▼'}</span>
              </div>
            </div>
            {expanded[g.key] && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                {Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                  <div key={cat} className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 4, width: `${(amt / groupTotal) * 80}px`, maxWidth: 80, minWidth: 8, background: g.color, opacity: 0.6 }} />
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

const BLANK_REC = { name: '', category: '', amount: '', frequency: 'monthly', nextDue: today(), paidVia: '', notes: '', isActive: true };

function RecurringTab({ cats, showFixed, isFixedCat }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(false);
  const [edit, setEdit]     = useState(null);
  const [delId, setDelId]   = useState(null);
  const [form, setForm]     = useState(BLANK_REC);
  const [adding, setAdding] = useState(false);

  const now = new Date();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { setItems(await recurringService.getAll()); }
    catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
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
      const nextDue = new Date(item.nextDue);
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
    } catch { toast.error('Failed'); }
  };

  const getDaysUntil = (dateStr) => {
    const due = new Date(dateStr);
    const diff = Math.round((due - now) / (1000 * 60 * 60 * 24));
    return diff;
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

  const ch = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const favCats = cats.filter(c => c.isFavorite);
  const otherCats = cats.filter(c => !c.isFavorite);

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Est. Monthly Cost', val: fmt(monthlyTotal), c: 'var(--blue)', icon: '📅' },
          { label: 'Active Recurring', val: activeItems.length, c: 'var(--green)', icon: '🔄' },
          { label: 'Overdue', val: overdueCount, c: overdueCount > 0 ? 'var(--red)' : 'var(--t3)', icon: '🚨' },
          { label: 'Due This Week', val: dueSoonCount, c: dueSoonCount > 0 ? 'var(--orange)' : 'var(--t3)', icon: '⏰' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${s.c}` }}>
            <div className="fs-11 text-muted">{s.icon} {s.label}</div>
            <div className="fw-800 fs-15 mt-1" style={{ color: s.c }}>{s.val}</div>
          </div>
        ))}
      </div>

      {!showFixed && (
        <div style={{ background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8, padding:'8px 14px', marginBottom:10, fontSize:12, color:'var(--orange)', fontWeight:700 }}>
          🔀 Variable only — Fixed recurring items hidden. Payments to fixed items still record to the List tab.
        </div>
      )}
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="fs-14 fw-700">🔄 Active Recurring ({displayItems.length}{!showFixed ? ' variable' : ''})</div>
        <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm(BLANK_REC); setModal(true); }}>+ Add Recurring</button>
      </div>

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
                const days = getDaysUntil(item.nextDue);
                const status = getDueStatus(days);
                const freq = FREQ_OPTIONS.find(f => f.key === item.frequency);
                return (
                  <div key={item.id} style={{ background: 'var(--bg2)', border: `1px solid var(--border)`, borderRadius: 12, padding: '12px 16px', borderLeft: `4px solid ${status.color}` }}>
                    <div className="flex justify-between items-start" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="fw-800 fs-14">{item.name}</span>
                          <span style={{ background: status.bg, color: status.color, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{status.label}</span>
                          {item.lastPaid && <span className="text-muted fs-11">Last paid: {new Date(item.lastPaid).toLocaleDateString('en-IN')}</span>}
                        </div>
                        <div className="flex items-center gap-3 fs-12 text-muted" style={{ flexWrap: 'wrap' }}>
                          {item.category && <span style={{ background: 'var(--bg3)', borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>{item.category}</span>}
                          <span>🔁 {freq?.label}</span>
                          {item.paidVia && <span>💳 {item.paidVia}</span>}
                          <span>📅 Next: {new Date(item.nextDue).toLocaleDateString('en-IN')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="fw-900 fs-16 amt-r">{fmt(parseFloat(item.amount))}</span>
                        <button className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => recordPayment(item)}>✓ Pay</button>
                        <button className="btn-icon" onClick={() => { setEdit(item); setForm({ ...item }); setModal(true); }}>✏️</button>
                        <button className="btn-icon" style={{ fontSize: 12, color: 'var(--t3)' }} title="Pause" onClick={() => toggleActive(item)}>⏸️</button>
                        <button className="btn-icon" onClick={() => setDelId(item.id)}>🗑️</button>
                      </div>
                    </div>
                    {item.notes && <div className="fs-12 text-muted mt-2" style={{ fontStyle: 'italic' }}>📝 {item.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}

      {/* Inactive/Paused */}
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
          <div className="fg"><label className="fl">Name</label>
            <input className="fi" name="name" value={form.name} onChange={ch} placeholder="e.g. House Rent, Netflix, SIP, Gym" autoFocus />
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">Amount (Rs)</label>
              <input className="fi" type="number" name="amount" value={form.amount} onChange={ch} placeholder="e.g. 12000" min="0" />
            </div>
            <div className="fg"><label className="fl">Frequency</label>
              <select className="fi" name="frequency" value={form.frequency} onChange={ch}>
                {FREQ_OPTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">Category</label>
              <select className="fi" name="category" value={form.category} onChange={ch}>
                <option value="">— Select —</option>
                {favCats.length > 0 && <optgroup label="⭐ Favourites">{favCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</optgroup>}
                {otherCats.length > 0 && <optgroup label="All">{otherCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</optgroup>}
              </select>
            </div>
            <div className="fg"><label className="fl">Next Due Date</label>
              <input className="fi" type="date" name="nextDue" value={form.nextDue} onChange={ch} />
            </div>
          </div>
          <div className="fg"><label className="fl">Paid Via (optional)</label>
            <input className="fi" name="paidVia" value={form.paidVia} onChange={ch} placeholder="e.g. UPI, Credit Card, Auto-debit" />
          </div>
          <div className="fg"><label className="fl">Notes (optional)</label>
            <input className="fi" name="notes" value={form.notes} onChange={ch} placeholder="e.g. HDFC credit card auto-pay" />
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

// ─── Compare Tab ───────────────────────────────────────────
const COMPARE_MODES = [
  { key: '1y',  label: '1 Year',   months: 12 },
  { key: '6m',  label: '6 Months', months: 6 },
  { key: '3m',  label: '3 Months', months: 3 },
  { key: 'week',label: 'Weekly',   months: 0 },
];

function CompareTab({ showFixed, isFixedCat }) {
  const [mode, setMode] = useState('6m');
  const [data, setData] = useState([]);
  const [catData, setCatData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selCats, setSelCats] = useState(new Set());
  const [allCats, setAllCats] = useState([]);
  const [view, setView] = useState('bar'); // bar | table | category

  const now = new Date();
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const load = async () => {
    setLoading(true);
    try {
      if (mode === 'week') {
        // Weekly: last 12 weeks
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
          const weekItems = combined.filter(i => {
            const d = new Date(i.date);
            return d >= weekStart && d <= weekEnd;
          });
          const total = weekItems.reduce((s, i) => s + +i.amount, 0);
          // category breakdown
          const cats = {};
          weekItems.forEach(i => { cats[i.category] = (cats[i.category] || 0) + +i.amount; });
          weeks.push({ label, total, ...cats, _items: weekItems });
        }
        setData(weeks);
        // Build category list from all weeks
        const catSet = new Set(combined.map(i => i.category).filter(Boolean));
        setAllCats([...catSet].sort());
      } else {
        // Monthly comparison
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

  // Top categories by total spend across all periods
  const topCats = allCats
    .map(cat => ({ cat, total: data.reduce((s, d) => s + (d[cat] || 0), 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const displayCats = selCats.size > 0 ? topCats.filter(c => selCats.has(c.cat)) : topCats.slice(0, 6);

  const toggleCat = (cat) => setSelCats(s => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  // Summary stats
  const totals = data.map(d => d.total);
  const avg = totals.length > 0 ? totals.reduce((s, v) => s + v, 0) / totals.length : 0;
  const maxPeriod = data.reduce((m, d) => d.total > (m?.total || 0) ? d : m, null);
  const minPeriod = data.filter(d => d.total > 0).reduce((m, d) => d.total < (m?.total || Infinity) ? d : m, null);
  const trend = totals.length >= 2 ? totals[totals.length - 1] - totals[0] : 0;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, maxWidth: 220 }}>
        <div className="fw-700 mb-2">{label}</div>
        {payload.map((p, i) => (
          <div key={i} className="flex justify-between gap-3 mb-1">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="fw-700">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* Mode selector */}
      <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
        {COMPARE_MODES.map(m => (
          <button key={m.key} onClick={() => setMode(m.key)}
            style={{ padding: '7px 18px', borderRadius: 20, border: `2px solid ${mode === m.key ? 'var(--blue)' : 'var(--border2)'}`, background: mode === m.key ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: mode === m.key ? 'var(--blue)' : 'var(--t2)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {m.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {['bar','table','category'].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${view === v ? 'var(--blue)' : 'var(--border2)'}`, background: view === v ? 'rgba(77,158,255,.1)' : 'var(--bg3)', color: view === v ? 'var(--blue)' : 'var(--t3)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {v === 'bar' ? '📊 Chart' : v === 'table' ? '📋 Table' : '🗂️ By Category'}
            </button>
          ))}
        </div>
      </div>

      {!showFixed && (
        <div style={{ background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'var(--orange)', fontWeight:700 }}>
          🔀 Variable only — Fixed (House Rent, RD, Gold) excluded from all comparisons
        </div>
      )}
      {loading ? <div className="spin-center"><div className="spin spin-lg" /></div> : (
        <>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Average', val: fmt(avg), c: 'var(--blue)', icon: '📊' },
              { label: 'Highest', val: maxPeriod ? `${fmt(maxPeriod.total)} (${maxPeriod.label})` : '—', c: 'var(--red)', icon: '📈' },
              { label: 'Lowest', val: minPeriod ? `${fmt(minPeriod.total)} (${minPeriod.label})` : '—', c: 'var(--green)', icon: '📉' },
              { label: 'Trend', val: `${trend >= 0 ? '+' : ''}${fmt(trend)}`, c: trend <= 0 ? 'var(--green)' : 'var(--red)', icon: trend <= 0 ? '✅' : '⚠️' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${s.c}` }}>
                <div className="fs-11 text-muted">{s.icon} {s.label}</div>
                <div className="fw-800 fs-13 mt-1" style={{ color: s.c }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* ── BAR CHART VIEW ── */}
          {view === 'bar' && (
            <div className="card mb-4">
              <div className="card-title">💰 Total Expenses — {COMPARE_MODES.find(m => m.key === mode)?.label} Comparison</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" name="Total Spend" radius={[6,6,0,0]} maxBarSize={48}>
                    {data.map((d, i) => (
                      <Cell key={i} fill={d.total > avg * 1.2 ? '#f43f5e' : d.total < avg * 0.8 ? '#22c55e' : '#4d9eff'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Average line legend */}
              <div className="flex gap-4 mt-2" style={{ flexWrap: 'wrap', fontSize: 11, color: 'var(--t3)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#22c55e', display: 'inline-block' }} /> Below avg</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#4d9eff', display: 'inline-block' }} /> Near avg</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#f43f5e', display: 'inline-block' }} /> Above avg</span>
                <span style={{ marginLeft: 'auto' }}>Avg: <strong>{fmt(avg)}</strong></span>
              </div>
            </div>
          )}

          {/* ── TABLE VIEW ── */}
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
                      <th>Top Category</th>
                      <th style={{ textAlign: 'right' }}>Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((d, i) => {
                      const vsAvg = d.total - avg;
                      const vsPrev = i > 0 ? d.total - data[i-1].total : null;
                      const topCat = allCats.map(c => ({ c, v: d[c] || 0 })).sort((a,b) => b.v - a.v)[0];
                      return (
                        <tr key={i} style={{ background: d.total > avg * 1.2 ? 'rgba(244,63,94,.04)' : d.total < avg * 0.8 ? 'rgba(34,197,94,.04)' : 'transparent' }}>
                          <td className="fw-700">{d.label}</td>
                          <td style={{ textAlign: 'right' }}><span className="amt fw-800">{fmt(d.total)}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={`fw-700 fs-12 ${vsAvg <= 0 ? 'amt-g' : 'amt-r'}`}>
                              {vsAvg >= 0 ? '+' : ''}{fmt(vsAvg)}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {vsPrev !== null
                              ? <span className={`fw-700 fs-12 ${vsPrev <= 0 ? 'amt-g' : 'amt-r'}`}>{vsPrev >= 0 ? '+' : ''}{fmt(vsPrev)}</span>
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
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── CATEGORY VIEW ── */}
          {view === 'category' && (
            <div>
              {/* Category chips */}
              <div className="card mb-3">
                <div className="fs-13 fw-700 mb-2">Filter Categories <span className="text-muted fw-400">(top 12 by spend)</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button onClick={() => setSelCats(new Set())}
                    style={{ padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${selCats.size === 0 ? 'var(--blue)' : 'var(--border2)'}`, background: selCats.size === 0 ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: selCats.size === 0 ? 'var(--blue)' : 'var(--t3)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    All Top 6
                  </button>
                  {topCats.map((c, i) => (
                    <button key={c.cat} onClick={() => toggleCat(c.cat)}
                      style={{ padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${selCats.has(c.cat) ? PALETTE[i % PALETTE.length] : 'var(--border2)'}`, background: selCats.has(c.cat) ? PALETTE[i % PALETTE.length] + '20' : 'var(--bg3)', color: selCats.has(c.cat) ? PALETTE[i % PALETTE.length] : 'var(--t2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {c.cat} · {fmt(c.total)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stacked bar chart by category */}
              <div className="card mb-4">
                <div className="card-title">🗂️ Category Breakdown by Period</div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} width={48} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {displayCats.map((c, i) => (
                      <Bar key={c.cat} dataKey={c.cat} stackId="a" fill={PALETTE[topCats.findIndex(t => t.cat === c.cat) % PALETTE.length]} maxBarSize={52} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Category comparison table */}
              <div className="card">
                <div className="card-title">📊 Category × Period Table</div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Category</th>
                        {data.map((d, i) => <th key={i} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{d.label}</th>)}
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right' }}>Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayCats.map((c, ci) => {
                        const vals = data.map(d => d[c.cat] || 0);
                        const catTotal = vals.reduce((s, v) => s + v, 0);
                        const catAvg = vals.length > 0 ? catTotal / vals.length : 0;
                        const maxVal = Math.max(...vals);
                        return (
                          <tr key={c.cat}>
                            <td>
                              <div className="flex items-center gap-2">
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE[topCats.findIndex(t => t.cat === c.cat) % PALETTE.length], flexShrink: 0 }} />
                                <span className="fw-600 fs-13">{c.cat}</span>
                              </div>
                            </td>
                            {vals.map((v, i) => (
                              <td key={i} style={{ textAlign: 'right' }}>
                                <div>
                                  <span className={`fw-700 fs-12 ${v === maxVal && v > 0 ? 'amt-r' : v === 0 ? 'text-muted' : ''}`}>{v > 0 ? fmt(v) : '—'}</span>
                                  {v > 0 && <div style={{ background: PALETTE[ci % PALETTE.length] + '30', borderRadius: 3, height: 3, width: `${Math.max(8, (v / maxVal) * 60)}px`, marginLeft: 'auto', marginTop: 3 }} />}
                                </div>
                              </td>
                            ))}
                            <td style={{ textAlign: 'right' }}><span className="amt fw-800">{fmt(catTotal)}</span></td>
                            <td style={{ textAlign: 'right' }} className="text-muted fs-12">{fmt(catAvg)}</td>
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
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [sortOrder, setSortOrder] = useState('desc');
  const [sortField, setSortField] = useState('date');
  const [tab, setTab] = useState('list'); // list | percent | groups
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);
  const [showFixed, setShowFixed] = useState(true); // global: true=all, false=variable only

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exp, c] = await Promise.all([expenseService.getAll({ month, year, category: catFilter || undefined, search: search || undefined }), categoryService.getAll('expense')]);
      setItems(exp); setCats(c); setSelected(new Set());
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [month, year, catFilter, search]);

  useEffect(() => { const t = setTimeout(load, search ? 400 : 0); return () => clearTimeout(t); }, [load]);

  const save = async data => {
    try {
      if (edit) { await expenseService.update(edit.id, data); toast.success('Updated!'); }
      else { await expenseService.create(data); toast.success('Expense added!'); }
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
        await expenseService.create({ date: parseDate(row.date || row['Date'] || today()), category: row.category || row['Category'] || 'Grocery', itemName: row.item || row['Item'] || row.itemName || 'Imported', amount, notes: row.notes || row['Notes'] || '' });
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
    let valA = sortField === 'amount' ? +a.amount : new Date(a.date).getTime();
    let valB = sortField === 'amount' ? +b.amount : new Date(b.date).getTime();
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
          <MonthYearFilter month={month} year={year} setMonth={setMonth} setYear={setYear} />
          <label className="btn btn-secondary btn-sm" style={{ cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
            {importing ? <><span className="spin" /> Importing...</> : '⬆️ Import CSV'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} disabled={importing} />
          </label>
          <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(items.map(i => ({ date: fmtDate(i.date), category: i.category, paidVia: i.paidVia || '', amount: i.amount, notes: i.notes || '' })), 'expenses.csv')}>⬇️ Export</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>+ Add</button>
        </div>
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
          { key: 'compare',   label: '🔀 Compare' },
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
              : <div className="tbl-wrap"><table className="tbl" style={{ fontSize: 14 }}>
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
                    <th style={{ textAlign: 'center', fontSize: 14 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map(i => (
                    <tr key={i.id} style={{ background: selected.has(i.id) ? 'rgba(77,158,255,.07)' : 'transparent' }}>
                      <td>
                        <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSelect(i.id)}
                          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--blue)' }} />
                      </td>
                      <td style={{ fontSize: 14, fontFamily: 'monospace', color: 'var(--text)', fontWeight: 600 }}>{fmtDate(i.date)}</td>
                      <td><div className="flex items-center gap-1"><span className="badge badge-r" style={{ fontSize: 13, padding: '4px 12px' }}>{i.category}</span>{isFixedCat(i.category) && <span title="Fixed expense" style={{ fontSize: 10, background: 'rgba(249,115,22,.15)', color: 'var(--orange)', borderRadius: 20, padding: '1px 6px', fontWeight: 700 }}>📌</span>}</div></td>
                      <td style={{ textAlign: 'right' }}><span className="amt amt-r" style={{ fontSize: 15, fontWeight: 800 }}>{fmt(i.amount)}</span></td>
                      <td><span style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 13, fontWeight: 700, color: 'var(--blue)', whiteSpace: 'nowrap' }}>{i.paidVia || '—'}</span></td>
                      <td style={{ fontSize: 14 }}>
                        {i.notes
                          ? <NoteCell note={i.notes} />
                          : <span style={{ color: 'var(--t3)', fontSize: 14 }}>—</span>}
                      </td>
                      <td>
                        <div className="actions" style={{ justifyContent: 'center' }}>
                          <button className="btn-icon" onClick={() => { setEdit(i); setModal(true); }}>✏️</button>
                          <button className="btn-icon" onClick={() => setDelId(i.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td /><td colSpan={2} className="text-muted" style={{ padding: '11px 14px', fontSize: 14 }}>TOTAL ({sortedItems.length} records){selected.size > 0 && ` • ${selected.size} selected`}</td>
                    <td style={{ textAlign: 'right', padding: '11px 14px' }}><span className="amt amt-r fw-800" style={{ fontSize: 15 }}>{fmt(total)}</span></td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table></div>}
        </>
      )}

      {tab === 'recurring' && <RecurringTab cats={cats} showFixed={showFixed} isFixedCat={isFixedCat} />}
      {tab === 'daily'     && <DailySpendingTab items={filteredByToggle} showFixed={showFixed} />}
      {tab === 'percent'   && <PercentageTab items={filteredByToggle} showFixed={showFixed} isFixedCat={isFixedCat} allItems={items} />}
      {tab === 'groups'    && <GroupSummaryTab items={filteredByToggle} showFixed={showFixed} />}
      {tab === 'compare'   && <CompareTab showFixed={showFixed} isFixedCat={isFixedCat} />}

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