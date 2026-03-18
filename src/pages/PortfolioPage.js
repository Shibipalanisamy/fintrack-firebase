import { useState, useEffect, useRef } from 'react';
import { investmentService, stockMasterService, dividendService, brokerService } from '../utils/dbService';
import { fmt, fmtDate, fmtDateInput, today, exportCSV, importCSV, PALETTE } from '../utils/helpers';
import { fetchLivePrices, setAppsScriptUrl } from '../utils/stockPriceService';
import { Modal, ConfirmDelete } from '../components/UI';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts';
import toast from 'react-hot-toast';

// ─── Symbol Dropdown ───────────────────────────────────────
function SymbolDropdown({ stocks, value, onChange, onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value || '');
  const ref = useRef(null);
  useEffect(() => { setSearch(value || ''); }, [value]);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const filtered = stocks.filter(s => s.symbol.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10);
  const select = (stock) => { setSearch(stock.symbol); onChange(stock.symbol); onSelect(stock); setOpen(false); };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input className="fi" style={{ fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase' }} placeholder="Search symbol e.g. TCS" value={search} onChange={e => { setSearch(e.target.value.toUpperCase()); onChange(e.target.value.toUpperCase()); setOpen(true); }} onFocus={() => setOpen(true)} autoComplete="off" />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.3)', maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
          {filtered.map(s => (<div key={s.id} onClick={() => select(s)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: 'var(--blue)', minWidth: 90 }}>{s.symbol}</span>
            <div><div className="fs-13 fw-600">{s.name}</div>{s.sector && <div className="fs-11 text-muted">{s.sector}</div>}</div>
          </div>))}
        </div>
      )}
    </div>
  );
}

// ─── Broker Dropdown ───────────────────────────────────────
function BrokerDropdown({ brokers, value, onChange }) {
  if (brokers.length === 0) {
    return (
      <div style={{ padding: '10px 0', color: 'var(--t3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="spin" style={{ width: 14, height: 14, borderWidth: 2 }} />
        Loading brokers...
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6, marginTop: 4 }}>
      {brokers.map(b => (
        <button key={b.id} type="button" onClick={() => onChange(b.name)}
          style={{ padding: '8px 10px', borderRadius: 10, border: `2px solid ${value === b.name ? b.color : 'var(--border2)'}`, background: value === b.name ? b.color + '18' : 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s' }}>
          <span style={{ fontSize: 16 }}>{b.icon || '🏦'}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: value === b.name ? b.color : 'var(--t2)' }}>{b.name}</span>
          {value === b.name && <span style={{ marginLeft: 'auto', fontSize: 10, color: b.color }}>✓</span>}
        </button>
      ))}
      <button type="button" onClick={() => onChange('')}
        style={{ padding: '8px 10px', borderRadius: 10, border: `2px solid ${!value ? 'var(--blue)' : 'var(--border2)'}`, background: !value ? 'rgba(77,158,255,.1)' : 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}>❓</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: !value ? 'var(--blue)' : 'var(--t3)' }}>Not Set</span>
      </button>
    </div>
  );
}

// ─── Investment Form ───────────────────────────────────────
function InvForm({ item, stocks, brokers, onSave, onSaveAndAnother, onClose }) {
  const BLANK = { purchaseDate: today(), stockName: '', symbol: '', quantity: '', purchasePrice: '', currentPrice: '', brokerName: '', brokerage: '' };
  const [f, setF] = useState({
    ...BLANK,
    ...(item ? { ...item, purchaseDate: fmtDateInput(item.purchaseDate), quantity: String(item.quantity || ''), purchasePrice: String(item.purchasePrice || ''), currentPrice: String(item.currentPrice || item.purchasePrice || ''), brokerage: String(item.brokerage || '') } : {})
  });
  const [brokeragePct, setBrokeragePct] = useState('0.5');
  const [savingMode, setSavingMode] = useState(''); // '' | 'save' | 'another'
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));

  const handlePctChange = (pct) => {
    setBrokeragePct(pct);
    const qty = parseFloat(f.quantity) || 0;
    const price = parseFloat(f.purchasePrice) || 0;
    const total = qty * price;
    if (total > 0 && pct !== '') {
      setF(p => ({ ...p, brokerage: ((total * parseFloat(pct)) / 100).toFixed(2) }));
    } else if (pct === '') {
      setF(p => ({ ...p, brokerage: '' }));
    }
  };

  const chWithRecalc = e => {
    setF(p => ({ ...p, [e.target.name]: e.target.value }));
    if (brokeragePct !== '' && parseFloat(brokeragePct) > 0) {
      const qty = parseFloat(e.target.name === 'quantity' ? e.target.value : f.quantity) || 0;
      const price = parseFloat(e.target.name === 'purchasePrice' ? e.target.value : f.purchasePrice) || 0;
      const total = qty * price;
      if (total > 0) {
        setF(p => ({ ...p, [e.target.name]: e.target.value, brokerage: ((total * parseFloat(brokeragePct)) / 100).toFixed(2) }));
      }
    }
  };

  const handleStockSelect = (stock) => setF(p => ({ ...p, symbol: stock.symbol, stockName: stock.name }));

  const validate = () => {
    if (!f.symbol) { toast.error('Select a Symbol'); return false; }
    if (!f.quantity || parseFloat(f.quantity) <= 0) { toast.error('Enter Quantity'); return false; }
    if (!f.purchasePrice || parseFloat(f.purchasePrice) <= 0) { toast.error('Enter Buy Price'); return false; }
    return true;
  };

  const buildPayload = () => {
    const qty = parseFloat(f.quantity);
    const buyPrice = parseFloat(f.purchasePrice);
    const curPrice = f.currentPrice && f.currentPrice !== '' ? parseFloat(f.currentPrice) : buyPrice;
    // Use symbol as stockName fallback if not auto-filled
    const stockName = f.stockName || f.symbol;
    return { ...f, stockName, quantity: qty, purchasePrice: buyPrice, currentPrice: curPrice, brokerage: parseFloat(f.brokerage) || 0 };
  };

  const handleSave = async e => {
    e.preventDefault();
    if (!validate()) return;
    setSavingMode('save');
    try {
      await onSave(buildPayload());
      // parent closes modal — no state update needed
    } catch {
      setSavingMode('');
    }
  };

  const handleSaveAndAnother = async () => {
    if (!validate()) return;
    setSavingMode('another');
    try {
      await onSaveAndAnother(buildPayload());
      // Reset form, keep broker + date
      setF({ ...BLANK, brokerName: f.brokerName, purchaseDate: f.purchaseDate });
      setBrokeragePct('0.5');
    } catch {
      // keep form as-is on error
    } finally {
      setSavingMode('');
    }
  };

  const selectedBroker = brokers.find(b => b.name === f.brokerName);
  const totalVal = (parseFloat(f.quantity) || 0) * (parseFloat(f.purchasePrice) || 0);
  const brokerageAmt = parseFloat(f.brokerage) || 0;
  const totalCost = totalVal + brokerageAmt;
  const isSaving = savingMode !== '';

  return (
    <form onSubmit={handleSave}>
      {/* Broker */}
      <div className="fg">
        <label className="fl">Broker {selectedBroker && <span style={{ color: selectedBroker.color, fontSize: 11, fontWeight: 700 }}>● {selectedBroker.name}</span>}</label>
        <BrokerDropdown brokers={brokers} value={f.brokerName} onChange={val => setF(p => ({ ...p, brokerName: val }))} />
      </div>

      {/* Symbol — auto-fills name silently */}
      <div className="fg">
        <label className="fl">Symbol {f.stockName && <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 600 }}>✓ {f.stockName}</span>}</label>
        <SymbolDropdown stocks={stocks} value={f.symbol} onChange={val => setF(p => ({ ...p, symbol: val }))} onSelect={handleStockSelect} />
      </div>

      <div className="frow">
        <div className="fg"><label className="fl">Purchase Date</label><input className="fi" type="date" name="purchaseDate" value={f.purchaseDate} onChange={ch} required /></div>
        <div className="fg"><label className="fl">Quantity</label><input className="fi" type="number" name="quantity" value={f.quantity} onChange={chWithRecalc} step="0.001" min="0" placeholder="e.g. 10" /></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="fl">Buy Price (Rs)</label><input className="fi" type="number" name="purchasePrice" value={f.purchasePrice} onChange={chWithRecalc} step="0.01" min="0" placeholder="e.g. 500" /></div>
        <div className="fg"><label className="fl">Current Price (Rs) <span className="text-muted fs-11">optional</span></label><input className="fi" type="number" name="currentPrice" value={f.currentPrice} onChange={ch} step="0.01" min="0" placeholder="Leave blank = buy price" /></div>
      </div>

      {/* Brokerage */}
      <div style={{ background: 'rgba(77,158,255,.06)', border: '1.5px solid rgba(77,158,255,.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
        <div className="flex items-center gap-2 mb-2">
          <span>💳</span>
          <span className="fw-700 fs-13">Brokerage / Commission</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>% → auto-calculates Rs</span>
        </div>
        <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
          {['0', '0.1', '0.25', '0.5', '1'].map(pct => (
            <button key={pct} type="button" onClick={() => handlePctChange(pct)}
              style={{ padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${brokeragePct === pct ? 'var(--blue)' : 'var(--border2)'}`, background: brokeragePct === pct ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: brokeragePct === pct ? 'var(--blue)' : 'var(--t2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {pct === '0' ? 'Free' : `${pct}%`}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <div style={{ position: 'relative', width: 100, flexShrink: 0 }}>
            <input type="number" value={brokeragePct} onChange={e => handlePctChange(e.target.value)}
              step="0.01" min="0" placeholder="0.5"
              style={{ width: '100%', padding: '9px 26px 9px 10px', borderRadius: 8, border: '1.5px solid var(--blue)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, fontWeight: 700, outline: 'none', fontFamily: 'inherit' }} />
            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 800, color: 'var(--blue)' }}>%</span>
          </div>
          <span style={{ color: 'var(--t3)', fontSize: 18 }}>→</span>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--t3)' }}>Rs</span>
            <input className="fi" type="number" name="brokerage" value={f.brokerage}
              onChange={e => { ch(e); setBrokeragePct(''); }} step="0.01" min="0" placeholder="0.00" style={{ paddingLeft: 30, fontWeight: 700 }} />
          </div>
        </div>
        {totalVal > 0 && (
          <div style={{ marginTop: 8, background: 'var(--bg3)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
            {brokeragePct && parseFloat(brokeragePct) > 0
              ? <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmt(totalVal)} × {brokeragePct}% = <strong>Rs {f.brokerage || '0'}</strong></span>
              : <span className="text-muted">No brokerage</span>}
          </div>
        )}
      </div>

      {/* Live summary */}
      {totalVal > 0 && (
        <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <div className="fs-12 fw-700 text-muted mb-2">📊 Summary</div>
          <div className="flex justify-between fs-12 mb-1"><span className="text-muted">Qty × Buy Price</span><span className="fw-700">{f.quantity} × {fmt(parseFloat(f.purchasePrice))} = {fmt(totalVal)}</span></div>
          {brokerageAmt > 0 && <div className="flex justify-between fs-12 mb-1"><span className="text-muted">+ Brokerage</span><span className="fw-700 amt-r">+ {fmt(brokerageAmt)}</span></div>}
          <div className="flex justify-between fs-13" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
            <span className="fw-800">Total Cost</span>
            <span className="fw-900" style={{ color: 'var(--blue)' }}>{fmt(totalCost)}</span>
          </div>
          {f.currentPrice && parseFloat(f.currentPrice) > 0 && (
            <div className="flex justify-between fs-12 mt-1">
              <span className="text-muted">Current Value</span>
              <span className={`fw-700 ${parseFloat(f.currentPrice) >= parseFloat(f.purchasePrice) ? 'amt-g' : 'amt-r'}`}>{fmt((parseFloat(f.quantity) || 0) * parseFloat(f.currentPrice))}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer — visually distinct buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        {(() => {
          const isSaving = savingMode !== '';
          return (<>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>✕ Cancel</button>
            {!item && onSaveAndAnother && (
              <button type="button" disabled={isSaving}
                onClick={handleSaveAndAnother}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '2px solid var(--purple)', background: savingMode === 'another' ? 'rgba(167,139,250,.2)' : 'rgba(167,139,250,.08)', color: 'var(--purple)', fontWeight: 800, fontSize: 13, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
                {savingMode === 'another' ? <><span className="spin" style={{ width: 14, height: 14, borderWidth: 2, borderColor: 'var(--purple)', borderTopColor: 'transparent' }} /> Saving...</> : '➕ Save & Add Another'}
              </button>
            )}
            <button type="submit" disabled={isSaving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 10, border: 'none', background: item ? 'var(--orange)' : 'var(--green)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {savingMode === 'save' ? <><span className="spin" style={{ width: 14, height: 14, borderWidth: 2, borderColor: '#fff', borderTopColor: 'transparent' }} /> Saving...</> : item ? '✏️ Update Stock' : '✅ Save Stock'}
            </button>
          </>);
        })()}
      </div>
    </form>
  );
}

// ─── Inline Price Edit ─────────────────────────────────────
function InlinePriceEdit({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value || ''));
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setVal(String(value || '')); }, [value, editing]);
  const save = async () => {
    const n = parseFloat(val); if (!n || n <= 0) { toast.error('Enter valid price'); return; }
    setSaving(true); await onSave(n); setSaving(false); setEditing(false);
  };
  if (!editing) return (
    <div className="flex items-center gap-1" style={{ justifyContent: 'flex-end' }}>
      <span className="font-mono fs-12">{fmt(value)}</span>
      <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--blue)', padding: '0 2px' }} title="Update price">✏️</button>
    </div>
  );
  return (
    <div className="flex items-center gap-1" style={{ justifyContent: 'flex-end' }}>
      <input autoFocus type="number" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} style={{ width: 90, padding: '4px 6px', borderRadius: 6, border: '2px solid var(--blue)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'monospace' }} step="0.01" min="0" />
      <button onClick={save} disabled={saving} style={{ background: 'var(--green)', border: 'none', borderRadius: 5, padding: '4px 7px', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{saving ? '...' : '✓'}</button>
      <button onClick={() => setEditing(false)} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 5, padding: '4px 7px', color: 'var(--t3)', cursor: 'pointer', fontSize: 11 }}>✕</button>
    </div>
  );
}

// ─── Broker Report Tab ─────────────────────────────────────
function BrokerReportTab({ items, brokers }) {
  const now = new Date();
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [checkedMonths, setCheckedMonths] = useState(new Set([now.getMonth() + 1]));
  const [selBroker, setSelBroker] = useState('');
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years = [2022,2023,2024,2025,2026].filter(y => y <= now.getFullYear());

  const toggleMonth = m => setCheckedMonths(s => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n; });

  // Filter by year + checked months
  const monthItems = items.filter(i => {
    const d = new Date(i.purchaseDate);
    const matchYear = d.getFullYear() === selYear;
    const matchMonth = checkedMonths.size === 0 || checkedMonths.has(d.getMonth() + 1);
    const matchBroker = !selBroker || i.brokerName === selBroker;
    return matchYear && matchMonth && matchBroker;
  });

  const getBrokerColor = (name) => brokers.find(b => b.name === name)?.color || '#94a3b8';
  const getBrokerIcon = (name) => brokers.find(b => b.name === name)?.icon || '🏦';

  // All-time per broker
  const allBrokerMap = {};
  items.forEach(i => {
    const k = i.brokerName || 'Not Set';
    if (!allBrokerMap[k]) allBrokerMap[k] = { name: k, invested: 0, brokerage: 0, trades: 0, currentValue: 0 };
    allBrokerMap[k].invested += i.totalInvested;
    allBrokerMap[k].brokerage += parseFloat(i.brokerage) || 0;
    allBrokerMap[k].trades++;
    allBrokerMap[k].currentValue += i.currentValue;
  });

  // Per broker summary for filtered period
  const brokerMap = {};
  monthItems.forEach(i => {
    const k = i.brokerName || 'Not Set';
    if (!brokerMap[k]) brokerMap[k] = { name: k, invested: 0, brokerage: 0, trades: 0, symbols: {} };
    brokerMap[k].invested += i.totalInvested;
    brokerMap[k].brokerage += parseFloat(i.brokerage) || 0;
    brokerMap[k].trades++;
    const sym = i.symbol || i.stockName;
    if (!brokerMap[k].symbols[sym]) brokerMap[k].symbols[sym] = { sym, name: i.stockName, qty: 0, invested: 0 };
    brokerMap[k].symbols[sym].qty += i.quantity;
    brokerMap[k].symbols[sym].invested += i.totalInvested;
  });

  // Monthly bar chart data — last 6 months per broker
  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1, y = d.getFullYear();
    const entry = { month: `${MONTHS[m-1]} ${String(y).slice(2)}` };
    brokers.forEach(b => {
      entry[b.name] = items.filter(item => {
        const id = new Date(item.purchaseDate);
        return id.getMonth() + 1 === m && id.getFullYear() === y && item.brokerName === b.name;
      }).reduce((s, item) => s + item.totalInvested, 0);
    });
    last6Months.push(entry);
  }

  const totalBrokerage = items.reduce((s, i) => s + (parseFloat(i.brokerage) || 0), 0);
  const uniqueBrokerNames = [...new Set(items.map(i => i.brokerName).filter(Boolean))];

  if (items.length === 0) return <div className="card"><div className="empty"><div className="empty-icon">🏦</div><div className="empty-title">No data</div><div className="empty-sub">Add stocks with broker info to see report</div></div></div>;

  return (
    <div>
      {/* All-time broker summary cards */}
      <div className="card mb-4">
        <div className="card-title">🏦 All-Time by Broker</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
          {Object.values(allBrokerMap).sort((a, b) => b.invested - a.invested).map((b) => {
            const color = getBrokerColor(b.name);
            const icon = getBrokerIcon(b.name);
            const pnl = b.currentValue - b.invested;
            return (
              <div key={b.name} onClick={() => setSelBroker(selBroker === b.name ? '' : b.name)}
                style={{ background: selBroker === b.name ? color + '20' : color + '10', border: `1.5px solid ${selBroker === b.name ? color : color + '40'}`, borderRadius: 12, padding: 14, cursor: 'pointer', transition: 'all .15s' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <span className="fw-800 fs-13" style={{ color }}>{b.name}</span>
                  {selBroker === b.name && <span style={{ marginLeft: 'auto', fontSize: 10, background: color, color: '#fff', borderRadius: 20, padding: '1px 7px', fontWeight: 700 }}>SELECTED</span>}
                </div>
                <div className="fs-11 text-muted mb-1">Invested</div>
                <div className="fw-800 fs-14 mb-2">{fmt(b.invested)}</div>
                <div className="flex justify-between fs-11 mb-1"><span className="text-muted">P&L</span><span className={`fw-700 ${pnl >= 0 ? 'amt-g' : 'amt-r'}`}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</span></div>
                <div className="flex justify-between fs-11 mb-1"><span className="text-muted">Brokerage</span><span className="fw-700 amt-r">{fmt(b.brokerage)}</span></div>
                <div className="flex justify-between fs-11"><span className="text-muted">Trades</span><span className="fw-700">{b.trades}</span></div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span className="fw-700 fs-13">Total Brokerage Paid (all time)</span>
          <span className="fw-800 amt-r fs-14">{fmt(totalBrokerage)}</span>
        </div>
      </div>

      {/* Month filter card */}
      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>📅 Monthly Report</div>
          <div className="flex items-center gap-2">
            <select className="fs btn-sm" value={selYear} onChange={e => { setSelYear(+e.target.value); setCheckedMonths(new Set()); }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => setCheckedMonths(new Set(MONTHS.map((_, i) => i + 1)))}>All</button>
            {checkedMonths.size > 0 && <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => setCheckedMonths(new Set())}>✕</button>}
            {selBroker && <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => setSelBroker('')}>✕ {selBroker}</button>}
          </div>
        </div>

        {/* Month chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {MONTHS.map((m, i) => {
            const mNum = i + 1;
            const isChecked = checkedMonths.has(mNum);
            const count = items.filter(item => { const d = new Date(item.purchaseDate); return d.getFullYear() === selYear && d.getMonth() + 1 === mNum && (!selBroker || item.brokerName === selBroker); }).length;
            return (
              <button key={m} type="button" onClick={() => count > 0 && toggleMonth(mNum)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${isChecked ? 'var(--blue)' : 'var(--border2)'}`, background: isChecked ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: isChecked ? 'var(--blue)' : count > 0 ? 'var(--t2)' : 'var(--t3)', fontSize: 12, fontWeight: 700, cursor: count > 0 ? 'pointer' : 'default', opacity: count === 0 ? 0.4 : 1 }}>
                <span style={{ width: 13, height: 13, borderRadius: 3, border: `2px solid ${isChecked ? 'var(--blue)' : 'var(--border2)'}`, background: isChecked ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isChecked && <span style={{ color: '#fff', fontSize: 8, fontWeight: 900 }}>✓</span>}
                </span>
                {m} {count > 0 && <span style={{ fontSize: 10, color: isChecked ? 'var(--blue)' : 'var(--t3)' }}>{count}</span>}
              </button>
            );
          })}
        </div>

        {monthItems.length === 0
          ? <div className="text-muted fs-13" style={{ textAlign: 'center', padding: 20 }}>No trades for selected period{selBroker ? ` · ${selBroker}` : ''}</div>
          : (
            <>
              {/* Period stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Invested', val: fmt(monthItems.reduce((s, i) => s + i.totalInvested, 0)), c: 'var(--blue)' },
                  { label: 'Trades', val: monthItems.length, c: 'var(--purple)' },
                  { label: 'Brokerage', val: fmt(monthItems.reduce((s, i) => s + (parseFloat(i.brokerage) || 0), 0)), c: 'var(--red)' },
                  { label: 'Unique Stocks', val: [...new Set(monthItems.map(i => i.symbol || i.stockName))].length, c: 'var(--green)' },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', borderLeft: `3px solid ${s.c}` }}>
                    <div className="fs-11 text-muted">{s.label}</div>
                    <div className="fw-800 fs-14" style={{ color: s.c }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Per broker — combined symbol table */}
              {Object.values(brokerMap).map(b => {
                const color = getBrokerColor(b.name);
                const icon = getBrokerIcon(b.name);
                const symList = Object.values(b.symbols).sort((a, z) => z.invested - a.invested);
                return (
                  <div key={b.name} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: color + '10', border: `1px solid ${color}30`, borderRadius: '10px 10px 0 0', padding: '10px 14px' }}>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 18 }}>{icon}</span>
                        <div>
                          <div className="fw-700 fs-13" style={{ color }}>{b.name}</div>
                          <div className="fs-11 text-muted">{b.trades} trades · {symList.length} unique stocks</div>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div style={{ textAlign: 'right' }}><div className="fs-11 text-muted">Invested</div><div className="fw-800 fs-13">{fmt(b.invested)}</div></div>
                        <div style={{ textAlign: 'right' }}><div className="fs-11 text-muted">Brokerage</div><div className="fw-800 fs-13 amt-r">{fmt(b.brokerage)}</div></div>
                      </div>
                    </div>
                    {/* Combined stock table */}
                    <div className="tbl-wrap" style={{ borderRadius: '0 0 10px 10px', border: `1px solid ${color}30`, borderTop: 'none' }}>
                      <table className="tbl" style={{ marginBottom: 0 }}>
                        <thead><tr>
                          <th>Symbol</th><th>Stock Name</th>
                          <th style={{ textAlign: 'right' }}>Total Qty</th>
                          <th style={{ textAlign: 'right' }}>Total Invested</th>
                          <th style={{ textAlign: 'right' }}>Avg Buy Price</th>
                        </tr></thead>
                        <tbody>{symList.map(s => (
                          <tr key={s.sym}>
                            <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12, background: 'var(--bg3)', padding: '2px 7px', borderRadius: 5, color }}>{s.sym.replace(/^NSE:/i, '')}</span></td>
                            <td className="fs-12 fw-600">{s.name}</td>
                            <td style={{ textAlign: 'right' }} className="font-mono fs-12">{s.qty}</td>
                            <td style={{ textAlign: 'right' }}><span className="amt">{fmt(s.invested)}</span></td>
                            <td style={{ textAlign: 'right' }} className="font-mono fs-12">{fmt(s.qty > 0 ? s.invested / s.qty : 0)}</td>
                          </tr>
                        ))}</tbody>
                        <tfoot><tr>
                          <td colSpan={3} className="text-muted fs-12" style={{ padding: '8px 14px' }}>TOTAL</td>
                          <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="amt fw-800">{fmt(b.invested)}</span></td>
                          <td />
                        </tr></tfoot>
                      </table>
                    </div>
                  </div>
                );
              })}
            </>
          )}
      </div>

      {/* 6-month bar chart */}
      <div className="card">
        <div className="card-title">📊 Monthly Investment by Broker (Last 6 Months)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={last6Months}>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, fontSize: 12 }} />
            {brokers.map(b => <Bar key={b.name} dataKey={b.name} fill={b.color || '#94a3b8'} name={b.name} radius={[3,3,0,0]} maxBarSize={18} />)}
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── 52-Week Analysis Tab ──────────────────────────────────
function PriceAnalysisTab({ items }) {
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState(new Set());

  const stockMap = {};
  items.forEach(i => {
    const sym = i.symbol || i.stockName;
    if (!stockMap[sym]) stockMap[sym] = { symbol: i.symbol, name: i.stockName, prices: [], quantities: 0, currentPrice: 0 };
    stockMap[sym].prices.push({ price: i.purchasePrice, date: new Date(i.purchaseDate) });
    stockMap[sym].quantities += i.quantity;
    if (i.currentPrice > stockMap[sym].currentPrice) stockMap[sym].currentPrice = i.currentPrice;
  });
  const now = new Date();
  const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
  const allRows = Object.entries(stockMap).map(([sym, d]) => {
    const yearPrices = d.prices.filter(p => p.date >= oneYearAgo).map(p => p.price);
    const month30Prices = d.prices.filter(p => p.date >= thirtyDaysAgo).map(p => p.price);
    const allPrices = d.prices.map(p => p.price);
    const w52High = yearPrices.length > 0 ? Math.max(...yearPrices) : null;
    const w52Low = yearPrices.length > 0 ? Math.min(...yearPrices) : null;
    const d30High = month30Prices.length > 0 ? Math.max(...month30Prices) : null;
    const d30Low = month30Prices.length > 0 ? Math.min(...month30Prices) : null;
    const avgBuy = allPrices.reduce((s, p) => s + p, 0) / allPrices.length;
    const cur = d.currentPrice || avgBuy;
    return { sym, name: d.name, qty: d.quantities, avgBuy, cur, w52High, w52Low, d30High, d30Low, pctFromLow: w52Low ? (((cur - w52Low) / w52Low) * 100).toFixed(1) : null, pctFromHigh: w52High ? (((cur - w52High) / w52High) * 100).toFixed(1) : null, buyCount: d.prices.length };
  });

  // Filter by search
  const searchFiltered = allRows.filter(r => !search || r.sym.toLowerCase().includes(search.toLowerCase()) || r.name.toLowerCase().includes(search.toLowerCase()));
  // If any checked, show only checked; else show all search results
  const rows = checked.size > 0 ? searchFiltered.filter(r => checked.has(r.sym)) : searchFiltered;

  const toggleCheck = sym => setChecked(s => { const n = new Set(s); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });
  const clearChecked = () => setChecked(new Set());

  if (items.length === 0) return <div className="card"><div className="empty"><div className="empty-icon">📊</div><div className="empty-title">No data</div></div></div>;

  return (
    <div>
      {/* Search + checkbox filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 12px', flex: 1, minWidth: 200 }}>
          <span>🔍</span>
          <input style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, flex: 1 }} placeholder="Search symbol or name..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}>✕</button>}
        </div>
        {checked.size > 0 && <button className="btn btn-secondary btn-sm" onClick={clearChecked}>✕ Clear {checked.size} selected</button>}
        <span className="fs-12 text-muted">{rows.length} of {allRows.length} stocks</span>
      </div>

      {/* Stock checkbox chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {searchFiltered.map(r => (
          <button key={r.sym} type="button" onClick={() => toggleCheck(r.sym)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${checked.has(r.sym) ? 'var(--blue)' : 'var(--border2)'}`, background: checked.has(r.sym) ? 'rgba(77,158,255,.15)' : 'var(--bg3)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: checked.has(r.sym) ? 'var(--blue)' : 'var(--t2)', fontFamily: 'monospace' }}>
            <span style={{ width: 13, height: 13, borderRadius: 3, border: `2px solid ${checked.has(r.sym) ? 'var(--blue)' : 'var(--border2)'}`, background: checked.has(r.sym) ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {checked.has(r.sym) && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
            </span>
            {r.sym}
          </button>
        ))}
      </div>

      <div style={{ background: 'rgba(77,158,255,.06)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12 }}>
        ℹ️ 52W and 30D High/Low are calculated from your actual <strong>buy price history</strong> in this app. Update current price (✏️) on Holdings tab for accurate P&L.
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Symbol</th><th>Name</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Avg Buy</th><th style={{ textAlign: 'right' }}>Current</th><th style={{ textAlign: 'center', background: 'rgba(34,197,94,.08)' }}>52W High</th><th style={{ textAlign: 'center', background: 'rgba(244,63,94,.08)' }}>52W Low</th><th style={{ textAlign: 'center', background: 'rgba(251,191,36,.08)' }}>30D High</th><th style={{ textAlign: 'center', background: 'rgba(251,191,36,.08)' }}>30D Low</th><th style={{ textAlign: 'center' }}>vs 52W Low</th><th style={{ textAlign: 'center' }}>vs 52W High</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.sym}>
              <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, background: 'var(--bg3)', padding: '3px 8px', borderRadius: 6, color: 'var(--blue)' }}>{r.sym}</span></td>
              <td className="fw-600 fs-12">{r.name}</td>
              <td style={{ textAlign: 'right' }} className="font-mono fs-12">{r.qty}</td>
              <td style={{ textAlign: 'right' }} className="font-mono fs-12">{fmt(r.avgBuy)}</td>
              <td style={{ textAlign: 'right' }}><span className={`font-mono fs-12 fw-700 ${r.cur > r.avgBuy ? 'amt-g' : 'amt-r'}`}>{fmt(r.cur)}</span></td>
              <td style={{ textAlign: 'center', background: 'rgba(34,197,94,.04)' }}>{r.w52High !== null ? <span className="fw-700 fs-12 amt-g">{fmt(r.w52High)}</span> : <span className="text-muted fs-11">—</span>}</td>
              <td style={{ textAlign: 'center', background: 'rgba(244,63,94,.04)' }}>{r.w52Low !== null ? <span className="fw-700 fs-12 amt-r">{fmt(r.w52Low)}</span> : <span className="text-muted fs-11">—</span>}</td>
              <td style={{ textAlign: 'center', background: 'rgba(251,191,36,.04)' }}>{r.d30High !== null ? <span className="fw-700 fs-12" style={{ color: '#f59e0b' }}>{fmt(r.d30High)}</span> : <span className="text-muted fs-11">—</span>}</td>
              <td style={{ textAlign: 'center', background: 'rgba(251,191,36,.04)' }}>{r.d30Low !== null ? <span className="fw-700 fs-12" style={{ color: '#d97706' }}>{fmt(r.d30Low)}</span> : <span className="text-muted fs-11">—</span>}</td>
              <td style={{ textAlign: 'center' }}>{r.pctFromLow !== null ? <span style={{ background: parseFloat(r.pctFromLow) >= 0 ? 'rgba(34,197,94,.15)' : 'rgba(244,63,94,.15)', color: parseFloat(r.pctFromLow) >= 0 ? 'var(--green)' : 'var(--red)', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{r.pctFromLow >= 0 ? '+' : ''}{r.pctFromLow}%</span> : '—'}</td>
              <td style={{ textAlign: 'center' }}>{r.pctFromHigh !== null ? <span style={{ background: parseFloat(r.pctFromHigh) >= 0 ? 'rgba(34,197,94,.15)' : 'rgba(244,63,94,.15)', color: parseFloat(r.pctFromHigh) >= 0 ? 'var(--green)' : 'var(--red)', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{parseFloat(r.pctFromHigh) >= 0 ? '+' : ''}{r.pctFromHigh}%</span> : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">📊 Buy Price Range Visual</div>
        <div style={{ display: 'grid', gap: 14 }}>
          {rows.filter(r => r.w52Low !== null && r.w52High !== null && r.w52Low !== r.w52High).map(r => {
            const range = r.w52High - r.w52Low;
            const curPct = Math.min(100, Math.max(0, ((r.cur - r.w52Low) / range) * 100));
            const avgPct = Math.min(100, Math.max(0, ((r.avgBuy - r.w52Low) / range) * 100));
            return (
              <div key={r.sym}>
                <div className="flex justify-between mb-1"><span className="fs-13 fw-700">{r.sym} <span className="text-muted fs-11 fw-400">{r.name}</span></span><span className="fs-12 text-muted">{fmt(r.w52Low)} — {fmt(r.w52High)}</span></div>
                <div style={{ position: 'relative', height: 20, background: 'linear-gradient(to right, rgba(244,63,94,.2), rgba(34,197,94,.2))', borderRadius: 10 }}>
                  <div style={{ position: 'absolute', left: `${curPct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: 'var(--blue)', border: '2px solid #fff', zIndex: 2 }} />
                  <div style={{ position: 'absolute', left: `${avgPct}%`, top: 0, bottom: 0, width: 2, background: '#fbbf24', zIndex: 1 }} />
                </div>
                <div className="flex justify-between fs-10 text-muted mt-1"><span>52W Low: {fmt(r.w52Low)}</span><span>🔵 Current · 🟡 Avg Buy</span><span>52W High: {fmt(r.w52High)}</span></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Holding Symbol Picker (like SymbolDropdown) ───────────
function HoldingSymbolPicker({ symbols, selected, onSelect }) {
  const [q, setQ] = useState('');
  const filtered = symbols.filter(s => !q || s.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '5px 10px', marginBottom: 6 }}>
        <span style={{ fontSize: 12 }}>🔍</span>
        <input style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12, flex: 1 }} placeholder="Search symbol..." value={q} onChange={e => setQ(e.target.value)} />
        {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 11 }}>✕</button>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 120, overflowY: 'auto' }}>
        {filtered.map(sym => (
          <button key={sym} type="button" onClick={() => { onSelect(sym); setQ(''); }}
            style={{ padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${selected === sym ? 'var(--blue)' : 'var(--border2)'}`, background: selected === sym ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: selected === sym ? 'var(--blue)' : 'var(--t2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace' }}>
            {selected === sym && '✓ '}{sym}
          </button>
        ))}
        {filtered.length === 0 && <span className="text-muted fs-12">No match</span>}
      </div>
    </div>
  );
}

// ─── Dividend Tab ──────────────────────────────────────────
function DividendTab({ items, stocks }) {
  const [dividends, setDividends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [search, setSearch] = useState('');
  const [checkedSymbols, setCheckedSymbols] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({ date: today(), symbol: '', stockName: '', shares: '', dividendPerShare: '', totalAmount: '', notes: '' });
  const loadDividends = async () => { setLoading(true); try { setDividends(await dividendService.getAll()); } catch { toast.error('Failed'); } finally { setLoading(false); } };

  const handleCSVImport = async e => {
    const file = e.target.files[0]; if (!file) return;
    setImporting(true);
    try {
      const rows = await importCSV(file);
      const valid = rows.filter(r => (r.symbol || r.Symbol || r.stockName || r['Stock Name']) && (r.dividendPerShare || r['Dividend/Share'] || r.totalAmount || r['Total Amount']));
      if (valid.length === 0) { toast.error('No valid rows found. Check CSV format.'); return; }
      let imported = 0;
      for (const r of valid) {
        const symbol       = (r.symbol        || r.Symbol        || '').toUpperCase();
        const stockName    =  r.stockName      || r['Stock Name'] || symbol;
        const date         =  r.date           || r.Date          || today();
        const shares       = parseFloat(r.shares          || r.Shares          || 0) || 0;
        const dps          = parseFloat(r.dividendPerShare || r['Dividend/Share']|| 0) || 0;
        const totalAmount  = parseFloat(r.totalAmount      || r['Total Amount'] || 0) || (shares * dps);
        const notes        =  r.notes          || r.Notes         || '';
        if (!symbol && !stockName) continue;
        await dividendService.create({ symbol, stockName, date, shares, dividendPerShare: dps, totalAmount, notes });
        imported++;
      }
      toast.success(`✅ Imported ${imported} dividend records!`);
      loadDividends();
    } catch (err) { toast.error('Import failed: ' + err.message); }
    finally { setImporting(false); e.target.value = ''; }
  };
  useEffect(() => { loadDividends(); }, []);
  const ch = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const handleSharesOrDPS = (field, val) => { setForm(p => { const u = { ...p, [field]: val }; const s = parseFloat(field === 'shares' ? val : p.shares) || 0; const d = parseFloat(field === 'dividendPerShare' ? val : p.dividendPerShare) || 0; if (s && d) u.totalAmount = (s * d).toFixed(2); return u; }); };
  const handlePickStock = (sym) => { const h = items.find(i => i.symbol === sym || i.stockName === sym); const m = stocks.find(s => s.symbol === sym); setForm(p => ({ ...p, symbol: sym, stockName: m?.name || h?.stockName || sym, shares: h ? String(h.quantity) : '', totalAmount: h && p.dividendPerShare ? String((h.quantity * parseFloat(p.dividendPerShare)).toFixed(2)) : p.totalAmount })); };
  const save = async () => {
    if (!form.symbol || !form.dividendPerShare) { toast.error('Fill symbol and dividend per share'); return; }
    const data = { ...form, shares: parseFloat(form.shares) || 0, dividendPerShare: parseFloat(form.dividendPerShare), totalAmount: parseFloat(form.totalAmount) || (parseFloat(form.shares) * parseFloat(form.dividendPerShare)) };
    try { if (edit) { await dividendService.update(edit.id, data); toast.success('Updated!'); } else { await dividendService.create(data); toast.success('Added!'); } setModal(false); setEdit(null); setForm({ date: today(), symbol: '', stockName: '', shares: '', dividendPerShare: '', totalAmount: '', notes: '' }); loadDividends(); } catch { toast.error('Failed'); }
  };
  const del = async () => { try { await dividendService.delete(delId); toast.success('Deleted'); setDelId(null); loadDividends(); } catch { toast.error('Failed'); } };
  const totalReceived = dividends.reduce((s, d) => s + (parseFloat(d.totalAmount) || 0), 0);
  const stockSummary = {};
  dividends.forEach(d => { const k = d.symbol || d.stockName; if (!stockSummary[k]) stockSummary[k] = { symbol: d.symbol, name: d.stockName, total: 0, count: 0 }; stockSummary[k].total += parseFloat(d.totalAmount) || 0; stockSummary[k].count++; });
  const holdingSymbols = [...new Set(items.map(i => i.symbol || i.stockName))];

  // All unique symbols in dividend records
  const divSymbols = [...new Set(dividends.map(d => d.symbol || d.stockName).filter(Boolean))].sort();
  const searchMatchSymbols = divSymbols.filter(s => !search || s.toLowerCase().includes(search.toLowerCase()));
  const toggleSym = sym => setCheckedSymbols(s => { const n = new Set(s); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });

  // Filter dividend records
  const filteredDividends = dividends.filter(d => {
    const sym = d.symbol || d.stockName;
    const matchSearch = !search || sym?.toLowerCase().includes(search.toLowerCase()) || d.stockName?.toLowerCase().includes(search.toLowerCase());
    const matchChecked = checkedSymbols.size === 0 || checkedSymbols.has(sym);
    return matchSearch && matchChecked;
  });
  const filteredTotal = filteredDividends.reduce((s, d) => s + (parseFloat(d.totalAmount) || 0), 0);

  return (
    <div>
      <div className="stats mb-4">{[{ icon: '💰', label: 'Total Dividends', val: fmt(totalReceived), c: 'var(--green)' }, { icon: '📋', label: 'Records', val: dividends.length, c: 'var(--blue)' }, { icon: '📈', label: 'Stocks Paying', val: Object.keys(stockSummary).length, c: 'var(--purple)' }].map((s, i) => (<div key={i} className="stat" style={{ '--c': s.c }}><div className="stat-icon">{s.icon}</div><div className="stat-val" style={{ color: s.c }}>{s.val}</div><div className="stat-label">{s.label}</div></div>))}</div>
      {Object.values(stockSummary).length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>{Object.values(stockSummary).sort((a, b) => b.total - a.total).map((s, i) => (<div key={s.symbol} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, borderLeft: `4px solid ${PALETTE[i % PALETTE.length]}` }}><div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: PALETTE[i % PALETTE.length] }}>{s.symbol}</div><div className="fs-11 text-muted mb-2">{s.name}</div><div className="fw-800 fs-14 amt-g">{fmt(s.total)}</div><div className="fs-11 text-muted">{s.count} payment{s.count > 1 ? 's' : ''}</div></div>))}</div>}

      <div className="flex justify-between items-center mb-3">
        <div className="card-title" style={{ marginBottom: 0 }}>💸 Dividend History</div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {/* Export */}
          {dividends.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(
              dividends.map(d => ({ date: typeof d.date === 'object' ? fmtDate(d.date) : d.date, symbol: d.symbol || '', stockName: d.stockName || '', shares: d.shares || 0, dividendPerShare: d.dividendPerShare || 0, totalAmount: d.totalAmount || 0, notes: d.notes || '' })),
              'dividends.csv'
            )}>⬇️ Export CSV</button>
          )}
          {/* Import */}
          <label className="btn btn-secondary btn-sm" style={{ cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
            {importing ? <><span className="spin" style={{ width: 11, height: 11, borderWidth: 2 }} /> Importing...</> : '⬆️ Import CSV'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} disabled={importing} />
          </label>
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm({ date: today(), symbol: '', stockName: '', shares: '', dividendPerShare: '', totalAmount: '', notes: '' }); setModal(true); }}>+ Add Dividend</button>
        </div>
      </div>

      {/* CSV Format hint */}
      <div style={{ background: 'rgba(77,158,255,.06)', border: '1px solid rgba(77,158,255,.18)', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 11, color: 'var(--t2)' }}>
        📋 <strong>CSV columns:</strong> date, symbol, stockName, shares, dividendPerShare, totalAmount, notes &nbsp;·&nbsp; <span className="text-muted">Export first to see the exact format</span>
      </div>

      {/* Search box */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 12px', marginBottom: 10 }}>
        <span>🔍</span>
        <input style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, flex: 1 }} placeholder="Search by symbol..." value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}>✕</button>}
      </div>

      {/* Symbol checkbox chips */}
      {divSymbols.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, alignItems: 'center' }}>
          {checkedSymbols.size > 0 && (
            <button onClick={() => setCheckedSymbols(new Set())} style={{ padding: '3px 10px', borderRadius: 20, border: '1.5px solid var(--border2)', background: 'var(--bg3)', color: 'var(--t3)', fontSize: 11, cursor: 'pointer' }}>✕ Clear</button>
          )}
          {searchMatchSymbols.map(sym => (
            <button key={sym} type="button" onClick={() => toggleSym(sym)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${checkedSymbols.has(sym) ? 'var(--green)' : 'var(--border2)'}`, background: checkedSymbols.has(sym) ? 'rgba(34,197,94,.15)' : 'var(--bg3)', color: checkedSymbols.has(sym) ? 'var(--green)' : 'var(--t2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, border: `2px solid ${checkedSymbols.has(sym) ? 'var(--green)' : 'var(--border2)'}`, background: checkedSymbols.has(sym) ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {checkedSymbols.has(sym) && <span style={{ color: '#fff', fontSize: 8, fontWeight: 900 }}>✓</span>}
              </span>
              {sym}
            </button>
          ))}
        </div>
      )}

      {loading ? <div className="spin-center"><div className="spin spin-lg" /></div> : filteredDividends.length === 0
        ? <div className="card"><div className="empty"><div className="empty-icon">💸</div><div className="empty-title">{dividends.length === 0 ? 'No dividends yet' : 'No match found'}</div></div></div>
        : <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Date</th><th>Symbol</th><th>Stock Name</th><th style={{ textAlign: 'right' }}>Shares</th><th style={{ textAlign: 'right' }}>Div/Share</th><th style={{ textAlign: 'right' }}>Total</th><th>Notes</th><th>Actions</th></tr></thead>
            <tbody>{filteredDividends.map(d => (
              <tr key={d.id}>
                <td className="font-mono fs-12 text-muted">{fmtDate(d.date)}</td>
                <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, background: 'var(--bg3)', padding: '3px 8px', borderRadius: 6, color: 'var(--blue)' }}>{d.symbol || '—'}</span></td>
                <td className="fw-600 fs-13">{d.stockName}</td>
                <td style={{ textAlign: 'right' }} className="font-mono fs-12">{d.shares || '—'}</td>
                <td style={{ textAlign: 'right' }} className="font-mono fs-12">{fmt(d.dividendPerShare)}</td>
                <td style={{ textAlign: 'right' }}><span className="amt amt-g fw-700">{fmt(d.totalAmount)}</span></td>
                <td className="text-muted fs-12">{d.notes || '—'}</td>
                <td><div className="actions"><button className="btn-icon" onClick={() => { setEdit(d); setForm({ ...d, date: typeof d.date === 'object' ? d.date.toISOString().split('T')[0] : d.date, shares: String(d.shares || ''), dividendPerShare: String(d.dividendPerShare || ''), totalAmount: String(d.totalAmount || '') }); setModal(true); }}>✏️</button><button className="btn-icon" onClick={() => setDelId(d.id)}>🗑️</button></div></td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={5} className="text-muted fs-12" style={{ padding: '10px 14px' }}>TOTAL {checkedSymbols.size > 0 || search ? `(filtered)` : ''}</td><td style={{ textAlign: 'right', padding: '10px 14px' }}><span className="amt amt-g fw-800">{fmt(filteredTotal)}</span></td><td colSpan={2} /></tr></tfoot>
          </table></div>
      }
      {modal && <Modal title={edit ? '✏️ Edit Dividend' : '💸 Add Dividend'} onClose={() => { setModal(false); setEdit(null); }}>
        <div className="fg"><label className="fl">Date</label><input className="fi" type="date" name="date" value={form.date} onChange={ch} /></div>
        {holdingSymbols.length > 0 && <div className="fg"><label className="fl">Pick from holdings</label><HoldingSymbolPicker symbols={holdingSymbols} selected={form.symbol} onSelect={handlePickStock} /></div>}
        <div className="frow"><div className="fg"><label className="fl">Symbol</label><input className="fi" name="symbol" value={form.symbol} onChange={ch} placeholder="e.g. TCS" style={{ fontFamily: 'monospace', fontWeight: 700 }} /></div><div className="fg"><label className="fl">Stock Name</label><input className="fi" name="stockName" value={form.stockName} onChange={ch} placeholder="Auto-filled" /></div></div>
        <div className="frow"><div className="fg"><label className="fl">No. of Shares</label><input className="fi" type="number" name="shares" value={form.shares} onChange={e => handleSharesOrDPS('shares', e.target.value)} placeholder="e.g. 100" /></div><div className="fg"><label className="fl">Dividend/Share (Rs)</label><input className="fi" type="number" name="dividendPerShare" value={form.dividendPerShare} onChange={e => handleSharesOrDPS('dividendPerShare', e.target.value)} step="0.01" required /></div></div>
        <div className="fg"><label className="fl">Total Amount (Rs) <span style={{ color: 'var(--green)', fontSize: 11 }}>auto-calc</span></label><div style={{ position: 'relative' }}><span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--t3)' }}>Rs</span><input className="fi" type="number" name="totalAmount" value={form.totalAmount} onChange={ch} style={{ paddingLeft: 28, fontWeight: 700 }} /></div>{form.shares && form.dividendPerShare && <div className="fs-11 amt-g mt-1">= {form.shares} × Rs {form.dividendPerShare} = Rs {(parseFloat(form.shares) * parseFloat(form.dividendPerShare)).toFixed(2)}</div>}</div>
        <div className="fg"><label className="fl">Notes</label><input className="fi" name="notes" value={form.notes} onChange={ch} placeholder="e.g. Q3 FY25 interim dividend" /></div>
        <div className="modal-foot"><button className="btn btn-secondary" onClick={() => { setModal(false); setEdit(null); }}>Cancel</button><button className="btn btn-primary" onClick={save}>{edit ? 'Update' : 'Add'}</button></div>
      </Modal>}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

// ─── Holdings Tab ──────────────────────────────────────────
function HoldingsTab({ items, brokers, getBrokerColor, getBrokerIcon, onEdit, onDelete, onBulkDelete, onPriceUpdate }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [checkedMonths, setCheckedMonths] = useState(new Set([now.getMonth() + 1]));
  const [search, setSearch] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(new Set());
  const [checkedSymbols, setCheckedSymbols] = useState(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years = [];
  for (let y = 2022; y <= now.getFullYear(); y++) years.push(y);

  const toggleMonth = m => {
    setCheckedMonths(s => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n; });
    setCheckedSymbols(new Set()); setSelected(new Set());
  };
  const selectAllMonths = () => { setCheckedMonths(new Set(MONTHS.map((_, i) => i + 1))); setCheckedSymbols(new Set()); };
  const clearMonths = () => { setCheckedMonths(new Set()); setCheckedSymbols(new Set()); };

  // Filter by checked months + year (if no months checked = show all year)
  const byMonth = items.filter(i => {
    const d = new Date(i.purchaseDate);
    const matchYear = d.getFullYear() === year;
    const matchMonth = checkedMonths.size === 0 || checkedMonths.has(d.getMonth() + 1);
    return matchYear && matchMonth;
  });

  // Unique symbols in filtered month/year for chips
  const monthSymbols = [...new Set(byMonth.map(i => i.symbol || i.stockName).filter(Boolean))].sort();
  const searchMatchSymbols = monthSymbols.filter(s => !search || s.toLowerCase().includes(search.toLowerCase()));
  const toggleSymbol = sym => setCheckedSymbols(s => { const n = new Set(s); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });

  // Apply search + broker + checked symbols filter
  const filtered = byMonth.filter(i => {
    const sym = i.symbol || i.stockName;
    const matchSearch = !search || i.symbol?.toLowerCase().includes(search.toLowerCase()) || i.stockName?.toLowerCase().includes(search.toLowerCase());
    const matchBroker = !brokerFilter || i.brokerName === brokerFilter;
    const matchChecked = checkedSymbols.size === 0 || checkedSymbols.has(sym);
    return matchSearch && matchBroker && matchChecked;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    if (sortBy === 'date') { va = new Date(a.purchaseDate); vb = new Date(b.purchaseDate); }
    else if (sortBy === 'symbol') { va = a.symbol || ''; vb = b.symbol || ''; return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); }
    else if (sortBy === 'invested') { va = a.totalInvested; vb = b.totalInvested; }
    else if (sortBy === 'pnl') { va = a.profitLoss; vb = b.profitLoss; }
    else if (sortBy === 'alloc') { va = parseFloat(a.allocation); vb = parseFloat(b.allocation); }
    else if (sortBy === 'qty') { va = a.quantity; vb = b.quantity; }
    else { va = 0; vb = 0; }
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  const toggleSort = (field) => { if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(field); setSortDir('desc'); } };
  const SH = ({ field, label }) => (
    <span onClick={() => toggleSort(field)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label} {sortBy === field ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{ color: 'var(--t3)', fontSize: 10 }}>↕</span>}
    </span>
  );

  const toggleAll = () => { if (selected.size === sorted.length) setSelected(new Set()); else setSelected(new Set(sorted.map(i => i.id))); };
  const toggleOne = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulkDelete = async () => {
    setDeleting(true);
    try { await onBulkDelete([...selected]); setSelected(new Set()); setConfirmDel(false); }
    finally { setDeleting(false); }
  };

  const totalInvested = sorted.reduce((s, i) => s + i.totalInvested, 0);
  const totalValue = sorted.reduce((s, i) => s + i.currentValue, 0);
  const totalPnL = totalValue - totalInvested;
  const uniqueBrokers = [...new Set(items.map(i => i.brokerName).filter(Boolean))];

  return (
    <div>
      {/* Year + Month checkbox chips row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {/* Year dropdown */}
        <div className="flex items-center gap-2">
          <span className="fs-12 text-muted fw-700">Year:</span>
          <select className="fs btn-sm" value={year} onChange={e => { setYear(+e.target.value); setCheckedMonths(new Set()); setCheckedSymbols(new Set()); }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={selectAllMonths} style={{ fontSize: 11 }}>All Months</button>
          {checkedMonths.size > 0 && <button className="btn btn-secondary btn-sm" onClick={clearMonths} style={{ fontSize: 11 }}>✕ Clear</button>}
        </div>
        {/* Record count */}
        <span className="fs-12 text-muted">{sorted.length} records</span>
      </div>

      {/* Month checkbox chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {MONTHS.map((m, i) => {
          const mNum = i + 1;
          const isChecked = checkedMonths.has(mNum);
          // Count records in this month
          const count = items.filter(item => {
            const d = new Date(item.purchaseDate);
            return d.getFullYear() === year && d.getMonth() + 1 === mNum;
          }).length;
          return (
            <button key={m} type="button" onClick={() => toggleMonth(mNum)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${isChecked ? 'var(--blue)' : 'var(--border2)'}`, background: isChecked ? 'rgba(77,158,255,.15)' : count > 0 ? 'var(--bg3)' : 'var(--bg2)', color: isChecked ? 'var(--blue)' : count > 0 ? 'var(--t2)' : 'var(--t3)', fontSize: 12, fontWeight: 700, cursor: count > 0 ? 'pointer' : 'default', opacity: count === 0 ? 0.45 : 1 }}>
              <span style={{ width: 13, height: 13, borderRadius: 3, border: `2px solid ${isChecked ? 'var(--blue)' : 'var(--border2)'}`, background: isChecked ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isChecked && <span style={{ color: '#fff', fontSize: 8, fontWeight: 900 }}>✓</span>}
              </span>
              {m}
              {count > 0 && <span style={{ fontSize: 10, color: isChecked ? 'var(--blue)' : 'var(--t3)', fontWeight: 400 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Search + Broker filter row */}
      <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 12px', flex: 1, minWidth: 180 }}>
          <span style={{ fontSize: 13 }}>🔍</span>
          <input style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, flex: 1 }} placeholder="Symbol or name..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 12 }}>✕</button>}
        </div>
        <select className="fs btn-sm" value={brokerFilter} onChange={e => setBrokerFilter(e.target.value)}>
          <option value="">All Brokers</option>
          {uniqueBrokers.map(b => <option key={b} value={b}>{getBrokerIcon(b)} {b}</option>)}
        </select>
      </div>

      {/* Symbol checkbox chips */}
      {monthSymbols.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
          {checkedSymbols.size > 0 && (
            <button onClick={() => setCheckedSymbols(new Set())} style={{ padding: '3px 10px', borderRadius: 20, border: '1.5px solid var(--border2)', background: 'var(--bg3)', color: 'var(--t3)', fontSize: 11, cursor: 'pointer' }}>✕ Clear</button>
          )}
          {searchMatchSymbols.map(sym => (
            <button key={sym} type="button" onClick={() => toggleSymbol(sym)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${checkedSymbols.has(sym) ? 'var(--blue)' : 'var(--border2)'}`, background: checkedSymbols.has(sym) ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: checkedSymbols.has(sym) ? 'var(--blue)' : 'var(--t2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, border: `2px solid ${checkedSymbols.has(sym) ? 'var(--blue)' : 'var(--border2)'}`, background: checkedSymbols.has(sym) ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {checkedSymbols.has(sym) && <span style={{ color: '#fff', fontSize: 8, fontWeight: 900 }}>✓</span>}
              </span>
              {sym}
            </button>
          ))}
        </div>
      )}

      {/* Bulk delete bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3" style={{ background: 'rgba(244,63,94,.07)', border: '1px solid rgba(244,63,94,.2)', borderRadius: 10, padding: '8px 14px' }}>
          <span className="fw-700 fs-13" style={{ color: 'var(--red)' }}>{selected.size} selected</span>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(true)}>🗑️ Delete Selected</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Summary stats for filtered view */}
      {sorted.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Records', val: sorted.length, c: 'var(--blue)' },
            { label: 'Invested', val: fmt(totalInvested), c: 'var(--purple)' },
            { label: 'P&L', val: `${totalPnL >= 0 ? '+' : ''}${fmt(totalPnL)}`, c: totalPnL >= 0 ? 'var(--green)' : 'var(--red)' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg2)', border: `1px solid var(--border)`, borderRadius: 8, padding: '8px 12px', borderLeft: `3px solid ${s.c}` }}>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.c }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0
        ? <div className="card"><div className="empty"><div className="empty-icon">📈</div><div className="empty-title">No stocks for {checkedMonths.size === 0 ? year : checkedMonths.size === 1 ? `${MONTHS[[...checkedMonths][0]-1]} ${year}` : `${checkedMonths.size} months in ${year}`}</div><div className="empty-sub">Try selecting different months</div></div></div>
        : <div className="tbl-wrap"><table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={selected.size === sorted.length && sorted.length > 0} onChange={toggleAll} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--blue)' }} />
              </th>
              <th><SH field="date" label="Date" /></th>
              <th><SH field="symbol" label="Symbol" /></th>
              <th>Stock</th>
              <th>Broker</th>
              <th><SH field="qty" label="Qty" /></th>
              <th style={{ textAlign: 'right' }}>Buy Rs</th>
              <th style={{ textAlign: 'right' }}>Current Rs</th>
              <th style={{ textAlign: 'right' }}><SH field="invested" label="Invested" /></th>
              <th style={{ textAlign: 'right' }}>Value</th>
              <th style={{ textAlign: 'right' }}><SH field="pnl" label="P&L" /></th>
              <th style={{ textAlign: 'right' }}>Brokerage</th>
              <th style={{ textAlign: 'right' }}><SH field="alloc" label="Alloc%" /></th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((i, idx) => (
              <tr key={i.id} style={{ background: selected.has(i.id) ? 'rgba(77,158,255,.07)' : 'transparent' }}>
                <td><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleOne(i.id)} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--blue)' }} /></td>
                <td style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--t2)', whiteSpace: 'nowrap' }}>{fmtDate(i.purchaseDate)}</td>
                <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, background: 'var(--bg3)', padding: '3px 8px', borderRadius: 6, color: 'var(--blue)' }}>{(i.symbol || '—').replace(/^NSE:/i, '')}</span></td>
                <td className="fw-600 fs-13">{i.stockName}</td>
                <td>{i.brokerName ? <span style={{ background: getBrokerColor(i.brokerName) + '18', color: getBrokerColor(i.brokerName), border: `1px solid ${getBrokerColor(i.brokerName)}40`, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{getBrokerIcon(i.brokerName)} {i.brokerName}</span> : <span className="text-muted fs-11">—</span>}</td>
                <td className="font-mono fs-12">{i.quantity}</td>
                <td style={{ textAlign: 'right' }} className="font-mono fs-12">{fmt(i.purchasePrice)}</td>
                <td style={{ textAlign: 'right' }}>
                  {i.isLive
                    ? <div className="flex items-center gap-1" style={{ justifyContent: 'flex-end' }}>
                        <span className="font-mono fs-12 fw-700" style={{ color: 'var(--green)' }}>{fmt(i.currentPrice)}</span>
                        <span style={{ fontSize: 9, background: 'rgba(34,197,94,.15)', color: 'var(--green)', borderRadius: 20, padding: '1px 5px', fontWeight: 700 }}>LIVE</span>
                      </div>
                    : <InlinePriceEdit key={i.id} value={i.currentPrice || i.purchasePrice} onSave={p => onPriceUpdate(i, p)} />
                  }
                </td>
                <td style={{ textAlign: 'right' }}><span className="amt">{fmt(i.totalInvested)}</span></td>
                <td style={{ textAlign: 'right' }}><span className="amt">{fmt(i.currentValue)}</span></td>
                <td style={{ textAlign: 'right' }}><span className={`amt ${i.profitLoss >= 0 ? 'amt-g' : 'amt-r'}`}>{i.profitLoss >= 0 ? '+' : ''}{fmt(i.profitLoss)}<br /><small>({i.profitLossPct}%)</small></span></td>
                <td style={{ textAlign: 'right' }}><span className={`font-mono fs-12 ${i.brokerage > 0 ? 'amt-r' : 'text-muted'}`}>{i.brokerage > 0 ? fmt(i.brokerage) : '—'}</span></td>
                <td style={{ textAlign: 'right' }}><span style={{ background: PALETTE[idx % PALETTE.length] + '22', color: PALETTE[idx % PALETTE.length], padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{i.allocation}%</span></td>
                <td><div className="actions" style={{ justifyContent: 'center' }}><button className="btn-icon" onClick={() => onEdit(i)}>✏️</button><button className="btn-icon" onClick={() => onDelete(i.id)}>🗑️</button></div></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8} className="text-muted fs-12" style={{ padding: '10px 14px' }}>TOTAL ({sorted.length} records){selected.size > 0 && ` · ${selected.size} selected`}</td>
              <td style={{ textAlign: 'right', padding: '10px 14px' }}><span className="amt fw-800">{fmt(totalInvested)}</span></td>
              <td style={{ textAlign: 'right', padding: '10px 14px' }}><span className="amt fw-800">{fmt(totalValue)}</span></td>
              <td style={{ textAlign: 'right', padding: '10px 14px' }}><span className={`amt fw-800 ${totalPnL >= 0 ? 'amt-g' : 'amt-r'}`}>{totalPnL >= 0 ? '+' : ''}{fmt(totalPnL)}</span></td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table></div>
      }

      {/* Bulk delete confirm */}
      {confirmDel && (
        <div className="overlay" onClick={() => setConfirmDel(false)}>
          <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🗑️</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Delete {selected.size} records?</div>
            <div className="text-muted fs-13 mb-5">This cannot be undone.</div>
            <div className="flex gap-3" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDel(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={bulkDelete} disabled={deleting}>{deleting ? <span className="spin" /> : null} Delete {selected.size}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Password Lock Screen ──────────────────────────────────
const PAGE_PIN_KEY = 'fintrack_page_pins';
function getPin(page) { try { return JSON.parse(localStorage.getItem(PAGE_PIN_KEY) || '{}')[page] || ''; } catch { return ''; } }
function setPin(page, pin) { try { const d = JSON.parse(localStorage.getItem(PAGE_PIN_KEY) || '{}'); d[page] = pin; localStorage.setItem(PAGE_PIN_KEY, JSON.stringify(d)); } catch {} }

function LockedScreen({ page, onUnlock }) {
  const [input, setInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [mode, setMode] = useState(getPin(page) ? 'unlock' : 'setup');
  const [error, setError] = useState('');

  const handleUnlock = () => {
    if (input === getPin(page)) { onUnlock(); }
    else { setError('Wrong PIN. Try again.'); setInput(''); }
  };
  const handleSetup = () => {
    if (newPin.length < 4) { setError('PIN must be at least 4 digits'); return; }
    if (newPin !== confirmPin) { setError('PINs do not match'); return; }
    setPin(page, newPin); onUnlock();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '40px 36px', textAlign: 'center', minWidth: 300, maxWidth: 360 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>{mode === 'setup' ? 'Set a PIN' : 'Enter PIN'}</div>
        <div className="text-muted fs-13 mb-5">{mode === 'setup' ? 'Protect this page with a 4-digit PIN' : `This page is PIN protected`}</div>
        {mode === 'unlock' ? (
          <>
            <input className="fi" type="password" inputMode="numeric" maxLength={8} placeholder="Enter PIN" value={input}
              onChange={e => { setInput(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8, marginBottom: 12 }} autoFocus />
            {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleUnlock}>🔓 Unlock</button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8, fontSize: 12 }} onClick={() => { setPin(page, ''); setMode('setup'); setError(''); }}>Forgot PIN? Reset</button>
          </>
        ) : (
          <>
            <input className="fi" type="password" inputMode="numeric" maxLength={8} placeholder="New PIN (min 4 digits)" value={newPin}
              onChange={e => { setNewPin(e.target.value); setError(''); }} style={{ textAlign: 'center', fontSize: 18, letterSpacing: 6, marginBottom: 10 }} autoFocus />
            <input className="fi" type="password" inputMode="numeric" maxLength={8} placeholder="Confirm PIN" value={confirmPin}
              onChange={e => { setConfirmPin(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSetup()}
              style={{ textAlign: 'center', fontSize: 18, letterSpacing: 6, marginBottom: 12 }} />
            {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSetup}>🔐 Set PIN & Enter</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Portfolio Page ───────────────────────────────────
export default function PortfolioPage() {
  const [unlocked, setUnlocked] = useState(() => !getPin('portfolio'));
  const [items, setItems] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('holdings');
  const [livePrices, setLivePrices] = useState({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveStatus, setLiveStatus] = useState('');
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);
  const [gasUrl, setGasUrl] = useState(() => localStorage.getItem('fintrack_gas_url') || '');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const load = async (invalidateCache = false) => {
    setLoading(true);
    try {
      // Fetch investments first — show the page immediately
      const inv = await investmentService.getAll();
      setItems(inv);
      setLoading(false); // unblock UI as soon as investments arrive

      // Fetch stocks & brokers in background (cached after first load)
      const [sm, br] = await Promise.all([
        stockMasterService.getAll(),
        brokerService.getAll(),
      ]);
      setStocks(sm);
      setBrokers(br);
    } catch { toast.error('Failed to load'); setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const saveGasUrl = () => {
    const url = urlInput.trim();
    if (!url.startsWith('https://script.google.com')) { toast.error('Invalid URL — must start with https://script.google.com'); return; }
    setAppsScriptUrl(url);
    setGasUrl(url);
    setShowUrlInput(false);
    toast.success('Google Apps Script URL saved!');
  };

  // Merge live prices into items
  const itemsWithLive = items.map(i => {
    const lp = i.symbol ? livePrices[i.symbol] : null;
    if (!lp) return i;
    const currentPrice = lp;
    const currentValue = currentPrice * i.quantity;
    const profitLoss = currentValue - i.totalInvested;
    const profitLossPct = i.totalInvested > 0 ? ((profitLoss / i.totalInvested) * 100).toFixed(2) : '0.00';
    return { ...i, currentPrice, currentValue, profitLoss, profitLossPct, isLive: true };
  });
  const liveTotalCurrent = itemsWithLive.reduce((s, i) => s + i.currentValue, 0);
  const itemsWithAlloc = itemsWithLive.map(i => ({
    ...i,
    allocation: liveTotalCurrent > 0 ? ((i.currentValue / liveTotalCurrent) * 100).toFixed(1) : i.allocation,
  }));

  const fetchLive = async () => {
    if (!items.length) return;
    if (!gasUrl) { setShowUrlInput(true); toast.error('Set your Google Apps Script URL first'); return; }
    setLiveLoading(true); setLiveStatus('fetching');
    try {
      const symbols = [...new Set(items.map(i => i.symbol).filter(Boolean))];
      const prices = await fetchLivePrices(symbols);
      const found = Object.keys(prices).length;
      if (found === 0) { setLiveStatus('error'); toast.error('No prices returned — check your Apps Script URL'); }
      else {
        setLivePrices(prices);
        setLiveStatus('done');
        setLiveUpdatedAt(new Date());
        toast.success(`Live prices fetched for ${found}/${symbols.length} stocks via Google Finance ✅`);
      }
    } catch (err) {
      if (err.message === 'NO_URL') { setShowUrlInput(true); toast.error('Set your Google Apps Script URL first'); }
      else { setLiveStatus('error'); toast.error('Fetch failed: ' + err.message); }
    }
    finally { setLiveLoading(false); }
  };

  // Save live prices to DB
  const saveLivePricesToDB = async () => {
    if (!Object.keys(livePrices).length) { toast.error('Fetch live prices first'); return; }
    try {
      let saved = 0;
      for (const item of items) {
        const lp = item.symbol ? livePrices[item.symbol] : null;
        if (lp && lp !== item.currentPrice) {
          await investmentService.update(item.id, { ...item, currentPrice: lp });
          saved++;
        }
      }
      toast.success(`Saved ${saved} prices to database`);
      reloadItems();
    } catch { toast.error('Save failed'); }
  };

  // Lightweight reload — only re-fetches investments (stocks/brokers stay cached)
  const reloadItems = async () => {
    try {
      const inv = await investmentService.getAll();
      setItems(inv);
    } catch { toast.error('Failed to refresh'); }
  };

  const save = async data => {
    try {
      if (edit) { await investmentService.update(edit.id, data); toast.success('Updated!'); }
      else { await investmentService.create(data); toast.success('Stock added!'); }
      setModal(false); setEdit(null); reloadItems();
    } catch { toast.error('Failed'); }
  };

  const saveAndAnother = async data => {
    try {
      await investmentService.create(data);
      toast.success('Stock added! Form ready for next entry.');
      reloadItems(); // refresh investments only — modal stays open
    } catch { toast.error('Failed'); }
  };
  const del = async () => { try { await investmentService.delete(delId); toast.success('Deleted'); setDelId(null); reloadItems(); } catch { toast.error('Failed'); } };

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  const handleCSVImport = async e => {
    const file = e.target.files[0]; if (!file) return;
    setImporting(true); setImportProgress({ current: 0, total: 0 });
    try {
      const rows = await importCSV(file);
      const validRows = rows.filter(row => row.stockName || row['Stock Name']);
      setImportProgress({ current: 0, total: validRows.length });
      let imported = 0;
      for (const row of validRows) {
        const name = row.stockName || row['Stock Name'];
        const sym = (row.symbol || row['Symbol'] || '').toUpperCase();
        const master = stocks.find(s => s.symbol === sym);
        const broker = row.brokerName || row.broker || row['Broker'] || '';
        await investmentService.create({ stockName: master ? master.name : name, symbol: sym, quantity: parseFloat(row.quantity || row['Quantity']) || 0, purchasePrice: parseFloat(row.purchasePrice || row['Buy Price']) || 0, currentPrice: parseFloat(row.currentPrice || row['Current Price']) || 0, purchaseDate: row.purchaseDate || row['Purchase Date'] || today(), brokerName: broker, brokerage: parseFloat(row.brokerage || row['Brokerage']) || 0 });
        imported++;
        setImportProgress({ current: imported, total: validRows.length });
      }
      toast.success(`Imported ${imported} stocks!`); reloadItems();
    } catch { toast.error('Import failed.'); }
    finally { setImporting(false); setImportProgress({ current: 0, total: 0 }); }
    e.target.value = '';
  };

  const filteredItems = itemsWithAlloc.filter(i => i.symbol?.toLowerCase().includes(search.toLowerCase()) || i.stockName?.toLowerCase().includes(search.toLowerCase()));
  const totalInvested = itemsWithAlloc.reduce((s, i) => s + i.totalInvested, 0);
  const totalCurrent = itemsWithAlloc.reduce((s, i) => s + i.currentValue, 0);
  const totalPnL = totalCurrent - totalInvested;
  const totalBrokerage = itemsWithAlloc.reduce((s, i) => s + (parseFloat(i.brokerage) || 0), 0);
  // Combine all rows by symbol for pie chart
  const symbolMap = {};
  itemsWithAlloc.forEach(i => {
    const k = i.symbol || i.stockName;
    if (!symbolMap[k]) symbolMap[k] = { name: k, value: 0 };
    symbolMap[k].value += i.currentValue;
  });
  const combinedSymbols = Object.values(symbolMap).sort((a, b) => b.value - a.value);
  const totalCombined = combinedSymbols.reduce((s, i) => s + i.value, 0);
  const pieData = combinedSymbols.map((i, idx) => ({ ...i, color: PALETTE[idx % PALETTE.length], pct: totalCombined > 0 ? ((i.value / totalCombined) * 100).toFixed(1) : '0' }));
  const barData = itemsWithAlloc.slice(0, 10).map(i => ({ name: (i.symbol || i.stockName).substring(0, 8), invested: Math.round(i.totalInvested), current: Math.round(i.currentValue) }));

  const getBrokerColor = (name) => brokers.find(b => b.name === name)?.color || '#94a3b8';
  const getBrokerIcon = (name) => brokers.find(b => b.name === name)?.icon || '🏦';

  if (!unlocked) return <LockedScreen page="portfolio" onUnlock={() => setUnlocked(true)} />;
  if (loading) return <div className="spin-center"><div className="spin spin-lg" /></div>;

  return (
    <div>
      {/* Import Overlay */}
      {importing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 16, padding: '32px 40px', textAlign: 'center', minWidth: 300 }}>
            <div className="spin spin-lg" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Importing Portfolio...</div>
            <div className="text-muted fs-13">
              {importProgress.total > 0 ? `${importProgress.current} of ${importProgress.total} stocks` : 'Reading file...'}
            </div>
            {importProgress.total > 0 && (
              <div style={{ marginTop: 12, background: 'var(--bg3)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--green)', borderRadius: 8, width: `${(importProgress.current / importProgress.total) * 100}%`, transition: 'width .3s' }} />
              </div>
            )}
            <div className="fs-11 text-muted mt-2">Please don't close this page</div>
          </div>
        </div>
      )}

      <div className="page-head">
        <div><div className="page-title">📈 Stock Portfolio</div><div className="page-sub">{items.length} stocks</div></div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
            {importing ? <><span className="spin" style={{ width: 11, height: 11, borderWidth: 2 }} /> Importing...</> : '⬆️ Import CSV'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} disabled={importing} />
          </label>
          <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(items.map(i => ({ stockName: i.stockName, symbol: i.symbol, quantity: i.quantity, purchasePrice: i.purchasePrice, currentPrice: i.currentPrice || i.purchasePrice, brokerName: i.brokerName || '', brokerage: i.brokerage || 0, totalInvested: i.totalInvested, currentValue: i.currentValue, profitLoss: i.profitLoss, allocation: i.allocation + '%' })), 'portfolio.csv')}>⬇️ Export</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>+ Add Stock</button>
        </div>
      </div>

      {/* Google Apps Script Live Price Bar */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16 }}>📡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="fw-700 fs-13">Live Prices via Google Finance</span>
            {liveStatus === 'done' && liveUpdatedAt && <span className="fs-11 text-muted" style={{ marginLeft: 8 }}>✅ Updated {liveUpdatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {Object.keys(livePrices).length} stocks</span>}
            {liveStatus === 'error' && <span className="fs-11 amt-r" style={{ marginLeft: 8 }}>❌ Failed — check Apps Script URL</span>}
            {liveStatus === 'fetching' && <span className="fs-11 text-muted" style={{ marginLeft: 8 }}>⏳ Fetching from Google Finance...</span>}
            {!gasUrl && liveStatus === '' && <span className="fs-11 amt-r" style={{ marginLeft: 8 }}>⚠️ Setup required — click ⚙️ to add your Apps Script URL</span>}
            {gasUrl && liveStatus === '' && <span className="fs-11 text-muted" style={{ marginLeft: 8 }}>Ready · uses GOOGLEFINANCE() via Apps Script</span>}
          </div>
          <button onClick={() => { setShowUrlInput(v => !v); setUrlInput(gasUrl); }} style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 13, color: 'var(--t2)' }} title="Configure Apps Script URL">⚙️ {gasUrl ? 'Configured' : 'Setup'}</button>
          {liveStatus === 'done' && <button className="btn btn-secondary btn-sm" onClick={saveLivePricesToDB}>💾 Save to DB</button>}
          <button className="btn btn-primary btn-sm" onClick={fetchLive} disabled={liveLoading || !items.length}>
            {liveLoading ? <><span className="spin" style={{ width: 12, height: 12, borderWidth: 2 }} /> Fetching...</> : '🔄 Fetch Live Prices'}
          </button>
        </div>

        {/* URL Setup Panel */}
        {showUrlInput && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div className="fs-12 fw-700 mb-2">📋 Google Apps Script Setup</div>
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--t2)', marginBottom: 10, lineHeight: 1.7 }}>
              <strong>Steps to set up (one-time, free):</strong><br />
              1. Go to <a href="https://script.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>script.google.com</a> → New Project<br />
              2. Paste the Apps Script code (download below) → Save<br />
              3. Click <strong>Deploy → New Deployment → Web App</strong><br />
              4. Set <em>"Who has access"</em> to <strong>Anyone</strong> → Deploy<br />
              5. Copy the Web App URL and paste it below
            </div>
            <div className="flex gap-2 mb-2">
              <input
                className="fi" style={{ flex: 1, fontSize: 12 }}
                placeholder="https://script.google.com/macros/s/XXXXXXXX/exec"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" onClick={saveGasUrl}>Save URL</button>
              {gasUrl && <button className="btn btn-secondary btn-sm" onClick={() => { setAppsScriptUrl(''); setGasUrl(''); localStorage.removeItem('fintrack_gas_url'); setShowUrlInput(false); toast.success('URL cleared'); }}>Clear</button>}
            </div>
            {gasUrl && <div className="fs-11 text-muted">Current: <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{gasUrl.substring(0, 60)}...</span></div>}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="stats mb-0">
        {[
          { icon: '💰', label: 'Total Invested', val: fmt(totalInvested), c: 'var(--blue)' },
          { icon: '📊', label: 'Current Value', val: fmt(totalCurrent), c: 'var(--purple)' },
          { icon: totalPnL >= 0 ? '📈' : '📉', label: 'Total P&L', val: `${totalPnL >= 0 ? '+' : ''}${fmt(totalPnL)}`, c: totalPnL >= 0 ? 'var(--green)' : 'var(--red)' },
          { icon: '💹', label: 'Return %', val: `${totalInvested > 0 ? ((totalPnL / totalInvested) * 100).toFixed(2) : 0}%`, c: totalPnL >= 0 ? 'var(--green)' : 'var(--red)' },
          { icon: '🏦', label: 'Total Brokerage', val: fmt(totalBrokerage), c: 'var(--orange)' },
        ].map((s, i) => (<div key={i} className="stat" style={{ '--c': s.c }}><div className="stat-icon">{s.icon}</div><div className="stat-val" style={{ color: s.c }}>{s.val}</div><div className="stat-label">{s.label}</div></div>))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mt-4 mb-4" style={{ borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {[{ key: 'holdings', label: '📋 Holdings' }, { key: 'charts', label: '📊 Charts' }, { key: 'analysis', label: '📉 52W Analysis' }, { key: 'broker', label: '🏦 Broker Report' }, { key: 'dividends', label: '💸 Dividends' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 14px', borderRadius: '8px 8px 0 0', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: tab === t.key ? 'var(--bg3)' : 'transparent', color: tab === t.key ? 'var(--text)' : 'var(--t3)', borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Holdings Tab */}
      {tab === 'holdings' && (
        <HoldingsTab
          items={itemsWithAlloc}
          brokers={brokers}
          getBrokerColor={getBrokerColor}
          getBrokerIcon={getBrokerIcon}
          onEdit={i => { setEdit(i); setModal(true); }}
          onDelete={id => setDelId(id)}
          onBulkDelete={async (ids) => {
            for (const id of ids) await investmentService.delete(id);
            toast.success(`Deleted ${ids.length} records`); reloadItems();
          }}
          onPriceUpdate={async (item, price) => {
            try { await investmentService.update(item.id, { ...item, currentPrice: price }); toast.success('Updated!'); reloadItems(); } catch { toast.error('Failed'); }
          }}
        />
      )}

      {tab === 'charts' && items.length > 0 && (
        <div className="charts">
          <div className="card"><div className="card-title">🥧 Portfolio Allocation</div><div className="flex" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><ResponsiveContainer width={160} height={160}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>{pieData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip formatter={v => fmt(v)} /></PieChart></ResponsiveContainer><div style={{ flex: 1, minWidth: 120, maxHeight: 200, overflowY: 'auto' }}>{pieData.map((d, i) => (<div key={i} className="flex justify-between items-center mb-2"><div className="flex items-center gap-2 fs-12"><span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} /><span className="text-muted">{d.name}</span></div><span className="font-mono fs-12 fw-bold">{d.pct}%</span></div>))}</div></div></div>
          <div className="card"><div className="card-title">📊 Invested vs Current</div><ResponsiveContainer width="100%" height={190}><BarChart data={barData}><XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} /><YAxis hide /><Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, fontSize: 12 }} /><Bar dataKey="invested" fill="var(--blue)" name="Invested" radius={[3,3,0,0]} maxBarSize={16} /><Bar dataKey="current" fill="var(--green)" name="Current" radius={[3,3,0,0]} maxBarSize={16} /><Legend wrapperStyle={{ fontSize: 11 }} /></BarChart></ResponsiveContainer></div>
        </div>
      )}

      {tab === 'analysis' && <PriceAnalysisTab items={itemsWithAlloc} />}
      {tab === 'broker' && <BrokerReportTab items={itemsWithAlloc} brokers={brokers} />}
      {tab === 'dividends' && <DividendTab items={itemsWithAlloc} stocks={stocks} />}

      {modal && <Modal title={edit ? '✏️ Edit Stock' : '➕ Add Stock'} onClose={() => { setModal(false); setEdit(null); }}>
        <InvForm item={edit} stocks={stocks} brokers={brokers} onSave={save} onSaveAndAnother={saveAndAnother} onClose={() => { setModal(false); setEdit(null); }} />
      </Modal>}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}