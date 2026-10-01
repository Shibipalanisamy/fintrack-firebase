import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { investmentService, investmentSummaryService, stockMasterService, dividendService, brokerService, pinService } from '../utils/dbService';
import { fmt, fmtDate, fmtDateInput, today, exportCSV, importCSV, PALETTE } from '../utils/helpers';
import { fetchLivePrices, setAppsScriptUrl } from '../utils/stockPriceService';
import { Modal, ConfirmDelete, DateStepper } from '../components/UI';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts';
import toast from 'react-hot-toast';
import { db, auth } from '../utils/firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import ContractUploader, { SOURCES } from './ContractUploader';
import ECASAnalyzer from './ECASAnalyzer';

// Loaded on demand — its code isn't downloaded until the 52W tab is actually clicked
const PriceAnalysisTab = lazy(() => import('./PriceAnalysisTab'));

// Broker sources supported by ContractUploader
//const SOURCES = ['Mstock', 'Aionion'];

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
function InvForm({ item, stocks, brokers, banks, existingItems, onSave, onSaveAndAnother, onClose }) {
  const defaultBank = banks?.find(b => b.name.toLowerCase().includes('idfc'))?.name || banks?.[0]?.name || '';
  const BLANK = { purchaseDate: today(), stockName: '', symbol: '', quantity: '', purchasePrice: '', currentPrice: '', brokerName: '', brokerage: '', bankAccount: defaultBank };
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

  // Live duplicate warning — same fingerprint logic as the Holdings tab's
  // duplicate finder (symbol + broker + date + qty + price). Only checks
  // OTHER records (excludes the one currently being edited).
  const possibleDuplicate = (() => {
    if (!existingItems || !f.symbol || !f.quantity || !f.purchasePrice) return null;
    const sym = f.symbol.toUpperCase().trim();
    const broker = (f.brokerName || '').toUpperCase().trim();
    const date = f.purchaseDate;
    const qty = Math.round((parseFloat(f.quantity) || 0) * 100) / 100;
    const price = Math.round((parseFloat(f.purchasePrice) || 0) * 100) / 100;
    return existingItems.find(i => {
      if (item && i.id === item.id) return false; // don't flag the record being edited against itself
      const iSym = (i.symbol || i.stockName || '').toUpperCase().trim();
      const iBroker = (i.brokerName || '').toUpperCase().trim();
      const iDate = fmtDateInput(i.purchaseDate);
      const iQty = Math.round((+i.quantity || 0) * 100) / 100;
      const iPrice = Math.round((+i.purchasePrice || 0) * 100) / 100;
      return iSym === sym && iBroker === broker && iDate === date && iQty === qty && iPrice === price;
    }) || null;
  })();

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
        <div className="fg"><label className="fl">Purchase Date</label><DateStepper name="purchaseDate" value={f.purchaseDate} onChange={ch} required /></div>
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

      {/* Bank Account */}
      {banks && banks.length > 0 && (
        <div className="fg">
          <label className="fl">Bank Account <span className="text-muted fs-11">(funds debited on purchase)</span></label>
          <select className="fs" name="bankAccount" value={f.bankAccount || defaultBank} onChange={ch}>
            {banks.map(b => <option key={b.id} value={b.name}>{b.icon || '🏦'} {b.name}</option>)}
          </select>
          {f.bankAccount && (
            <div style={{ marginTop: 5, background: 'rgba(147,197,253,.1)', border: '1px solid rgba(147,197,253,.25)', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: '#93c5fd', fontWeight: 700 }}>
              📈 Investment cost will be synced and deducted from <strong>{f.bankAccount}</strong> on the Banking page
            </div>
          )}
        </div>
      )}

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

      {possibleDuplicate && (
        <div style={{ background: 'var(--red-soft, rgba(244,63,94,.1))', border: '1px solid var(--red, #f43f5e)', borderRadius: 10, padding: '10px 12px', marginTop: 10, fontSize: 12 }}>
          <div style={{ fontWeight: 800, color: 'var(--red, #f43f5e)', marginBottom: 2 }}>⚠️ This looks like a duplicate</div>
          <div className="text-muted">
            An existing entry already matches this symbol, broker, date, quantity &amp; price
            {possibleDuplicate.createdAt ? ` (added ${fmtDate(possibleDuplicate.createdAt)})` : ''}.
            You can still save if this is genuinely a separate trade — otherwise Cancel and check the Holdings tab.
          </div>
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
function DividendTab({ items, stocks, banks }) {
  const [dividends, setDividends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [search, setSearch] = useState('');
  const [checkedSymbols, setCheckedSymbols] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [subTab, setSubTab] = useState('history');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [expandedSymbols, setExpandedSymbols] = useState(new Set());
  const defaultDivBank = banks?.find(b => b.name.toLowerCase().includes('idfc'))?.name || banks?.[0]?.name || '';
  const [form, setForm] = useState({ date: today(), symbol: '', stockName: '', shares: '', dividendPerShare: '', totalAmount: '', notes: '', bankAccount: defaultDivBank, reinvestmentOption: 'none', reinvestedAmount: '' });

  const now = new Date();
  const curFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [selFY, setSelFY] = useState(curFY);

  const fyLabel = (fy) => fy === null ? 'All Time' : `FY ${fy}-${String(fy + 1).slice(2)}`;
  const fyStart = (fy) => new Date(fy, 3, 1);
  const fyEnd   = (fy) => new Date(fy + 1, 2, 31, 23, 59, 59);

  const fyYears = [...new Set(dividends.map(d => {
    const dt = d.date instanceof Date ? d.date : new Date(d.date);
    return dt.getMonth() >= 3 ? dt.getFullYear() : dt.getFullYear() - 1;
  }))].sort((a, b) => b - a);

  const loadDividends = async () => {
    setLoading(true);
    try { setDividends(await dividendService.getAll()); }
    catch (e) { console.error('Load dividends failed:', e); toast.error('Failed to load: ' + (e.message || e)); }
    finally { setLoading(false); }
  };

  const handleCSVImport = async e => {
    const file = e.target.files[0]; if (!file) return;
    setImporting(true);
    setImportProgress({ current: 0, total: 0 });
    try {
      const rows = await importCSV(file);
      const valid = rows.filter(r => {
        const hasSym = r.symbol || r.Symbol || r.stockName || r['Stock Name'];
        const hasAmt = r.dividendPerShare || r['Dividend/Share'] || r.totalAmount || r['Total Amount'];
        return hasSym && hasAmt;
      });
      if (valid.length === 0) { toast.error('No valid rows found — check CSV columns'); return; }
      setImportProgress({ current: 0, total: valid.length });
      let imported = 0, failed = 0;
      for (const r of valid) {
        try {
          const symbol      = (r.symbol        || r.Symbol        || '').trim().toUpperCase();
          const stockName   = (r.stockName      || r['Stock Name'] || symbol).trim();
          const rawDate     = (r.date           || r.Date          || today()).trim();
          const shares      = parseFloat(r.shares          || r.Shares           || 0) || 0;
          const dps         = parseFloat(r.dividendPerShare || r['Dividend/Share'] || 0) || 0;
          const totalAmount = parseFloat(r.totalAmount      || r['Total Amount']  || 0) || (shares * dps);
          const notes       = (r.notes          || r.Notes         || '').trim();
          const date        = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today();
          if (!symbol && !stockName) { failed++; continue; }
          await dividendService.create({ symbol, stockName, date, shares, dividendPerShare: dps, totalAmount, notes });
          imported++;
          setImportProgress({ current: imported + failed, total: valid.length });
        } catch (rowErr) { console.error('Row failed:', r, rowErr); failed++; }
      }
      if (imported > 0) toast.success(`Imported ${imported} records!${failed > 0 ? ` (${failed} skipped)` : ''}`);
      else toast.error(`All ${failed} rows failed — check console`);
      loadDividends();
    } catch (err) { console.error('Dividend import error:', err); toast.error('Import failed: ' + (err.message || 'Unknown error')); }
    finally { setImporting(false); setImportProgress({ current: 0, total: 0 }); e.target.value = ''; }
  };

  useEffect(() => { loadDividends(); }, []);
  const ch = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const handleSharesOrDPS = (field, val) => {
    setForm(p => {
      const u = { ...p, [field]: val };
      const s = parseFloat(field === 'shares' ? val : p.shares) || 0;
      const d = parseFloat(field === 'dividendPerShare' ? val : p.dividendPerShare) || 0;
      if (s && d) u.totalAmount = (s * d).toFixed(2);
      return u;
    });
  };
  const handlePickStock = (sym) => {
    const h = items.find(i => i.symbol === sym || i.stockName === sym);
    const m = stocks.find(s => s.symbol === sym);
    setForm(p => ({ ...p, symbol: sym, stockName: m?.name || h?.stockName || sym, shares: h ? String(h.quantity) : '', totalAmount: h && p.dividendPerShare ? String((h.quantity * parseFloat(p.dividendPerShare)).toFixed(2)) : p.totalAmount }));
  };
  const handleDivSymbolSelect = (stock) => {
    const h = items.find(i => i.symbol === stock.symbol);
    setForm(p => ({ ...p, symbol: stock.symbol, stockName: stock.name, shares: h ? String(h.quantity) : p.shares, totalAmount: h && p.dividendPerShare ? String((h.quantity * parseFloat(p.dividendPerShare)).toFixed(2)) : p.totalAmount }));
  };

  // Sums quantity across every purchase of this symbol made ON OR BEFORE the
  // given record date — this is what a dividend actually pays out on, NOT
  // your current total holding (which may include shares bought after the
  // record date).
  const sharesAsOfDate = (symbol, dateStr) => {
    if (!symbol || !dateStr) return 0;
    const cutoff = new Date(dateStr);
    return items
      .filter(i => (i.symbol === symbol || i.stockName === symbol) && new Date(i.purchaseDate) <= cutoff)
      .reduce((s, i) => s + (+i.quantity || 0), 0);
  };

  const calcSharesAsOfRecordDate = () => {
    if (!form.symbol) { toast.error('Pick a stock symbol first'); return; }
    if (!form.date) { toast.error('Set the record date first'); return; }
    const shares = sharesAsOfDate(form.symbol, form.date);
    if (shares === 0) { toast.error(`No purchases of ${form.symbol} found on or before ${form.date}`); return; }
    handleSharesOrDPS('shares', String(shares));
    toast.success(`${shares} shares held as of ${fmtDate(form.date)}`);
  };
  const save = async () => {
    if (!form.symbol || !form.dividendPerShare) { toast.error('Fill symbol and dividend per share'); return; }
    const data = { ...form, shares: parseFloat(form.shares) || 0, dividendPerShare: parseFloat(form.dividendPerShare), totalAmount: parseFloat(form.totalAmount) || (parseFloat(form.shares) * parseFloat(form.dividendPerShare)), reinvestmentOption: form.reinvestmentOption || 'none', reinvestedAmount: form.reinvestmentOption === 'partial' ? (parseFloat(form.reinvestedAmount) || 0) : 0 };
    try {
      if (edit) { await dividendService.update(edit.id, data); toast.success('Updated!'); }
      else { await dividendService.create(data); toast.success('Added!'); }
      setModal(false); setEdit(null);
      setForm({ date: today(), symbol: '', stockName: '', shares: '', dividendPerShare: '', totalAmount: '', notes: '', bankAccount: defaultDivBank, reinvestmentOption: 'none', reinvestedAmount: '' });
      loadDividends();
    } catch { toast.error('Failed'); }
  };
  const del = async () => { try { await dividendService.delete(delId); toast.success('Deleted'); setDelId(null); loadDividends(); } catch { toast.error('Failed'); } };

  // Reinvested amount for a dividend record: full = entire payout, partial = the amount specified, none = 0
  const getReinvestedAmt = (d) => {
    if (d.reinvestmentOption === 'full') return parseFloat(d.totalAmount) || 0;
    if (d.reinvestmentOption === 'partial') return parseFloat(d.reinvestedAmount) || 0;
    return 0;
  };
  const reinvestLabel = (opt) => opt === 'full' ? '🔁 Full' : opt === 'partial' ? '🔁 Partial' : '—';

  // Bulk delete selected rows
  const deleteSelected = async () => {
    try {
      for (const id of selectedRows) await dividendService.delete(id);
      toast.success(`Deleted ${selectedRows.size} records`);
      setSelectedRows(new Set());
      loadDividends();
    } catch (e) { toast.error('Delete failed: ' + e.message); }
  };

  const toggleRow = id => setSelectedRows(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelectedRows(s => s.size === filteredDividends.length ? new Set() : new Set(filteredDividends.map(d => d.id)));
  const toggleExpandSym = sym => setExpandedSymbols(s => { const n = new Set(s); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });

  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const toggleSort = (field) => { if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(field); setSortDir('desc'); } };

  // FY filtered
  const fyFiltered = dividends.filter(d => {
    if (selFY === null) return true;
    const dt = d.date instanceof Date ? d.date : new Date(d.date);
    return dt >= fyStart(selFY) && dt <= fyEnd(selFY);
  });

  const totalReceived = dividends.reduce((s, d) => s + (parseFloat(d.totalAmount) || 0), 0);
  const fyTotal = fyFiltered.reduce((s, d) => s + (parseFloat(d.totalAmount) || 0), 0);
  // Reinvestment aggregates — kept fully separate from regular payout totals above
  const totalReinvested = dividends.reduce((s, d) => s + getReinvestedAmt(d), 0);
  const fyReinvested = fyFiltered.reduce((s, d) => s + getReinvestedAmt(d), 0);
  const reinvestedRecords = dividends.filter(d => d.reinvestmentOption === 'full' || d.reinvestmentOption === 'partial');
  const reinvestBySymbol = {};
  reinvestedRecords.forEach(d => {
    const sym = d.symbol || d.stockName;
    if (!reinvestBySymbol[sym]) reinvestBySymbol[sym] = { symbol: d.symbol, name: d.stockName, total: 0, count: 0 };
    reinvestBySymbol[sym].total += getReinvestedAmt(d);
    reinvestBySymbol[sym].count++;
  });
  const reinvestBySymbolList = Object.values(reinvestBySymbol).sort((a, b) => b.total - a.total);
  // Merge portfolio investment symbols + Stock Master symbols (added via Settings)
  // so the quick-picker shows ALL known symbols, not just those held in portfolio
  const holdingSymbols = [...new Set([
    ...items.map(i => i.symbol || i.stockName),
    ...stocks.map(s => s.symbol),
  ].filter(Boolean))].sort();
  const divSymbols = [...new Set(dividends.map(d => d.symbol || d.stockName).filter(Boolean))].sort();
  const searchMatchSymbols = divSymbols.filter(s => !search || s.toLowerCase().includes(search.toLowerCase()));
  const toggleSym = sym => setCheckedSymbols(s => { const n = new Set(s); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });

  const filteredDividends = fyFiltered.filter(d => {
    const sym = d.symbol || d.stockName;
    const matchSearch = !search || sym?.toLowerCase().includes(search.toLowerCase()) || d.stockName?.toLowerCase().includes(search.toLowerCase());
    const matchChecked = checkedSymbols.size === 0 || checkedSymbols.has(sym);
    return matchSearch && matchChecked;
  }).sort((a, b) => {
    let av, bv;
    if (sortField === 'date')   { av = new Date(a.date); bv = new Date(b.date); }
    else if (sortField === 'stock')  { av = (a.symbol || a.stockName || '').toLowerCase(); bv = (b.symbol || b.stockName || '').toLowerCase(); }
    else if (sortField === 'total')  { av = parseFloat(a.totalAmount) || 0; bv = parseFloat(b.totalAmount) || 0; }
    else if (sortField === 'shares') { av = parseFloat(a.shares) || 0; bv = parseFloat(b.shares) || 0; }
    else { av = 0; bv = 0; }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  const filteredTotal = filteredDividends.reduce((s, d) => s + (parseFloat(d.totalAmount) || 0), 0);

  // Symbol x Year matrix (all-time, not FY filtered)
  const allFYs = fyYears.length > 0 ? fyYears : [curFY];
  const symYearMap = {};
  dividends.forEach(d => {
    const sym = d.symbol || d.stockName;
    const dt = d.date instanceof Date ? d.date : new Date(d.date);
    const fy = dt.getMonth() >= 3 ? dt.getFullYear() : dt.getFullYear() - 1;
    const amt = parseFloat(d.totalAmount) || 0;
    if (!symYearMap[sym]) symYearMap[sym] = { symbol: d.symbol, name: d.stockName, years: {}, total: 0, records: [] };
    symYearMap[sym].years[fy] = (symYearMap[sym].years[fy] || 0) + amt;
    symYearMap[sym].total += amt;
    symYearMap[sym].records.push(d);
  });
  const symRows = Object.values(symYearMap).sort((a, b) => b.total - a.total);
  const fyColTotals = allFYs.reduce((acc, fy) => { acc[fy] = symRows.reduce((s, r) => s + (r.years[fy] || 0), 0); return acc; }, {});
  const grandTotal = symRows.reduce((s, r) => s + r.total, 0);

  // FY summary cards (for selected FY) — NO border-left colored cards, use simple pills
  const fySummary = {};
  fyFiltered.forEach(d => {
    const k = d.symbol || d.stockName;
    if (!fySummary[k]) fySummary[k] = { symbol: d.symbol, name: d.stockName, total: 0, count: 0 };
    fySummary[k].total += parseFloat(d.totalAmount) || 0;
    fySummary[k].count++;
  });
  const fySummaryList = Object.values(fySummary).sort((a, b) => b.total - a.total);

  return (
    <div>
      {/* Stats */}
      <div className="stats mb-4">
        {[
          { icon: '💰', label: 'All Time Total', val: fmt(totalReceived), c: 'var(--green)' },
          { icon: '📅', label: fyLabel(selFY), val: fmt(fyTotal), c: 'var(--blue)' },
          { icon: '📋', label: 'Total Records', val: dividends.length, c: 'var(--purple)' },
          { icon: '📈', label: 'Stocks Paying', val: Object.keys(symYearMap).length, c: 'var(--orange)' },
        ].map((s, i) => (
          <div key={i} className="stat" style={{ '--c': s.c }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-val" style={{ color: s.c }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* FY Filter chips — no icon prefix */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, alignItems: 'center' }}>
        <span className="fs-12 fw-700 text-muted">Period:</span>
        {[null, ...allFYs].map(fy => {
          const fyAmt = fy === null ? totalReceived : dividends.filter(d => {
            const dt = d.date instanceof Date ? d.date : new Date(d.date);
            return dt >= fyStart(fy) && dt <= fyEnd(fy);
          }).reduce((s, d) => s + (parseFloat(d.totalAmount) || 0), 0);
          return (
            <button key={String(fy)} type="button" onClick={() => setSelFY(fy)}
              style={{ padding: '5px 14px', borderRadius: 20, border: `1.5px solid ${selFY === fy ? 'var(--blue)' : 'var(--border2)'}`, background: selFY === fy ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: selFY === fy ? 'var(--blue)' : 'var(--t2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {fyLabel(fy)}
              {fyAmt > 0 && <span style={{ fontSize: 10, marginLeft: 5, opacity: 0.75 }}>{fmt(fyAmt)}</span>}
            </button>
          );
        })}
      </div>

      {/* Symbol summary — simple table style, no colored border cards */}
      {fySummaryList.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {fySummaryList.map((s, i) => (
            <div key={s.symbol} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: PALETTE[i % PALETTE.length] }}>{s.symbol}</span>
              <span className="fw-800 fs-13 amt-g">{fmt(s.total)}</span>
              <span className="fs-11 text-muted">{s.count} pmt</span>
            </div>
          ))}
        </div>
      )}

      {/* Import progress bar */}
      {importing && importProgress.total > 0 && (
        <div style={{ background: 'rgba(77,158,255,.08)', border: '1px solid rgba(77,158,255,.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <div className="flex justify-between items-center mb-2">
            <span className="fs-13 fw-700" style={{ color: 'var(--blue)' }}>⬆️ Importing... {importProgress.current} / {importProgress.total}</span>
            <span className="fs-12 text-muted">{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
          </div>
          <div style={{ background: 'var(--bg3)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(importProgress.current / importProgress.total) * 100}%`, background: 'var(--blue)', borderRadius: 6, transition: 'width .2s' }} />
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex items-center mb-3" style={{ borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 4 }}>
        {[{ key: 'history', label: '📋 History' }, { key: 'summary', label: '📊 Symbol × Year' }, { key: 'reinvested', label: '🔁 Reinvested' }].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            style={{ padding: '7px 16px', borderRadius: '8px 8px 0 0', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: subTab === t.key ? 'var(--bg3)' : 'transparent', color: subTab === t.key ? 'var(--text)' : 'var(--t3)', borderBottom: subTab === t.key ? '2px solid var(--blue)' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 4 }}>
          {dividends.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(
              dividends.map(d => ({ date: d.date instanceof Date ? fmtDateInput(d.date) : (d.date || ''), symbol: d.symbol || '', stockName: d.stockName || '', shares: d.shares || 0, dividendPerShare: d.dividendPerShare || 0, totalAmount: d.totalAmount || 0, reinvestmentOption: d.reinvestmentOption || 'none', reinvestedAmount: getReinvestedAmt(d), notes: d.notes || '' })),
              'dividends.csv'
            )}>⬇️ Export</button>
          )}
          <label className="btn btn-secondary btn-sm" style={{ cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
            {importing ? <><span className="spin" style={{ width: 11, height: 11, borderWidth: 2 }} /> {importProgress.total > 0 ? `${importProgress.current}/${importProgress.total}` : 'Importing...'}</> : '⬆️ Import'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} disabled={importing} />
          </label>
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm({ date: today(), symbol: '', stockName: '', shares: '', dividendPerShare: '', totalAmount: '', notes: '', bankAccount: defaultDivBank, reinvestmentOption: 'none', reinvestedAmount: '' }); setModal(true); }}>+ Add</button>
        </div>
      </div>

      {/* History sub-tab */}
      {subTab === 'history' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 12px', marginBottom: 10 }}>
            <span>🔍</span>
            <input style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, flex: 1 }} placeholder="Search by symbol..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}>✕</button>}
          </div>
          {divSymbols.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {checkedSymbols.size > 0 && <button onClick={() => setCheckedSymbols(new Set())} style={{ padding: '3px 10px', borderRadius: 20, border: '1.5px solid var(--border2)', background: 'var(--bg3)', color: 'var(--t3)', fontSize: 11, cursor: 'pointer' }}>✕ Clear</button>}
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

          {/* Bulk delete bar */}
          {selectedRows.size > 0 && (
            <div style={{ background: 'rgba(244,63,94,.08)', border: '1px solid rgba(244,63,94,.25)', borderRadius: 8, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="fw-700 fs-13" style={{ color: 'var(--red)' }}>{selectedRows.size} selected</span>
              <button className="btn btn-danger btn-sm" onClick={deleteSelected}>🗑️ Delete Selected</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedRows(new Set())}>✕ Clear</button>
            </div>
          )}

          {loading
            ? <div className="spin-center"><div className="spin spin-lg" /></div>
            : filteredDividends.length === 0
              ? <div className="card"><div className="empty"><div className="empty-icon">💸</div><div className="empty-title">{dividends.length === 0 ? 'No dividends yet' : 'No match for selected period / filter'}</div></div></div>
              : <div className="tbl-wrap"><table className="tbl">
                  <thead><tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox"
                        checked={selectedRows.size === filteredDividends.length && filteredDividends.length > 0}
                        onChange={toggleAll}
                        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--blue)' }} />
                    </th>
                    {[
                      { key: 'date',   label: 'Date',       align: 'left'  },
                      { key: 'stock',  label: 'Symbol',     align: 'left'  },
                      { key: null,     label: 'Stock Name', align: 'left'  },
                      { key: 'shares', label: 'Shares',     align: 'right' },
                      { key: null,     label: 'Div/Share',  align: 'right' },
                      { key: 'total',  label: 'Total',      align: 'right' },
                      { key: null,     label: 'Reinvestment Option', align: 'left' },
                      { key: null,     label: 'Notes',      align: 'left'  },
                      { key: null,     label: 'Bank',       align: 'left'  },
                      { key: null,     label: 'Actions',    align: 'left'  },
                    ].map((col, ci) => (
                      <th key={ci} style={{ textAlign: col.align, cursor: col.key ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}
                        onClick={() => col.key && toggleSort(col.key)}>
                        {col.label}
                        {col.key && (
                          <span style={{ marginLeft: 4, fontSize: 10, color: sortField === col.key ? 'var(--blue)' : 'var(--t3)' }}>
                            {sortField === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>{filteredDividends.map(d => (
                    <tr key={d.id} style={{ background: selectedRows.has(d.id) ? 'rgba(77,158,255,.06)' : 'transparent' }}>
                      <td>
                        <input type="checkbox" checked={selectedRows.has(d.id)} onChange={() => toggleRow(d.id)}
                          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--blue)' }} />
                      </td>
                      <td className="font-mono fs-12 text-muted">{fmtDate(d.date)}</td>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, background: 'var(--bg3)', padding: '3px 8px', borderRadius: 6, color: 'var(--blue)' }}>{d.symbol || '—'}</span></td>
                      <td className="fw-600 fs-13">{d.stockName}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono fs-12">{d.shares || '—'}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono fs-12">{fmt(d.dividendPerShare)}</td>
                      <td style={{ textAlign: 'right' }}><span className="amt amt-g fw-700">{fmt(d.totalAmount)}</span></td>
                      <td className="fs-12">
                        {d.reinvestmentOption === 'full' && <span style={{ background: 'rgba(167,139,250,.12)', color: 'var(--purple)', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>🔁 Full</span>}
                        {d.reinvestmentOption === 'partial' && <span style={{ background: 'rgba(167,139,250,.12)', color: 'var(--purple)', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>🔁 Partial · {fmt(getReinvestedAmt(d))}</span>}
                        {(!d.reinvestmentOption || d.reinvestmentOption === 'none') && <span className="text-muted">—</span>}
                      </td>
                      <td className="text-muted fs-12">{d.notes || '—'}</td>
                      <td className="fs-12">{d.bankAccount ? <span style={{ background: 'rgba(34,197,94,.1)', color: 'var(--green)', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>🏦 {d.bankAccount}</span> : <span className="text-muted">—</span>}</td>
                      <td><div className="actions">
                        <button className="btn-icon" onClick={() => {
                          setEdit(d);
                          const safeDate = d.date instanceof Date ? (isNaN(d.date.getTime()) ? today() : fmtDateInput(d.date)) : (d.date || today());
                          setForm({ ...d, date: safeDate, shares: String(d.shares || ''), dividendPerShare: String(d.dividendPerShare || ''), totalAmount: String(d.totalAmount || ''), reinvestmentOption: d.reinvestmentOption || 'none', reinvestedAmount: String(d.reinvestedAmount || '') });
                          setModal(true);
                        }}>✏️</button>
                        <button className="btn-icon" onClick={() => setDelId(d.id)}>🗑️</button>
                      </div></td>
                    </tr>
                  ))}</tbody>
                  <tfoot><tr>
                    <td colSpan={6} className="text-muted fs-12" style={{ padding: '10px 14px' }}>
                      TOTAL — {checkedSymbols.size > 0 || search ? 'filtered · ' : ''}{fyLabel(selFY)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 14px' }}><span className="amt amt-g fw-800">{fmt(filteredTotal)}</span></td>
                    <td colSpan={3} />
                  </tr></tfoot>
                </table></div>
          }
        </>
      )}

      {/* Symbol × Year sub-tab */}
      {subTab === 'summary' && (
        symRows.length === 0
          ? <div className="card"><div className="empty"><div className="empty-icon">📊</div><div className="empty-title">No data yet</div></div></div>
          : <div>
              {/* Grand total summary */}
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="fw-700 fs-13">{symRows.length} stocks · {dividends.length} payments</span>
                <span className="fw-900 fs-15 amt-g">{fmt(grandTotal)} total</span>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}></th>
                      <th>Symbol</th>
                      <th>Stock Name</th>
                      {allFYs.map(fy => <th key={fy} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>FY {fy}-{String(fy+1).slice(2)}</th>)}
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {symRows.map((r, i) => (
                      <>
                        <tr key={r.symbol} style={{ background: expandedSymbols.has(r.symbol) ? 'rgba(77,158,255,.04)' : 'transparent' }}>
                          <td>
                            <button type="button" onClick={() => toggleExpandSym(r.symbol)}
                              style={{ width: 20, height: 20, borderRadius: 4, border: '1.5px solid var(--border2)', background: expandedSymbols.has(r.symbol) ? 'var(--blue)' : 'var(--bg3)', color: expandedSymbols.has(r.symbol) ? '#fff' : 'var(--t3)', cursor: 'pointer', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                              {expandedSymbols.has(r.symbol) ? '−' : '+'}
                            </button>
                          </td>
                          <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: PALETTE[i % PALETTE.length], background: PALETTE[i % PALETTE.length] + '15', padding: '2px 7px', borderRadius: 5 }}>{r.symbol}</span></td>
                          <td className="fs-12 fw-600">{r.name}</td>
                          {allFYs.map(fy => (
                            <td key={fy} style={{ textAlign: 'right' }}>
                              {r.years[fy] ? <span className="amt-g fw-700 fs-12">{fmt(r.years[fy])}</span> : <span className="text-muted fs-12">—</span>}
                            </td>
                          ))}
                          <td style={{ textAlign: 'right' }}><span className="fw-900 amt-g">{fmt(r.total)}</span></td>
                        </tr>
                        {expandedSymbols.has(r.symbol) && r.records.sort((a, b) => new Date(b.date) - new Date(a.date)).map(d => (
                          <tr key={d.id} style={{ background: 'rgba(77,158,255,.04)', fontSize: 12 }}>
                            <td></td>
                            <td className="text-muted fs-11" style={{ paddingLeft: 20 }}>↳ {fmtDate(d.date)}</td>
                            <td className="text-muted fs-12">{d.notes || '—'}</td>
                      <td className="fs-12">{d.bankAccount ? <span style={{ background: 'rgba(34,197,94,.1)', color: 'var(--green)', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>🏦 {d.bankAccount}</span> : <span className="text-muted">—</span>}</td>
                            <td colSpan={allFYs.length} style={{ textAlign: 'right' }}>
                              <span className="text-muted fs-11">{d.shares} × {fmt(d.dividendPerShare)}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}><span className="amt-g fw-700 fs-12">{fmt(d.totalAmount)}</span></td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="fw-700 fs-12 text-muted" style={{ padding: '8px 14px' }}>TOTAL ({symRows.length} stocks)</td>
                      {allFYs.map(fy => (
                        <td key={fy} style={{ textAlign: 'right', padding: '8px 14px' }}>
                          <span className="fw-800 amt-g">{fmt(fyColTotals[fy] || 0)}</span>
                        </td>
                      ))}
                      <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="fw-900 fs-14 amt-g">{fmt(grandTotal)}</span></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
      )}

      {/* Reinvested sub-tab — kept clearly separate from regular payout totals above */}
      {subTab === 'reinvested' && (
        <div>
          <div className="stats mb-4">
            {[
              { icon: '🔁', label: 'Total Reinvested (All Time)', val: fmt(totalReinvested), c: 'var(--purple)' },
              { icon: '📅', label: `Reinvested — ${fyLabel(selFY)}`, val: fmt(fyReinvested), c: 'var(--blue)' },
              { icon: '📋', label: 'Reinvested Records', val: reinvestedRecords.length, c: 'var(--green)' },
            ].map((s, i) => (
              <div key={i} className="stat" style={{ '--c': s.c }}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-val" style={{ color: s.c }}>{s.val}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {reinvestedRecords.length === 0 ? (
            <div className="card"><div className="empty"><div className="empty-icon">🔁</div><div className="empty-title">No reinvestments recorded yet</div><div className="text-muted fs-12 mt-1">Set a "Reinvestment Option" of Full or Partial on a dividend entry to track it here.</div></div></div>
          ) : (
            <>
              {/* By-symbol breakdown */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {reinvestBySymbolList.map((r, i) => (
                  <div key={r.symbol || i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 14px', minWidth: 140 }}>
                    <div className="fs-12 fw-700" style={{ fontFamily: 'monospace' }}>{r.symbol || r.name}</div>
                    <div className="fs-14 fw-800" style={{ color: 'var(--purple)' }}>{fmt(r.total)}</div>
                    <div className="fs-11 text-muted">{r.count} reinvestment{r.count !== 1 ? 's' : ''}</div>
                  </div>
                ))}
              </div>

              {/* Reinvestment records table */}
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>
                    <th>Date</th>
                    <th>Symbol</th>
                    <th>Stock Name</th>
                    <th style={{ textAlign: 'right' }}>Dividend Total</th>
                    <th>Option</th>
                    <th style={{ textAlign: 'right' }}>Reinvested Amount</th>
                  </tr></thead>
                  <tbody>
                    {reinvestedRecords.sort((a, b) => new Date(b.date) - new Date(a.date)).map(d => (
                      <tr key={d.id}>
                        <td className="font-mono fs-12 text-muted">{fmtDate(d.date)}</td>
                        <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12, background: 'var(--bg3)', padding: '2px 8px', borderRadius: 6, color: 'var(--blue)' }}>{d.symbol || '—'}</span></td>
                        <td className="fw-600 fs-13">{d.stockName}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono fs-12">{fmt(d.totalAmount)}</td>
                        <td className="fs-12">{reinvestLabel(d.reinvestmentOption)}</td>
                        <td style={{ textAlign: 'right' }}><span className="fw-800" style={{ color: 'var(--purple)' }}>{fmt(getReinvestedAmt(d))}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr>
                    <td colSpan={5} className="text-muted fs-12" style={{ padding: '10px 14px' }}>TOTAL REINVESTED — {fyLabel(selFY)}</td>
                    <td style={{ textAlign: 'right', padding: '10px 14px' }}><span className="fw-900" style={{ color: 'var(--purple)' }}>{fmt(reinvestedRecords.filter(d => selFY === null || (new Date(d.date) >= fyStart(selFY) && new Date(d.date) <= fyEnd(selFY))).reduce((s, d) => s + getReinvestedAmt(d), 0))}</span></td>
                  </tr></tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {modal && (
        <Modal title={edit ? '✏️ Edit Dividend' : '💸 Add Dividend'} onClose={() => { setModal(false); setEdit(null); }}>
          <div className="fg"><label className="fl">Record Date <span className="text-muted" style={{ fontWeight: 400, textTransform: 'none' }}>(shareholding cutoff for this dividend)</span></label><DateStepper name="date" value={form.date} onChange={ch} /></div>
          {holdingSymbols.length > 0 && <div className="fg"><label className="fl">Quick Pick <span className="text-muted fs-11">(holdings + stock master)</span></label><HoldingSymbolPicker symbols={holdingSymbols} selected={form.symbol} onSelect={handlePickStock} /></div>}
          <div className="frow"><div className="fg"><label className="fl">Symbol {form.stockName && <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 600 }}>✓ {form.stockName}</span>}</label><SymbolDropdown stocks={stocks} value={form.symbol} onChange={val => setForm(p => ({ ...p, symbol: val }))} onSelect={handleDivSymbolSelect} /></div><div className="fg"><label className="fl">Stock Name</label><input className="fi" name="stockName" value={form.stockName} onChange={ch} placeholder="Auto-filled" /></div></div>
          <div className="frow"><div className="fg"><label className="fl">No. of Shares <button type="button" onClick={calcSharesAsOfRecordDate} style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, border: '1px solid var(--blue)', background: 'rgba(77,158,255,.1)', color: 'var(--blue)', cursor: 'pointer' }}>📅 Calc as of Record Date</button></label><input className="fi" type="number" name="shares" value={form.shares} onChange={e => handleSharesOrDPS('shares', e.target.value)} placeholder="e.g. 100" /></div><div className="fg"><label className="fl">Dividend/Share (Rs)</label><input className="fi" type="number" name="dividendPerShare" value={form.dividendPerShare} onChange={e => handleSharesOrDPS('dividendPerShare', e.target.value)} step="0.01" required /></div></div>
          <div className="fg"><label className="fl">Total Amount (Rs) <span style={{ color: 'var(--green)', fontSize: 11 }}>auto-calc</span></label><div style={{ position: 'relative' }}><span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--t3)' }}>Rs</span><input className="fi" type="number" name="totalAmount" value={form.totalAmount} onChange={ch} style={{ paddingLeft: 28, fontWeight: 700 }} /></div>{form.shares && form.dividendPerShare && <div className="fs-11 amt-g mt-1">= {form.shares} × Rs {form.dividendPerShare} = Rs {(parseFloat(form.shares) * parseFloat(form.dividendPerShare)).toFixed(2)}</div>}</div>
          {banks && banks.length > 0 && (
            <div className="fg">
              <label className="fl">Credit to Bank Account <span className="text-muted fs-11">(dividend received in)</span></label>
              <select className="fs" name="bankAccount" value={form.bankAccount || defaultDivBank} onChange={ch}>
                {banks.map(b => <option key={b.id} value={b.name}>{b.icon || '🏦'} {b.name}</option>)}
              </select>
              {form.bankAccount && (
                <div style={{ marginTop: 5, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>
                  💵 Dividend will be credited to <strong>{form.bankAccount}</strong>
                </div>
              )}
            </div>
          )}
          <div className="fg"><label className="fl">Notes</label><input className="fi" name="notes" value={form.notes} onChange={ch} placeholder="e.g. Q3 FY25 interim dividend" /></div>
          <div className="frow">
            <div className="fg">
              <label className="fl">Reinvestment Option</label>
              <select className="fs" name="reinvestmentOption" value={form.reinvestmentOption || 'none'} onChange={ch}>
                <option value="none">None — payout only</option>
                <option value="full">Full — entire dividend reinvested</option>
                <option value="partial">Partial — part of the dividend reinvested</option>
              </select>
            </div>
            {form.reinvestmentOption === 'partial' && (
              <div className="fg"><label className="fl">Reinvested Amount (Rs)</label>
                <input className="fi" type="number" name="reinvestedAmount" value={form.reinvestedAmount} onChange={ch} placeholder="e.g. 500" min="0" max={form.totalAmount || undefined} />
              </div>
            )}
          </div>
          {form.reinvestmentOption === 'full' && form.totalAmount && (
            <div className="fs-11" style={{ color: 'var(--purple)', marginTop: -8, marginBottom: 8 }}>🔁 Entire {fmt(parseFloat(form.totalAmount))} will be recorded as reinvested</div>
          )}
          <div className="modal-foot"><button className="btn btn-secondary" onClick={() => { setModal(false); setEdit(null); }}>Cancel</button><button className="btn btn-primary" onClick={save}>{edit ? 'Update' : 'Add'}</button></div>
        </Modal>
      )}
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
  const [showSummary, setShowSummary] = useState(false);
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

  // Stock-wise summary: group filtered/sorted rows by symbol
  const stockSummary = (() => {
    const map = {};
    sorted.forEach(i => {
      const sym = i.symbol || i.stockName || '—';
      if (!map[sym]) map[sym] = { symbol: sym, stockName: i.stockName, count: 0, qty: 0, invested: 0, value: 0 };
      map[sym].count += 1;
      map[sym].qty += i.quantity || 0;
      map[sym].invested += i.totalInvested || 0;
      map[sym].value += i.currentValue || 0;
    });
    return Object.values(map)
      .map(s => ({ ...s, pnl: s.value - s.invested, avgPrice: s.qty > 0 ? s.invested / s.qty : 0, allocation: totalInvested > 0 ? ((s.invested / totalInvested) * 100).toFixed(2) : '0.00' }))
      .sort((a, b) => b.invested - a.invested);
  })();

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

      {/* Stock-wise Summary Table (collapsible) */}
      {sorted.length > 0 && (
        <div className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
          <div
            onClick={() => setShowSummary(v => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
          >
            <span className="fw-700 fs-13">📊 Stock Summary <span className="text-muted fw-400">({stockSummary.length} stocks)</span></span>
            <span style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 700 }}>{showSummary ? '▲ Hide' : '▼ Show'}</span>
          </div>
          {showSummary && (
            <div className="tbl-wrap" style={{ borderTop: '1px solid var(--border)' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Stock</th>
                    <th style={{ textAlign: 'right' }}>Count</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Avg Price</th>
                    <th style={{ textAlign: 'right' }}>Invested</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                    <th style={{ textAlign: 'right' }}>P&L</th>
                    <th style={{ textAlign: 'right' }}>Alloc%</th>
                  </tr>
                </thead>
                <tbody>
                  {stockSummary.map((s, idx) => (
                    <tr key={s.symbol}>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, background: 'var(--bg3)', padding: '3px 8px', borderRadius: 6, color: 'var(--blue)' }}>{(s.symbol || '—').replace(/^NSE:/i, '')}</span></td>
                      <td className="fw-600 fs-13">{s.stockName}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono fs-12">{s.count}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono fs-12">{s.qty}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono fs-12">{fmt(s.avgPrice)}</td>
                      <td style={{ textAlign: 'right' }}><span className="amt">{fmt(s.invested)}</span></td>
                      <td style={{ textAlign: 'right' }}><span className="amt">{fmt(s.value)}</span></td>
                      <td style={{ textAlign: 'right' }}><span className={`amt ${s.pnl >= 0 ? 'amt-g' : 'amt-r'}`}>{s.pnl >= 0 ? '+' : ''}{fmt(s.pnl)}</span></td>
                      <td style={{ textAlign: 'right' }}><span style={{ background: PALETTE[idx % PALETTE.length] + '22', color: PALETTE[idx % PALETTE.length], padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.allocation}%</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} className="text-muted fs-12" style={{ padding: '10px 14px' }}>TOTAL ({stockSummary.length} stocks)</td>
                    <td style={{ textAlign: 'right', padding: '10px 14px' }} className="font-mono fs-12 fw-800">{stockSummary.reduce((s, x) => s + x.count, 0)}</td>
                    <td style={{ textAlign: 'right', padding: '10px 14px' }} className="font-mono fs-12 fw-800">{stockSummary.reduce((s, x) => s + x.qty, 0)}</td>
                    <td style={{ textAlign: 'right', padding: '10px 14px' }} className="text-muted fs-12">—</td>
                    <td style={{ textAlign: 'right', padding: '10px 14px' }}><span className="amt fw-800">{fmt(totalInvested)}</span></td>
                    <td style={{ textAlign: 'right', padding: '10px 14px' }}><span className="amt fw-800">{fmt(totalValue)}</span></td>
                    <td style={{ textAlign: 'right', padding: '10px 14px' }}><span className={`amt fw-800 ${totalPnL >= 0 ? 'amt-g' : 'amt-r'}`}>{totalPnL >= 0 ? '+' : ''}{fmt(totalPnL)}</span></td>
                    <td style={{ textAlign: 'right', padding: '10px 14px' }} className="fw-800 fs-12">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
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

function LockedScreen({ page, onUnlock }) {
  const [input, setInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [storedPin, setStoredPin] = useState(() => pinService.getCached(page));
  const [mode, setMode] = useState(pinService.getCached(page) ? 'unlock' : 'setup');
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(true);

  useEffect(() => {
    pinService.get(page).then(pin => {
      setStoredPin(pin);
      setMode(pin ? 'unlock' : 'setup');
      setSyncing(false);
    }).catch(() => setSyncing(false));
  }, [page]);

  const handleUnlock = () => {
    if (input === storedPin) { onUnlock(); }
    else { setError('Wrong PIN. Try again.'); setInput(''); }
  };
  const handleSetup = async () => {
    if (newPin.length < 4) { setError('PIN must be at least 4 digits'); return; }
    if (newPin !== confirmPin) { setError('PINs do not match'); return; }
    await pinService.set(page, newPin);
    toast.success('✅ PIN saved — works on all your devices!');
    onUnlock();
  };
  const handleReset = async () => {
    await pinService.remove(page);
    setStoredPin(''); setMode('setup'); setError(''); setInput('');
  };

  if (syncing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spin spin-lg" style={{ margin: '0 auto 16px' }} />
          <div className="text-muted fs-13">Syncing PIN from your account...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '40px 36px', textAlign: 'center', minWidth: 300, maxWidth: 360 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>{mode === 'setup' ? 'Set a PIN' : 'Enter PIN'}</div>
        <div className="text-muted fs-13 mb-5">{mode === 'setup' ? 'Protect this page with a PIN — synced across all devices' : 'This page is PIN protected'}</div>
        {mode === 'setup' && (
          <div style={{ background: 'rgba(77,158,255,.08)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 8, padding: '6px 12px', marginBottom: 14, fontSize: 12, color: 'var(--blue)' }}>
            🔄 PIN will sync across all your devices automatically
          </div>
        )}
        {mode === 'unlock' ? (
          <>
            <input className="fi" type="password" inputMode="numeric" maxLength={8} placeholder="Enter PIN" value={input}
              onChange={e => { setInput(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8, marginBottom: 12 }} autoFocus />
            {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleUnlock}>🔓 Unlock</button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8, fontSize: 12 }} onClick={handleReset}>Forgot PIN? Reset</button>
          </>
        ) : (
          <>
            <input className="fi" type="password" inputMode="numeric" maxLength={8} placeholder="New PIN (min 4 digits)" value={newPin}
              onChange={e => { setNewPin(e.target.value); setError(''); }}
              style={{ textAlign: 'center', fontSize: 18, letterSpacing: 6, marginBottom: 10 }} autoFocus />
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
// ─── Reconcile Holdings ──────────────────────────────────────
// Paste the actual per-symbol totals from your broker's own portal (Angel
// One, mStock, etc.) and compare them against what's already summed up in
// this app for that broker. For any symbol where they don't match, this
// creates ONE adjustment entry (dated whatever you choose) whose quantity
// and price are exactly the shortfall/excess — so after it's added, your
// app's totals per symbol match the broker's portal totals exactly.
function ReconcileTab({ items, brokers, onSaved }) {
  const [broker, setBroker] = useState('');
  const [reconcileDate, setReconcileDate] = useState('2024-12-31');
  const [pasted, setPasted] = useState('');
  const [rows, setRows] = useState(null); // parsed + computed rows, or null before parsing
  const [saving, setSaving] = useState(false);

  // Keep the selected broker valid as the brokers list loads/changes —
  // brokers is fetched asynchronously by the parent, so it can still be []
  // at the moment this component first mounts. Without this, `broker`
  // would get permanently stuck at '' even though the dropdown visually
  // shows a broker selected (browsers default to showing the first option
  // when the bound value doesn't match anything) — which silently broke
  // the broker filter below.
  useEffect(() => {
    if (brokers.length === 0) return;
    if (!broker || !brokers.some(b => b.name === broker)) {
      setBroker(brokers[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokers]);

  const brokerMatches = (name) => (name || '').trim().toLowerCase() === broker.trim().toLowerCase();
  // Live sanity-check count so it's visible in the UI that the broker filter is actually doing something
  const matchedRecordCount = items.filter(i => brokerMatches(i.brokerName)).length;

  // Splits a pasted spreadsheet block into columns — tab-separated (the
  // normal case when pasting from Excel/Sheets/a table) with a fallback to
  // runs of 2+ spaces for plain-text-table pastes.
  const splitCols = (line) => {
    if (line.includes('\t')) return line.split('\t').map(c => c.trim());
    return line.trim().split(/\s{2,}/).map(c => c.trim());
  };

  const parseAndCompute = () => {
    if (!broker) { toast.error('Select a broker first'); return; }
    const lines = pasted.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error('Paste your actual holdings table first'); return; }

    // Skip a header row if the first line looks like one (contains "Symbol" or "Qty")
    const startIdx = /symbol|qty|invested/i.test(lines[0]) ? 1 : 0;

    const parsedRows = [];
    for (let i = startIdx; i < lines.length; i++) {
      const cols = splitCols(lines[i]);
      if (cols.length < 4) continue; // skip malformed lines
      // Expected columns: Symbol, Stock Name, Total Qty, Total Invested, Avg Buy Price (last is optional/derivable)
      const symbol = cols[0].toUpperCase().trim();
      const stockName = cols[1] || symbol;
      const actualQty = parseFloat(String(cols[2]).replace(/,/g, '')) || 0;
      const actualInvested = parseFloat(String(cols[3]).replace(/,/g, '')) || 0;
      if (!symbol || actualQty <= 0) continue;
      parsedRows.push({ symbol, stockName, actualQty, actualInvested });
    }
    if (parsedRows.length === 0) { toast.error('Could not parse any rows — check the pasted format'); return; }

    // Current per-symbol totals in the DB, for the selected broker only
    // (trimmed + case-insensitive match — see brokerMatches above)
    const currentTotals = {};
    items.filter(i => brokerMatches(i.brokerName)).forEach(i => {
      const sym = (i.symbol || i.stockName || '').toUpperCase().trim();
      if (!currentTotals[sym]) currentTotals[sym] = { qty: 0, invested: 0 };
      currentTotals[sym].qty += (+i.quantity || 0);
      currentTotals[sym].invested += (+i.quantity || 0) * (+i.purchasePrice || 0);
    });

    const computed = parsedRows.map(r => {
      const cur = currentTotals[r.symbol] || { qty: 0, invested: 0 };
      const diffQty = Math.round((r.actualQty - cur.qty) * 1000) / 1000;
      const diffInvested = Math.round((r.actualInvested - cur.invested) * 100) / 100;
      let status, adjPrice = 0;
      if (Math.abs(diffQty) < 0.001 && Math.abs(diffInvested) < 1) {
        status = 'match';
      } else if (Math.abs(diffQty) < 0.001 && Math.abs(diffInvested) >= 1) {
        status = 'price_only'; // quantity already matches — only the invested amount differs, can't fix without a qty change
      } else {
        status = 'diff';
        adjPrice = diffInvested / diffQty;
      }
      return { ...r, currentQty: cur.qty, currentInvested: cur.invested, diffQty, diffInvested, adjPrice, status, included: status === 'diff' };
    });

    // Symbols that exist in the DB for this broker but weren't in the pasted list at all — flagged for manual review, never auto-touched
    const pastedSymbols = new Set(parsedRows.map(r => r.symbol));
    const extraInDb = Object.keys(currentTotals).filter(sym => !pastedSymbols.has(sym));

    setRows({ computed, extraInDb });
  };

  const toggleRow = (symbol) => {
    setRows(prev => ({
      ...prev,
      computed: prev.computed.map(r => r.symbol === symbol ? { ...r, included: !r.included } : r),
    }));
  };

  const confirmSave = async () => {
    const toCreate = (rows?.computed || []).filter(r => r.status === 'diff' && r.included);
    if (toCreate.length === 0) { toast.error('No adjustments selected'); return; }
    setSaving(true);
    try {
      let created = 0;
      for (const r of toCreate) {
        await investmentService.create({
          stockName: r.stockName,
          symbol: r.symbol,
          quantity: r.diffQty,
          purchasePrice: Math.abs(r.adjPrice),
          currentPrice: Math.abs(r.adjPrice),
          purchaseDate: reconcileDate,
          brokerName: broker,
          brokerage: 0,
          notes: `Reconciliation adjustment vs ${broker} portal — brings DB total to actual ${r.actualQty} qty / ${fmt(r.actualInvested)} invested`,
        });
        created++;
      }
      toast.success(`Created ${created} reconciliation ${created === 1 ? 'entry' : 'entries'} dated ${reconcileDate}`);
      setRows(null); setPasted('');
      onSaved?.();
    } catch (err) {
      console.error('Reconcile save failed:', err);
      toast.error('Save failed: ' + (err?.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="fw-800 mb-2" style={{ fontSize: 15 }}>🔄 Reconcile Holdings</div>
        <div className="fs-12 text-muted mb-3">
          Paste the actual per-symbol totals from your broker's portal below. This compares them against what's already in your DB for the selected broker, and lets you create one adjustment entry per symbol for exactly the difference — dated whatever you choose below.
        </div>
        <div className="flex gap-3" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="fg" style={{ marginBottom: 0, minWidth: 160 }}>
            <label className="fl">Broker</label>
            <select className="fs" value={broker} onChange={e => setBroker(e.target.value)}>
              {brokers.length === 0 && <option value="">Loading brokers...</option>}
              {brokers.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            {broker && <div className="fs-11 text-muted mt-1">{matchedRecordCount} record{matchedRecordCount === 1 ? '' : 's'} currently in DB for {broker}</div>}
          </div>
          <div className="fg" style={{ marginBottom: 0, minWidth: 160 }}>
            <label className="fl">Adjustment Date</label>
            <input className="fi" type="date" value={reconcileDate} onChange={e => setReconcileDate(e.target.value)} />
          </div>
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl">Paste Actual Holdings (Symbol, Stock Name, Total Qty, Total Invested, Avg Buy Price)</label>
          <textarea className="fta" rows={8} style={{ fontFamily: 'monospace', fontSize: 12 }}
            placeholder={'Symbol\tStock Name\tTotal Qty\tTotal Invested\tAvg Buy Price\nINDUSINDBK\tIndusInd Bank Ltd\t12\t9814.49\t817.87\n...'}
            value={pasted} onChange={e => setPasted(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={parseAndCompute} disabled={!broker}>Compare</button>
      </div>

      {rows && (
        <div className="card">
          <div className="fw-700 fs-13 mb-3">Comparison Result</div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Symbol</th>
                  <th style={{ textAlign: 'right' }}>DB Qty</th>
                  <th style={{ textAlign: 'right' }}>Actual Qty</th>
                  <th style={{ textAlign: 'right' }}>Diff Qty</th>
                  <th style={{ textAlign: 'right' }}>DB Invested</th>
                  <th style={{ textAlign: 'right' }}>Actual Invested</th>
                  <th style={{ textAlign: 'right' }}>Diff Invested</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.computed.map(r => (
                  <tr key={r.symbol} style={{ opacity: r.status === 'match' ? 0.5 : 1 }}>
                    <td>{r.status === 'diff' && <input type="checkbox" checked={r.included} onChange={() => toggleRow(r.symbol)} />}</td>
                    <td className="fw-700">{r.symbol}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono fs-12">{r.currentQty}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono fs-12">{r.actualQty}</td>
                    <td style={{ textAlign: 'right' }} className={`font-mono fs-12 fw-700 ${r.diffQty > 0 ? 'amt-g' : r.diffQty < 0 ? 'amt-r' : ''}`}>{r.diffQty > 0 ? '+' : ''}{r.diffQty}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono fs-12">{fmt(r.currentInvested)}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono fs-12">{fmt(r.actualInvested)}</td>
                    <td style={{ textAlign: 'right' }} className={`font-mono fs-12 fw-700 ${r.diffInvested > 0 ? 'amt-g' : r.diffInvested < 0 ? 'amt-r' : ''}`}>{r.diffInvested > 0 ? '+' : ''}{fmt(r.diffInvested)}</td>
                    <td>
                      {r.status === 'match' && <span className="badge badge-g">✅ Matches</span>}
                      {r.status === 'diff' && <span className="badge badge-r">Adjust {r.diffQty > 0 ? '+' : ''}{r.diffQty} @ {fmt(Math.abs(r.adjPrice))}</span>}
                      {r.status === 'price_only' && <span className="badge" style={{ color: 'var(--orange)' }}>⚠️ Price-only mismatch — edit manually</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.extraInDb.length > 0 && (
            <div className="fs-12" style={{ marginTop: 12, padding: 10, background: 'var(--bg3)', borderRadius: 8 }}>
              <span className="fw-700">⚠️ In your DB for {broker} but not in the pasted list:</span> {rows.extraInDb.join(', ')} — not touched automatically; check whether these were sold or shouldn't be there.
            </div>
          )}

          <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn btn-primary" onClick={confirmSave} disabled={saving || rows.computed.every(r => !r.included)}>
              {saving ? <span className="spin" /> : null} Create Adjustment Entries
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


export default function PortfolioPage() {
  const [unlocked, setUnlocked] = useState(() => !pinService.getCached('portfolio'));
  const [items, setItems] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('holdings');
  const [summarySort, setSummarySort] = useState({ field: 'value', dir: 'desc' });
  const [summaryStockFilter, setSummaryStockFilter] = useState(''); // '' = all stocks
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const toggleSummarySort = (field) => setSummarySort(s => ({ field, dir: s.field === field && s.dir === 'desc' ? 'asc' : 'desc' }));
  const [livePrices, setLivePrices] = useState({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveStatus, setLiveStatus] = useState('');
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);
  const [gasUrl, setGasUrl] = useState(() => localStorage.getItem('fintrack_gas_url') || '');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  // ── Contract Settings (PDF Password) ────────────────────
  const [pdfPassword,        setPdfPassword]        = useState('');
  const [showPdfPassword,    setShowPdfPassword]    = useState(false);
  const [contractSettingsLoading, setContractSettingsLoading] = useState(false);
  const [savingContractSettings,  setSavingContractSettings]  = useState(false);

  // ── Summary cache (see investmentSummaryService) ────────
  // Fast per-symbol rollup, used for the overview stats/pie chart/summary
  // table so they render immediately, independent of the full transaction
  // list below (which can be large and is fetched separately in the
  // background — see load()).
  const [summaries, setSummaries] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true); // raw transaction list — separate from the fast summary load
  const [rebuilding, setRebuilding] = useState(false);

  const rebuildSummaryCache = async (silent = false) => {
    setRebuilding(true);
    try {
      const { symbols, summaries: rebuilt } = await investmentSummaryService.rebuildAll();
      setSummaries(rebuilt);
      if (!silent) toast.success(`Rebuilt summary cache for ${symbols} stock${symbols === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('rebuildSummaryCache failed:', err);
      if (!silent) toast.error('Rebuild failed: ' + (err?.message || 'unknown error'));
    } finally {
      setRebuilding(false);
    }
  };

  const load = async (invalidateCache = false) => {
    setLoading(true);
    try {
      // ── Fast path: summary cache only — this is what unblocks the UI.
      // Reading one doc per distinct stock is far cheaper than reading
      // every transaction, and only this feeds the overview stats/pie
      // chart/stock-wise summary, so those appear almost immediately
      // regardless of how many years of history exist underneath.
      let sums = await investmentSummaryService.getAll();
      if (sums.length === 0) {
        // Either a brand-new account, or (far more likely for an existing
        // one) the cache simply hasn't been built yet. rebuildAll() reads
        // the full transaction history ONCE to backfill it — after this,
        // every future load uses the fast path above instead.
        const { summaries: rebuilt } = await investmentSummaryService.rebuildAll();
        sums = rebuilt;
      }
      setSummaries(sums);
      setLoading(false); // unblock UI as soon as the fast summary is ready

      // ── Background: everything else, including the full transaction
      // list (only needed for Holdings' detailed per-transaction table,
      // CSV export, reconciliation, etc — not the overview stats above).
      setItemsLoading(true);
      const u = auth.currentUser?.uid;
      const [inv, sm, br, bankSnap] = await Promise.all([
        investmentService.getAll(),
        stockMasterService.getAll(),
        brokerService.getAll(),
        u ? getDocs(query(collection(db, 'bankaccounts'), where('userId', '==', u))) : Promise.resolve(null),
      ]);
      setItems(inv);
      setItemsLoading(false);
      setStocks(sm);
      setBrokers(br);
      if (bankSnap) setBanks(bankSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)));
    } catch { toast.error('Failed to load'); setLoading(false); setItemsLoading(false); }
  };
  useEffect(() => { load(); loadContractSettings(); }, []);

  // ── Contract Settings helpers ──────────────────────────
  const loadContractSettings = async () => {
    setContractSettingsLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'contractSettings', uid));
      if (snap.exists()) {
        const data = snap.data();
        setPdfPassword(data.pdfPassword || '');
      }
    } catch (e) {
      console.error('Failed to load contract settings', e);
    } finally {
      setContractSettingsLoading(false);
    }
  };

  const saveContractSettings = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { toast.error('Not logged in'); return; }
    setSavingContractSettings(true);
    try {
      await setDoc(doc(db, 'contractSettings', uid), {
        pdfPassword: pdfPassword.trim(),
        updatedAt:   new Date().toISOString(),
        uid,
      }, { merge: true });
      toast.success('PDF password saved!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    } finally {
      setSavingContractSettings(false);
    }
  };

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
    const lp = i.symbol ? livePrices[i.symbol.toUpperCase()] : null;
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
        const lp = item.symbol ? livePrices[item.symbol.toUpperCase()] : null;
        if (lp && lp !== item.currentPrice) {
          await investmentService.update(item.id, { ...item, currentPrice: lp });
          saved++;
        }
      }
      if (saved === 0) toast('No changes — saved prices already match live prices', { icon: 'ℹ️' });
      else toast.success(`Saved ${saved} price${saved === 1 ? '' : 's'} to database`);
      reloadItems();
    } catch (err) {
      console.error('saveLivePricesToDB failed:', err);
      toast.error('Save failed: ' + (err.message || 'unknown error'));
    }
  };

  // Lightweight reload — only re-fetches investments (stocks/brokers stay cached)
  const reloadItems = async () => {
    try {
      const [inv, sums] = await Promise.all([investmentService.getAll(), investmentSummaryService.getAll()]);
      setItems(inv);
      setSummaries(sums);
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

  // ── Save contract trades → holdings ──
  const handleContractTrades = async (buyTrades) => {
    try {
      for (const t of buyTrades) {
        let purchaseDate = today();
        if (t.tradeDate) {
          const parts = t.tradeDate.split(/[\/\-]/);
          if (parts.length === 3) {
            purchaseDate = parts[2].length === 4
              ? `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
              : t.tradeDate;
          }
        }
        // Prefer the Google/Stock-Master symbol the user mapped; fall back to the raw broker symbol
        const resolvedSymbol = (t.googleSymbol || t.symbol || '').toUpperCase().trim();
        // Look up the human-readable name from Stock Master; fall back to securityName then symbol
        const masterStock = stocks.find(s => s.symbol === resolvedSymbol);
        const resolvedName = masterStock?.name || t.securityName || resolvedSymbol;
        await investmentService.create({
          symbol:        resolvedSymbol,
          stockName:     resolvedName,
          quantity:      t.qty,
          purchasePrice: t.rate,
          currentPrice:  t.rate,
          purchaseDate,
          brokerName:    t.source || '',
          brokerage:     t.brokerage || 0,
        });
      }
      await reloadItems();      // wait for fresh data
      setTab('holdings');       // auto-navigate so user can see new records
      toast.success(`✅ ${buyTrades.length} trade${buyTrades.length > 1 ? 's' : ''} added to Holdings!`);
    } catch (err) {
      toast.error('Failed to add to holdings: ' + err.message);
    }
  };
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [showImportPanel, setShowImportPanel] = useState(false);

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
  // Sourced from the fast summary cache, not the full transaction list —
  // these render immediately without waiting for `items` to finish loading.
  const totalInvested = summaries.reduce((s, i) => s + (i.invested || 0), 0);
  const totalCurrent = summaries.reduce((s, i) => s + (i.currentValue || 0), 0);
  const totalPnL = totalCurrent - totalInvested;
  // Brokerage isn't tracked in the summary cache (it's a per-transaction
  // fee, not a rollup-able stock stat) — this one stat still comes from
  // the raw list and so it fills in a little after the rest.
  const totalBrokerage = itemsWithAlloc.reduce((s, i) => s + (parseFloat(i.brokerage) || 0), 0);
  // Combine all rows by symbol for charts — from the fast summary cache
  const symbolMap = {};
  summaries.forEach(i => {
    const k = i.symbol || i.stockName;
    if (!k) return;
    symbolMap[k] = { name: k, fullName: i.stockName, symbol: k, value: i.currentValue || 0, invested: i.invested || 0, qty: i.quantity || 0, currentPrice: i.currentPrice || 0, trades: i.transactionCount || 0 };
  });
  const combinedSymbols = Object.values(symbolMap).sort((a, b) => {
    const avgBuyA = a.qty > 0 ? a.invested / a.qty : 0;
    const avgBuyB = b.qty > 0 ? b.invested / b.qty : 0;
    const pnlA = a.value - a.invested;
    const pnlB = b.value - b.invested;
    let va, vb;
    switch (summarySort.field) {
      case 'symbol':   va = a.symbol?.toLowerCase(); vb = b.symbol?.toLowerCase(); break;
      case 'qty':      va = a.qty;        vb = b.qty;        break;
      case 'avgBuy':   va = avgBuyA;      vb = avgBuyB;      break;
      case 'curPrice': va = a.currentPrice; vb = b.currentPrice; break;
      case 'invested': va = a.invested;   vb = b.invested;   break;
      case 'pnl':      va = pnlA;         vb = pnlB;         break;
      default:         va = a.value;      vb = b.value;      break; // 'value'
    }
    if (va < vb) return summarySort.dir === 'asc' ? -1 : 1;
    if (va > vb) return summarySort.dir === 'asc' ? 1 : -1;
    return 0;
  });
  const totalCombined = combinedSymbols.reduce((s, i) => s + i.value, 0);
  const pieData = combinedSymbols.map((i, idx) => ({ ...i, color: PALETTE[idx % PALETTE.length], pct: totalCombined > 0 ? ((i.value / totalCombined) * 100).toFixed(1) : '0' }));
  const barData = combinedSymbols.slice(0, 12).map(i => ({ name: i.symbol.substring(0, 8), invested: Math.round(i.invested), current: Math.round(i.value) }));

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

      {/* ── Page Header ── */}
      <style>{`
        /* Import/Export toggle: hidden on desktop, visible on mobile */
        .pf-import-toggle { display: none !important; }
        /* Import/Export panel: always visible on desktop */
        .pf-import-panel  { display: flex !important; gap: 8px; align-items: center; }

        @media (max-width: 600px) {
          .pf-import-toggle {
            display: inline-flex !important;
            align-items: center;
            gap: 6px;
          }
          .pf-import-panel {
            display: ${showImportPanel ? 'flex' : 'none'} !important;
            flex-wrap: wrap;
            gap: 8px;
            width: 100%;
            padding: 10px 12px;
            background: var(--bg2);
            border: 1px solid var(--border2);
            border-radius: 10px;
            margin-top: 4px;
          }
        }

        /* Contracts tab: full-width scrollable on mobile */
        @media (max-width: 600px) {
          .contracts-card {
            min-height: unset !important;
            overflow: visible !important;
          }
        }
      `}</style>

      <div className="page-head">
        <div>
          <div className="page-title">📈 Stock Portfolio</div>
          <div className="page-sub">{items.length} stocks</div>
        </div>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>

          {/* Mobile-only arrow toggle button */}
          <button
            className="btn btn-secondary btn-sm pf-import-toggle"
            onClick={() => setShowImportPanel(v => !v)}
            title="Import / Export"
          >
            Import / Export
            <span style={{ fontSize: 10, marginLeft: 2 }}>{showImportPanel ? '▲' : '▼'}</span>
          </button>

          {/* Import + Export — collapses on mobile */}
          <div className="pf-import-panel">
            <label className="btn btn-secondary btn-sm" style={{ cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
              {importing
                ? <><span className="spin" style={{ width: 11, height: 11, borderWidth: 2 }} /> Importing…</>
                : '⬆️ Import CSV'}
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} disabled={importing} />
            </label>
            <button className="btn btn-secondary btn-sm"
              onClick={() => exportCSV(items.map(i => ({ stockName: i.stockName, symbol: i.symbol, quantity: i.quantity, purchasePrice: i.purchasePrice, currentPrice: i.currentPrice || i.purchasePrice, brokerName: i.brokerName || '', brokerage: i.brokerage || 0, totalInvested: i.totalInvested, currentValue: i.currentValue, profitLoss: i.profitLoss, allocation: i.allocation + '%' })), 'portfolio.csv')}>
              ⬇️ Export
            </button>
          </div>

          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>
            + Add Stock
          </button>
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
      <div className="flex items-center justify-between" style={{ marginTop: 6, marginBottom: 4 }}>
        <span className="fs-11 text-muted">
          {itemsLoading ? 'Loading full transaction history in background…' : `${items.length} transactions across ${summaries.length} stock${summaries.length === 1 ? '' : 's'}`}
        </span>
        <button className="btn-icon" style={{ fontSize: 11, opacity: 0.7 }} onClick={() => rebuildSummaryCache(false)} disabled={rebuilding} title="Rebuild the summary cache from scratch if totals ever look out of sync">
          {rebuilding ? <span className="spin" style={{ width: 12, height: 12 }} /> : '🔄'} Rebuild Cache
        </button>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--border)', overflowX: 'auto', display: 'flex', gap: 2, marginTop: 16, marginBottom: 16, WebkitOverflowScrolling: 'touch' }}>
        {[{ key: 'holdings', label: '📋 Holdings' }, { key: 'charts', label: '📊 Charts' }, { key: 'analysis', label: '📉 52W' }, { key: 'broker', label: '🏦 Broker' }, { key: 'dividends', label: '💸 Dividends' }, { key: 'contracts', label: '📄 Contracts' }, { key: 'ecas', label: '📑 eCAS' }, { key: 'reconcile', label: '🔄 Reconcile' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 12px', borderRadius: '8px 8px 0 0', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, background: tab === t.key ? 'var(--bg3)' : 'transparent', color: tab === t.key ? 'var(--text)' : 'var(--t3)', borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent' }}>
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
        <div>
          {/* ── Summary stats strip ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { icon: '📦', label: 'Unique Stocks',   val: combinedSymbols.length,                                            c: 'var(--blue)' },
              { icon: '🔢', label: 'Total Quantity',   val: combinedSymbols.reduce((s,i)=>s+i.qty,0).toLocaleString('en-IN'), c: 'var(--purple)' },
              { icon: '💰', label: 'Total Invested',   val: fmt(combinedSymbols.reduce((s,i)=>s+i.invested,0)),               c: 'var(--orange)' },
              { icon: '📈', label: 'Current Value',    val: fmt(totalCombined),                                                c: 'var(--green)' },
              { icon: totalPnL>=0?'🟢':'🔴', label: 'Total P&L', val: `${totalPnL>=0?'+':''}${fmt(totalPnL)}`,               c: totalPnL>=0?'var(--green)':'var(--red)' },
            ].map((s,i) => (
              <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', borderLeft:`3px solid ${s.c}` }}>
                <div style={{ fontSize:11, color:'var(--t3)', marginBottom:2 }}>{s.icon} {s.label}</div>
                <div style={{ fontSize:14, fontWeight:900, color:s.c }}>{s.val}</div>
              </div>
            ))}
          </div>

          <div className="charts">
            {/* Pie + Bar charts */}
            <div className="card">
              <div className="card-title">🥧 Portfolio Allocation</div>
              <div className="flex" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <ResponsiveContainer width={160} height={160}>
                  <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>{pieData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip formatter={v => fmt(v)} /></PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, minWidth: 120, maxHeight: 200, overflowY: 'auto' }}>
                  {pieData.map((d, i) => (
                    <div key={i} className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2 fs-12"><span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} /><span className="text-muted">{d.symbol || d.name}({fmt(d.invested)})</span></div>
                      <span className="font-mono fs-12 fw-bold">{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-title">📊 Invested vs Current Value</div>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={barData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, fontSize: 12 }} />
                  <Bar dataKey="invested" fill="var(--blue)" name="Invested" radius={[3,3,0,0]} maxBarSize={16} />
                  <Bar dataKey="current"  fill="var(--green)" name="Current" radius={[3,3,0,0]} maxBarSize={16} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Category-wise Breakdown ── */}
          {(() => {
            const catMap = {};
            itemsWithAlloc.forEach(i => {
              const cat = i.brokerName || 'Unassigned';
              if (!catMap[cat]) catMap[cat] = { name: cat, stocks: {}, invested: 0, value: 0 };
              const sym = i.symbol || i.stockName;
              if (!catMap[cat].stocks[sym]) catMap[cat].stocks[sym] = { symbol: i.symbol || sym, name: i.stockName, qty: 0, invested: 0, value: 0, currentPrice: 0 };
              catMap[cat].stocks[sym].qty        += i.quantity;
              catMap[cat].stocks[sym].invested   += i.totalInvested;
              catMap[cat].stocks[sym].value      += i.currentValue;
              catMap[cat].stocks[sym].currentPrice = i.currentPrice;
              catMap[cat].invested += i.totalInvested;
              catMap[cat].value    += i.currentValue;
            });
            const cats = Object.values(catMap).sort((a, b) => b.value - a.value);
            const grandTotal = cats.reduce((s, c) => s + c.value, 0);
            const toggleCat = name => setExpandedCategories(prev => {
              const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next;
            });
            return (
              <div className="card" style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div className="card-title" style={{ marginBottom: 0 }}>📊 Category-wise Breakdown</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}
                      onClick={() => setExpandedCategories(new Set(cats.map(c => c.name)))}>
                      Expand All
                    </button>
                    <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}
                      onClick={() => setExpandedCategories(new Set())}>
                      Collapse All
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cats.map((cat, catIdx) => {
                    const isOpen  = expandedCategories.has(cat.name);
                    const pnl     = cat.value - cat.invested;
                    const pct     = grandTotal > 0 ? ((cat.value / grandTotal) * 100).toFixed(1) : '0';
                    const stocks  = Object.values(cat.stocks).sort((a, b) => b.value - a.value);
                    const catColor = PALETTE[catIdx % PALETTE.length];
                    return (
                      <div key={cat.name} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                        {/* ── Category header row ── */}
                        <div onClick={() => toggleCat(cat.name)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer',
                            background: isOpen ? 'var(--bg3)' : 'var(--bg2)', transition: 'background .15s',
                            borderLeft: `3px solid ${catColor}` }}>
                          {/* +/- toggle */}
                          <span style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${catColor}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 16, fontWeight: 900, color: catColor, flexShrink: 0, lineHeight: 1 }}>
                            {isOpen ? '−' : '+'}
                          </span>
                          {/* Category name + stock count */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="fw-800 fs-13">{cat.name}</div>
                            <div className="fs-11 text-muted">{stocks.length} stock{stocks.length !== 1 ? 's' : ''}</div>
                          </div>
                          {/* Allocation bar */}
                          <div style={{ width: 70, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ height: 4, borderRadius: 99, background: 'var(--border2)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: catColor, borderRadius: 99 }} />
                            </div>
                            <div className="fs-10 text-muted" style={{ textAlign: 'right' }}>{pct}%</div>
                          </div>
                          {/* Stats */}
                          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ textAlign: 'right' }}>
                              <div className="fs-10 text-muted">Invested</div>
                              <div className="fw-700 fs-12">{fmt(cat.invested)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div className="fs-10 text-muted">Current</div>
                              <div className="fw-700 fs-12">{fmt(cat.value)}</div>
                            </div>
                            <div style={{ textAlign: 'right', minWidth: 64 }}>
                              <div className="fs-10 text-muted">P&amp;L</div>
                              <div className={`fw-800 fs-12 ${pnl >= 0 ? 'amt-g' : 'amt-r'}`}>
                                {pnl >= 0 ? '+' : ''}{fmt(pnl)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── Expanded stock rows ── */}
                        {isOpen && (
                          <div style={{ borderTop: '1px solid var(--border)' }}>
                            {stocks.map((s, idx) => {
                              const sPnl = s.value - s.invested;
                              const sPct = cat.value > 0 ? ((s.value / cat.value) * 100).toFixed(1) : '0';
                              const avgBuy = s.qty > 0 ? s.invested / s.qty : 0;
                              return (
                                <div key={s.symbol}
                                  style={{ display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '9px 14px 9px 52px',
                                    borderBottom: idx < stocks.length - 1 ? '1px solid var(--border)' : 'none',
                                    background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,.02)' }}>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 11,
                                    background: catColor + '18', padding: '2px 8px', borderRadius: 6,
                                    color: catColor, minWidth: 72, textAlign: 'center', flexShrink: 0 }}>
                                    {s.symbol}
                                  </span>
                                  <span className="fs-12 text-muted" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>
                                    {s.name}
                                  </span>
                                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    <div style={{ textAlign: 'right', minWidth: 40 }}>
                                      <div className="fs-10 text-muted">Qty</div>
                                      <div className="fw-700 fs-12 font-mono">{s.qty.toLocaleString('en-IN')}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', minWidth: 72 }}>
                                      <div className="fs-10 text-muted">Avg Buy</div>
                                      <div className="fw-700 fs-12 font-mono">{fmt(avgBuy)}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', minWidth: 72 }}>
                                      <div className="fs-10 text-muted">Invested</div>
                                      <div className="fw-700 fs-12">{fmt(s.invested)}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', minWidth: 72 }}>
                                      <div className="fs-10 text-muted">Current</div>
                                      <div className="fw-700 fs-12">{fmt(s.value)}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', minWidth: 72 }}>
                                      <div className="fs-10 text-muted">P&amp;L</div>
                                      <div className={`fw-800 fs-12 ${sPnl >= 0 ? 'amt-g' : 'amt-r'}`}>
                                        {sPnl >= 0 ? '+' : ''}{fmt(sPnl)}
                                      </div>
                                    </div>
                                    <span style={{ background: 'var(--bg3)', color: 'var(--t3)', padding: '2px 8px',
                                      borderRadius: 20, fontSize: 11, fontWeight: 700, minWidth: 40, textAlign: 'center' }}>
                                      {sPct}%
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                            {/* Category subtotal row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 52px',
                              background: catColor + '10', borderTop: '1px solid var(--border)' }}>
                              <span className="fs-11 fw-700 text-muted" style={{ flex: 1 }}>TOTAL — {cat.name}</span>
                              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
                                <div style={{ minWidth: 40 }} />
                                <div style={{ minWidth: 72 }} />
                                <div style={{ textAlign: 'right', minWidth: 72 }}>
                                  <span className="fw-800 fs-12 amt">{fmt(cat.invested)}</span>
                                </div>
                                <div style={{ textAlign: 'right', minWidth: 72 }}>
                                  <span className="fw-800 fs-12 amt">{fmt(cat.value)}</span>
                                </div>
                                <div style={{ textAlign: 'right', minWidth: 72 }}>
                                  <span className={`fw-800 fs-12 ${pnl >= 0 ? 'amt-g' : 'amt-r'}`}>
                                    {pnl >= 0 ? '+' : ''}{fmt(pnl)}
                                  </span>
                                </div>
                                <span style={{ background: catColor + '22', color: catColor, padding: '2px 8px',
                                  borderRadius: 20, fontSize: 11, fontWeight: 800, minWidth: 40, textAlign: 'center' }}>
                                  {pct}%
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Stock-wise Summary Table ── */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>📋 Stock-wise Summary</div>
              <select className="fs" style={{ maxWidth: 220 }} value={summaryStockFilter} onChange={e => setSummaryStockFilter(e.target.value)}>
                <option value="">All Stocks</option>
                {combinedSymbols.slice().sort((a, b) => a.symbol.localeCompare(b.symbol)).map(s => (
                  <option key={s.symbol} value={s.symbol}>{s.symbol}</option>
                ))}
              </select>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    {[
                      { key: 'symbol',   label: 'Symbol',           align: 'left'  },
                      { key: null,       label: 'Stock Name',        align: 'left'  },
                      { key: 'qty',      label: 'Total Qty',         align: 'right' },
                      { key: 'avgBuy',   label: 'Avg Buy Price',     align: 'right' },
                      { key: 'curPrice', label: 'Current Price',     align: 'right' },
                      { key: 'invested', label: 'Total Invested',    align: 'right' },
                      { key: 'value',    label: 'Current Value',     align: 'right' },
                      { key: 'pnl',      label: 'P&L',               align: 'right' },
                      { key: null,       label: 'Alloc %',           align: 'right' },
                    ].map((col, ci) => (
                      <th key={ci} style={{ textAlign: col.align, cursor: col.key ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}
                        onClick={() => col.key && toggleSummarySort(col.key)}>
                        {col.label}
                        {col.key && (
                          <span style={{ marginLeft: 4, fontSize: 10, color: summarySort.field === col.key ? 'var(--blue)' : 'var(--t3)' }}>
                            {summarySort.field === col.key ? (summarySort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {combinedSymbols.filter(s => !summaryStockFilter || s.symbol === summaryStockFilter).map((s, idx) => {
                    const pnl     = s.value - s.invested;
                    const pnlPct  = s.invested > 0 ? ((pnl / s.invested) * 100).toFixed(2) : '0.00';
                    const avgBuy  = s.qty > 0 ? s.invested / s.qty : 0;
                    const alloc   = totalCombined > 0 ? ((s.value / totalCombined) * 100).toFixed(1) : '0';
                    return (
                      <tr key={s.symbol}>
                        <td className="text-muted fs-12">{idx + 1}</td>
                        <td>
                          <span style={{ fontFamily:'monospace', fontWeight:800, fontSize:12, background:'var(--bg3)', padding:'2px 8px', borderRadius:6, color:PALETTE[idx % PALETTE.length] }}>
                            {s.symbol}
                          </span>
                        </td>
                        <td className="fw-600 fs-13">{s.fullName}</td>
                        <td style={{ textAlign:'right' }} className="font-mono fw-700">{s.qty.toLocaleString('en-IN')}</td>
                        <td style={{ textAlign:'right' }} className="font-mono fs-12">{fmt(avgBuy)}</td>
                        <td style={{ textAlign:'right' }}>
                          <span className={`font-mono fs-12 fw-700 ${s.currentPrice >= avgBuy ? 'amt-g' : 'amt-r'}`}>
                            {fmt(s.currentPrice)}
                          </span>
                        </td>
                        <td style={{ textAlign:'right' }}><span className="amt">{fmt(s.invested)}</span></td>
                        <td style={{ textAlign:'right' }}><span className="amt">{fmt(s.value)}</span></td>
                        <td style={{ textAlign:'right' }}>
                          <span className={`fw-700 fs-12 ${pnl >= 0 ? 'amt-g' : 'amt-r'}`}>
                            {pnl >= 0 ? '+' : ''}{fmt(pnl)}<br />
                            <small>({pnlPct}%)</small>
                          </span>
                        </td>
                        <td style={{ textAlign:'right' }}>
                          <span style={{ background: PALETTE[idx % PALETTE.length] + '22', color: PALETTE[idx % PALETTE.length], padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>
                            {alloc}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="text-muted fs-12" style={{ padding:'10px 14px' }}>TOTAL ({combinedSymbols.length} stocks)</td>
                    <td style={{ textAlign:'right', padding:'10px 14px' }} className="font-mono fw-800">{combinedSymbols.reduce((s,i)=>s+i.qty,0).toLocaleString('en-IN')}</td>
                    <td colSpan={2} />
                    <td style={{ textAlign:'right', padding:'10px 14px' }}><span className="amt fw-800">{fmt(combinedSymbols.reduce((s,i)=>s+i.invested,0))}</span></td>
                    <td style={{ textAlign:'right', padding:'10px 14px' }}><span className="amt fw-800">{fmt(totalCombined)}</span></td>
                    <td style={{ textAlign:'right', padding:'10px 14px' }}><span className={`fw-800 ${totalPnL>=0?'amt-g':'amt-r'}`}>{totalPnL>=0?'+':''}{fmt(totalPnL)}</span></td>
                    <td style={{ textAlign:'right', padding:'10px 14px' }}><span className="fw-700">100%</span></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'analysis' && (
        <Suspense fallback={<div className="spin-center" style={{ height: 120 }}><div className="spin spin-lg" /></div>}>
          <PriceAnalysisTab items={itemsWithAlloc} />
        </Suspense>
      )}
      {tab === 'broker' && <BrokerReportTab items={itemsWithAlloc} brokers={brokers} />}
      {tab === 'dividends' && <DividendTab items={itemsWithAlloc} stocks={stocks} banks={banks} />}
      {tab === 'contracts' && (
        <div>
          {/* ── Contract Settings Card ── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <span style={{ fontSize: 18 }}>🔑</span>
              <div>
                <div className="fw-700 fs-14">PDF Password</div>
                <div className="fs-11 text-muted">Saved password auto-fills when uploading a protected contract PDF.</div>
              </div>
              {contractSettingsLoading && <span className="spin" style={{ width: 14, height: 14, borderWidth: 2, marginLeft: 'auto' }} />}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              {/* PDF Password input */}
              <div className="fg" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                <label className="fl">
                  PDF Password
                  <span className="text-muted fw-400 fs-11" style={{ marginLeft: 6 }}>leave blank if no password</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>🔒</span>
                  <input
                    className="fi"
                    type={showPdfPassword ? 'text' : 'password'}
                    style={{ paddingLeft: 32, paddingRight: 40, fontFamily: 'monospace', fontWeight: 700, letterSpacing: showPdfPassword ? 0 : 3 }}
                    placeholder="Leave blank if no password"
                    value={pdfPassword}
                    onChange={e => setPdfPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPdfPassword(v => !v)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'var(--t3)', padding: 4 }}
                    title={showPdfPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPdfPassword ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              {/* Save button */}
              <button
                className="btn btn-primary"
                onClick={saveContractSettings}
                disabled={savingContractSettings || contractSettingsLoading}
                style={{ minWidth: 130, marginBottom: 0 }}
              >
                {savingContractSettings
                  ? <><span className="spin" style={{ width: 12, height: 12, borderWidth: 2 }} /> Saving...</>
                  : '💾 Save Password'
                }
              </button>
            </div>

            {pdfPassword && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>
                ✅ Password saved — will auto-fill when you upload a protected PDF
              </div>
            )}
          </div>

          {/* ── Contract Uploader ── */}
          <div className="card contracts-card" style={{ padding: 0, overflow: 'visible', minHeight: 'min(520px, 80vh)', overflowX: 'hidden' }}>
            <ContractUploader onTradesSaved={handleContractTrades} pdfPassword={pdfPassword} />
          </div>
        </div>
      )}

      {tab === 'ecas' && (
        <div>
          {/* ── eCAS Settings Card (reuses the same saved PDF password) ── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <span style={{ fontSize: 18 }}>🔑</span>
              <div>
                <div className="fw-700 fs-14">eCAS PDF Password</div>
                <div className="fs-11 text-muted">
                  Same password used for Contracts. Saved once — auto-fills the eCAS analyzer below.
                </div>
              </div>
              {contractSettingsLoading && <span className="spin" style={{ width: 14, height: 14, borderWidth: 2, marginLeft: 'auto' }} />}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <div className="fg" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                <label className="fl">
                  PDF Password
                  <span className="text-muted fw-400 fs-11" style={{ marginLeft: 6 }}>leave blank if not protected</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>🔒</span>
                  <input
                    className="fi"
                    type={showPdfPassword ? 'text' : 'password'}
                    style={{ paddingLeft: 32, paddingRight: 40, fontFamily: 'monospace', fontWeight: 700, letterSpacing: showPdfPassword ? 0 : 3 }}
                    placeholder="Leave blank if no password"
                    value={pdfPassword}
                    onChange={e => setPdfPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPdfPassword(v => !v)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'var(--t3)', padding: 4 }}
                    title={showPdfPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPdfPassword ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={saveContractSettings}
                disabled={savingContractSettings || contractSettingsLoading}
                style={{ minWidth: 130, marginBottom: 0 }}
              >
                {savingContractSettings
                  ? <><span className="spin" style={{ width: 12, height: 12, borderWidth: 2 }} /> Saving...</>
                  : '💾 Save Password'
                }
              </button>
            </div>

            {pdfPassword && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>
                ✅ Password saved — auto-fills the analyzer below
              </div>
            )}
          </div>

          {/* ── eCAS Analyzer ── */}
          <ECASAnalyzer
            pdfPassword={pdfPassword}
            onDataExtracted={(data) => {
              // Optional: you can store extracted eCAS data in state here if needed
              console.log('eCAS extracted:', data.holdings.length, 'schemes');
            }}
          />
        </div>
      )}

      {tab === 'reconcile' && (
        <ReconcileTab items={items} brokers={brokers} onSaved={reloadItems} />
      )}

      {modal && <Modal title={edit ? '✏️ Edit Stock' : '➕ Add Stock'} onClose={() => { setModal(false); setEdit(null); }}>
        <InvForm item={edit} stocks={stocks} brokers={brokers} banks={banks} existingItems={items} onSave={save} onSaveAndAnother={saveAndAnother} onClose={() => { setModal(false); setEdit(null); }} />
      </Modal>}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}