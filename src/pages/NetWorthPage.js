import { useState, useEffect } from 'react';
import { netWorthService, goldService, investmentService, incomeService, expenseService, loanService, loanPaymentService } from '../utils/dbService';
import { fmt, fmtDate, fmtDateInput, today } from '../utils/helpers';
import { Modal, ConfirmDelete } from '../components/UI';
import { differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

const PAGE_PIN_KEY = 'fintrack_page_pins';
function getPin(page) { try { return JSON.parse(localStorage.getItem(PAGE_PIN_KEY) || '{}')[page] || ''; } catch { return ''; } }
function setPin(page, pin) { try { const d = JSON.parse(localStorage.getItem(PAGE_PIN_KEY) || '{}'); d[page] = pin; localStorage.setItem(PAGE_PIN_KEY, JSON.stringify(d)); } catch {} }

function LockedScreen({ page, onUnlock }) {
  const [input, setInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [mode, setMode] = useState(getPin(page) ? 'unlock' : 'setup');
  const [error, setError] = useState('');
  const handleUnlock = () => { if (input === getPin(page)) { onUnlock(); } else { setError('Wrong PIN. Try again.'); setInput(''); } };
  const handleSetup = () => { if (newPin.length < 4) { setError('PIN must be at least 4 digits'); return; } if (newPin !== confirmPin) { setError('PINs do not match'); return; } setPin(page, newPin); onUnlock(); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '40px 36px', textAlign: 'center', minWidth: 300, maxWidth: 360 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>{mode === 'setup' ? 'Set a PIN' : 'Enter PIN'}</div>
        <div className="text-muted fs-13 mb-5">{mode === 'setup' ? 'Protect this page with a 4-digit PIN' : 'This page is PIN protected'}</div>
        {mode === 'unlock' ? (
          <>
            <input className="fi" type="password" inputMode="numeric" maxLength={8} placeholder="Enter PIN" value={input} onChange={e => { setInput(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleUnlock()} style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8, marginBottom: 12 }} autoFocus />
            {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleUnlock}>🔓 Unlock</button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8, fontSize: 12 }} onClick={() => { setPin(page, ''); setMode('setup'); setError(''); }}>Forgot PIN? Reset</button>
          </>
        ) : (
          <>
            <input className="fi" type="password" inputMode="numeric" maxLength={8} placeholder="New PIN (min 4 digits)" value={newPin} onChange={e => { setNewPin(e.target.value); setError(''); }} style={{ textAlign: 'center', fontSize: 18, letterSpacing: 6, marginBottom: 10 }} autoFocus />
            <input className="fi" type="password" inputMode="numeric" maxLength={8} placeholder="Confirm PIN" value={confirmPin} onChange={e => { setConfirmPin(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleSetup()} style={{ textAlign: 'center', fontSize: 18, letterSpacing: 6, marginBottom: 12 }} />
            {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSetup}>🔐 Set PIN & Enter</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-item Modal ────────────────────────────────────────
function SubItemModal({ label, icon, items = [], onSave, onClose }) {
  const [list, setList] = useState(items.length > 0 ? items.map(it => ({ ...it })) : [{ name: '', amount: '' }]);
  const add = () => setList(p => [...p, { name: '', amount: '' }]);
  const remove = (i) => setList(p => p.filter((_, idx) => idx !== i));
  const change = (i, field, val) => setList(p => p.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const total = list.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const save = () => {
    const valid = list.filter(it => it.name && parseFloat(it.amount) > 0);
    if (valid.length === 0) { toast.error('Add at least one valid entry'); return; }
    onSave(valid, total);
  };
  return (
    <div>
      <div className="text-muted fs-12 mb-3">{icon} Add multiple {label} entries — each with a name and amount</div>
      {list.map((it, i) => (
        <div key={i} className="flex gap-2 mb-2" style={{ alignItems: 'center' }}>
          <input className="fi" style={{ flex: 2 }} type="text" placeholder={`e.g. ${label} ${i + 1}`} value={it.name} onChange={e => change(i, 'name', e.target.value)} />
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--t3)' }}>Rs</span>
            <input className="fi" style={{ paddingLeft: 26 }} type="number" placeholder="0" value={it.amount} onChange={e => change(i, 'amount', e.target.value)} min="0" />
          </div>
          {list.length > 1 && <button onClick={() => remove(i)} style={{ background: 'rgba(244,63,94,.1)', border: '1px solid rgba(244,63,94,.3)', borderRadius: 6, color: 'var(--red)', cursor: 'pointer', fontSize: 14, padding: '6px 10px', flexShrink: 0 }} title="Delete">🗑️</button>}
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" onClick={add} style={{ marginBottom: 12 }}>+ Add Another</button>
      {total > 0 && (
        <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span className="text-muted fs-13">Total</span>
          <span className="fw-800" style={{ color: 'var(--blue)' }}>{fmt(total)}</span>
        </div>
      )}
      <div className="modal-foot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save {icon}</button>
      </div>
    </div>
  );
}

// ─── Property / Investment Tracker ─────────────────────────
const PROP_TYPES = [
  { key: 'gold', label: 'Gold', icon: '🥇' },
  { key: 'land', label: 'Land / Plot', icon: '🏞️' },
  { key: 'house', label: 'House / Flat', icon: '🏠' },
  { key: 'bonds', label: 'Bonds / FD', icon: '📜' },
  { key: 'other', label: 'Other', icon: '💼' },
];
const BLANK_PROP = { name: '', type: 'land', investedAmount: '', investedDate: '', expectedReturn: '12', buyBrokerFee: '', tax: '', sellingBrokerPct: '' };

function PropertyCalc() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [form, setForm] = useState(BLANK_PROP);
  const storageKey = 'fintrack_property_investments';
  useEffect(() => { try { setEntries(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch { setEntries([]); } setLoading(false); }, []);
  const persist = (list) => { localStorage.setItem(storageKey, JSON.stringify(list)); setEntries(list); };
  const calcEntry = (e) => {
    const invested = parseFloat(e.investedAmount) || 0, rate = parseFloat(e.expectedReturn) / 100 || 0;
    const buyFee = parseFloat(e.buyBrokerFee) || 0, taxAmt = parseFloat(e.tax) || 0, sellPct = parseFloat(e.sellingBrokerPct) / 100 || 0;
    const years = Math.max(0, (new Date() - new Date(e.investedDate || new Date())) / (1000 * 60 * 60 * 24 * 365.25));
    const grossValue = invested * Math.pow(1 + rate, years);
    const netValue = grossValue - buyFee - taxAmt - grossValue * sellPct;
    return { grossValue, netValue, gain: netValue - invested, years };
  };
  const save = () => {
    if (!form.name || !form.investedAmount || !form.investedDate) { toast.error('Fill Name, Amount, Date'); return; }
    const entry = { ...form, id: edit?.id || `prop_${Date.now()}` };
    if (edit) { persist(entries.map(e => e.id === edit.id ? entry : e)); toast.success('Updated!'); }
    else { persist([...entries, entry]); toast.success('Saved!'); }
    setModal(false); setEdit(null); setForm(BLANK_PROP);
  };
  const del = () => { persist(entries.filter(e => e.id !== delId)); setDelId(null); toast.success('Deleted'); };
  const ch = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const totals = entries.reduce((s, e) => { const c = calcEntry(e); return { invested: s.invested + (parseFloat(e.investedAmount) || 0), netValue: s.netValue + c.netValue, gain: s.gain + c.gain }; }, { invested: 0, netValue: 0, gain: 0 });
  const preview = form.investedAmount && form.investedDate ? calcEntry(form) : null;
  return (
    <div>
      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3">
          <div><div className="card-title" style={{ marginBottom: 0 }}>🏠 Property & Investment Tracker</div><div className="text-muted fs-12 mt-1">Track real estate, gold, bonds — today's value after all fees</div></div>
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm(BLANK_PROP); setModal(true); }}>+ Add</button>
        </div>
        {entries.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {[{ label: 'Total Invested', val: fmt(totals.invested), c: 'var(--blue)' }, { label: "Today's Net Value", val: fmt(totals.netValue), c: 'var(--green)' }, { label: 'Total Gain', val: `${totals.gain >= 0 ? '+' : ''}${fmt(totals.gain)}`, c: totals.gain >= 0 ? 'var(--green)' : 'var(--red)' }].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${s.c}` }}><div className="fs-11 text-muted">{s.label}</div><div className="fw-800 fs-14" style={{ color: s.c }}>{s.val}</div></div>
            ))}
          </div>
        )}
        {loading ? <div className="spin-center"><div className="spin" /></div> : entries.length === 0
          ? <div className="empty" style={{ padding: '30px 0' }}><div className="empty-icon">🏠</div><div className="empty-title">No investments added yet</div><div className="empty-sub">Add property, gold, or bonds to track appreciation</div></div>
          : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Asset</th><th>Type</th><th style={{ textAlign: 'right' }}>Invested</th><th>Date</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Held</th><th style={{ textAlign: 'right' }}>Net Value</th><th style={{ textAlign: 'right' }}>Gain/Loss</th><th></th></tr></thead>
            <tbody>{entries.map(e => { const c = calcEntry(e); const ptype = PROP_TYPES.find(p => p.key === e.type) || PROP_TYPES[0]; return (<tr key={e.id}><td className="fw-700 fs-13">{e.name}</td><td><span style={{ background: 'var(--bg3)', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{ptype.icon} {ptype.label}</span></td><td style={{ textAlign: 'right' }}><span className="amt">{fmt(parseFloat(e.investedAmount))}</span></td><td className="font-mono fs-12 text-muted">{e.investedDate}</td><td style={{ textAlign: 'right', color: 'var(--purple)' }} className="fs-12 fw-700">{e.expectedReturn}%</td><td style={{ textAlign: 'right' }} className="fs-12 text-muted">{c.years.toFixed(1)}y</td><td style={{ textAlign: 'right' }}><span className="fw-800" style={{ color: 'var(--green)', fontSize: 13 }}>{fmt(c.netValue)}</span></td><td style={{ textAlign: 'right' }}><span className={`fw-700 fs-12 ${c.gain >= 0 ? 'amt-g' : 'amt-r'}`}>{c.gain >= 0 ? '+' : ''}{fmt(c.gain)}</span></td><td><div className="actions"><button className="btn-icon" onClick={() => { setEdit(e); setForm({ ...e }); setModal(true); }}>✏️</button><button className="btn-icon" onClick={() => setDelId(e.id)}>🗑️</button></div></td></tr>); })}</tbody>
            <tfoot><tr><td colSpan={2} style={{ padding: '8px 14px' }} className="fw-700 fs-12 text-muted">TOTAL</td><td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="amt fw-800">{fmt(totals.invested)}</span></td><td colSpan={3} /><td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="fw-800" style={{ color: 'var(--green)' }}>{fmt(totals.netValue)}</span></td><td style={{ textAlign: 'right', padding: '8px 14px' }}><span className={`fw-800 ${totals.gain >= 0 ? 'amt-g' : 'amt-r'}`}>{totals.gain >= 0 ? '+' : ''}{fmt(totals.gain)}</span></td><td /></tr></tfoot>
          </table></div>}
      </div>
      {modal && (<Modal title={edit ? '✏️ Edit Investment' : '+ Add Property / Investment'} onClose={() => { setModal(false); setEdit(null); }}>
        <div className="fg mb-3"><label className="fl">Investment Type</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>{PROP_TYPES.map(t => (<button key={t.key} type="button" onClick={() => setForm(p => ({ ...p, type: t.key }))} style={{ padding: '6px 12px', borderRadius: 20, border: `2px solid ${form.type === t.key ? 'var(--blue)' : 'var(--border2)'}`, background: form.type === t.key ? 'rgba(77,158,255,.12)' : 'var(--bg3)', color: form.type === t.key ? 'var(--blue)' : 'var(--t3)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t.icon} {t.label}</button>))}</div></div>
        <div className="fg"><label className="fl">Property / Asset Name</label><input className="fi" name="name" value={form.name} onChange={ch} placeholder="e.g. Anna Nagar Plot, SGB 2021" /></div>
        <div className="frow"><div className="fg"><label className="fl">Invested Amount (Rs)</label><input className="fi" type="number" name="investedAmount" value={form.investedAmount} onChange={ch} min="0" /></div><div className="fg"><label className="fl">Investment Date</label><input className="fi" type="date" name="investedDate" value={form.investedDate} onChange={ch} /></div></div>
        <div className="frow"><div className="fg"><label className="fl">Expected Return % p.a.</label><input className="fi" type="number" name="expectedReturn" value={form.expectedReturn} onChange={ch} step="0.1" /></div><div className="fg"><label className="fl">Buy Broker Fee (Rs)</label><input className="fi" type="number" name="buyBrokerFee" value={form.buyBrokerFee} onChange={ch} min="0" /></div></div>
        <div className="frow"><div className="fg"><label className="fl">Tax / Registration (Rs)</label><input className="fi" type="number" name="tax" value={form.tax} onChange={ch} min="0" /></div><div className="fg"><label className="fl">Selling Broker %</label><input className="fi" type="number" name="sellingBrokerPct" value={form.sellingBrokerPct} onChange={ch} step="0.1" min="0" /></div></div>
        {preview && (<div style={{ background: 'rgba(34,197,94,.07)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 10, padding: '12px 14px', marginBottom: 4 }}><div className="fw-700 fs-13 mb-2" style={{ color: 'var(--green)' }}>📊 Live Preview</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{[{ label: 'Years Held', val: `${preview.years.toFixed(2)}y` }, { label: 'Gross Value', val: fmt(preview.grossValue), c: 'var(--blue)' }, { label: 'After Fees & Tax', val: fmt(preview.netValue), c: 'var(--green)' }, { label: 'Net Gain', val: `${preview.gain >= 0 ? '+' : ''}${fmt(preview.gain)}`, c: preview.gain >= 0 ? 'var(--green)' : 'var(--red)' }].map((s, i) => (<div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '7px 10px' }}><div className="fs-11 text-muted">{s.label}</div><div className="fw-700 fs-13" style={{ color: s.c || 'var(--text)' }}>{s.val}</div></div>))}</div></div>)}
        <div className="modal-foot"><button className="btn btn-secondary" onClick={() => { setModal(false); setEdit(null); }}>Cancel</button><button className="btn btn-primary" onClick={save}>{edit ? 'Update' : 'Save Investment'}</button></div>
      </Modal>)}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

// ─── Gold Tracker ──────────────────────────────────────────
function GoldTracker() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentRate, setCurrentRate] = useState('');
  const [goldKarat, setGoldKarat] = useState('24');
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [form, setForm] = useState({ purchaseDate: today(), grams: '', purchasePrice: '', description: '' });
  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); try { setEntries(await goldService.getAll()); } catch { toast.error('Failed'); } finally { setLoading(false); } };
  const save = async () => {
    if (!form.grams || !form.purchasePrice) { toast.error('Fill all fields'); return; }
    try {
      if (edit) { await goldService.update(edit.id, { ...form, grams: parseFloat(form.grams), purchasePrice: parseFloat(form.purchasePrice) }); toast.success('Updated!'); }
      else { await goldService.create({ ...form, grams: parseFloat(form.grams), purchasePrice: parseFloat(form.purchasePrice) }); toast.success('Added!'); }
      setModal(false); setEdit(null); setForm({ purchaseDate: today(), grams: '', purchasePrice: '', description: '' }); load();
    } catch { toast.error('Failed'); }
  };
  const del = async () => { try { await goldService.delete(delId); toast.success('Deleted'); setDelId(null); load(); } catch { toast.error('Failed'); } };
  const curRate = parseFloat(currentRate) || 0;
  const effectiveRate = goldKarat === '22' ? (curRate * 22) / 24 : curRate;
  const totalGrams = entries.reduce((s, e) => s + e.grams, 0);
  const totalInvested = entries.reduce((s, e) => s + e.grams * e.purchasePrice, 0);
  const totalCurrentValue = effectiveRate > 0 ? totalGrams * effectiveRate : 0;
  const totalGain = totalCurrentValue - totalInvested;
  return (
    <div className="card mb-4">
      <div className="flex justify-between items-center mb-1"><div className="card-title" style={{ marginBottom: 0 }}>🥇 Gold Investment Tracker</div><button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm({ purchaseDate: today(), grams: '', purchasePrice: '', description: '' }); setModal(true); }}>+ Add</button></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, marginTop: 10 }}>
        <span style={{ fontSize: 18 }}>🥇</span>
        <div style={{ flex: 1 }}><div className="fs-12 fw-700" style={{ color: '#fbbf24' }}>Today's Gold Rate (per gram)</div><div className="fs-11 text-muted">Enter 24K rate — select karat to auto-adjust</div></div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">{['24', '22'].map(k => (<button key={k} type="button" onClick={() => setGoldKarat(k)} style={{ padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${goldKarat === k ? '#fbbf24' : 'var(--border2)'}`, background: goldKarat === k ? 'rgba(251,191,36,.2)' : 'var(--bg3)', color: goldKarat === k ? '#fbbf24' : 'var(--t3)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{k}K</button>))}</div>
          <div className="flex items-center gap-1"><span className="text-muted fs-13">Rs</span><input style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 14, fontWeight: 700, width: 110, outline: 'none' }} type="number" value={currentRate} onChange={e => setCurrentRate(e.target.value)} placeholder="e.g. 9200" /></div>
          {curRate > 0 && goldKarat === '22' && <div className="fs-11 text-muted">22K ≈ Rs {((curRate * 22) / 24).toFixed(0)}/g</div>}
        </div>
      </div>
      {entries.length > 0 && (<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>{[{ label: 'Total Gold', val: `${totalGrams.toFixed(3)} g`, c: '#fbbf24', icon: '⚖️' }, { label: 'Total Invested', val: fmt(totalInvested), c: 'var(--blue)', icon: '💰' }, { label: 'Current Value', val: curRate > 0 ? fmt(totalCurrentValue) : '—', c: 'var(--green)', icon: '📈' }, { label: 'Gain / Loss', val: curRate > 0 ? `${totalGain >= 0 ? '+' : ''}${fmt(totalGain)}` : '—', c: totalGain >= 0 ? 'var(--green)' : 'var(--red)', icon: totalGain >= 0 ? '📈' : '📉' }].map((s, i) => (<div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', borderLeft: `3px solid ${s.c}` }}><div className="fs-11 text-muted mb-1">{s.icon} {s.label}</div><div style={{ fontWeight: 800, color: s.c, fontSize: 13 }}>{s.val}</div></div>))}</div>)}
      {loading ? <div className="spin-center" style={{ height: 60 }}><div className="spin" /></div> : entries.length === 0
        ? <div className="empty" style={{ padding: '20px 0' }}><div className="empty-icon">🥇</div><div className="empty-title">No gold entries</div></div>
        : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Grams</th><th style={{ textAlign: 'right' }}>Buy Rate/g</th><th style={{ textAlign: 'right' }}>Invested</th><th style={{ textAlign: 'right' }}>Current Value</th><th style={{ textAlign: 'right' }}>Gain/Loss</th><th></th></tr></thead>
          <tbody>{entries.map(e => { const invested = e.grams * e.purchasePrice, curVal = effectiveRate > 0 ? e.grams * effectiveRate : null, gain = curVal !== null ? curVal - invested : null; return (<tr key={e.id}><td><div className="font-mono fs-12 text-muted">{fmtDate(e.purchaseDate)}</div><div className="fs-11 text-muted">{differenceInDays(new Date(), new Date(e.purchaseDate))} days ago</div></td><td className="fw-600 fs-13">{e.description || '—'}</td><td style={{ textAlign: 'right' }} className="fw-700">{e.grams.toFixed(3)} g</td><td style={{ textAlign: 'right' }} className="font-mono fs-12">{fmt(e.purchasePrice)}</td><td style={{ textAlign: 'right' }}><span className="amt">{fmt(invested)}</span></td><td style={{ textAlign: 'right' }}>{curVal !== null ? <span className="amt amt-g">{fmt(curVal)}</span> : <span className="text-muted fs-12">Enter rate</span>}</td><td style={{ textAlign: 'right' }}>{gain !== null ? <span className={`amt ${gain >= 0 ? 'amt-g' : 'amt-r'}`}>{gain >= 0 ? '+' : ''}{fmt(gain)}</span> : '—'}</td><td><div className="actions"><button className="btn-icon" onClick={() => { setEdit(e); setForm({ purchaseDate: fmtDateInput(e.purchaseDate), grams: e.grams, purchasePrice: e.purchasePrice, description: e.description || '' }); setModal(true); }}>✏️</button><button className="btn-icon" onClick={() => setDelId(e.id)}>🗑️</button></div></td></tr>); })}</tbody>
        </table></div>}
      {modal && <Modal title={edit ? '✏️ Edit Gold Entry' : '🥇 Add Gold Purchase'} onClose={() => { setModal(false); setEdit(null); }}>
        <div className="fg"><label className="fl">Purchase Date</label><input className="fi" type="date" value={form.purchaseDate} onChange={e => setForm(p => ({ ...p, purchaseDate: e.target.value }))} /></div>
        <div className="frow"><div className="fg"><label className="fl">Weight (grams)</label><input className="fi" type="number" value={form.grams} onChange={e => setForm(p => ({ ...p, grams: e.target.value }))} step="0.001" min="0" /></div><div className="fg"><label className="fl">Buy Price per gram (Rs)</label><input className="fi" type="number" value={form.purchasePrice} onChange={e => setForm(p => ({ ...p, purchasePrice: e.target.value }))} min="0" /></div></div>
        {form.grams && form.purchasePrice && <div style={{ background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 13 }}><span className="text-muted">Total: </span><span className="fw-800" style={{ color: '#fbbf24' }}>{fmt(parseFloat(form.grams) * parseFloat(form.purchasePrice))}</span></div>}
        <div className="fg"><label className="fl">Description (optional)</label><input className="fi" type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. 22K chain, Coin..." /></div>
        <div className="modal-foot"><button className="btn btn-secondary" onClick={() => { setModal(false); setEdit(null); }}>Cancel</button><button className="btn btn-primary" onClick={save}>{edit ? 'Update' : 'Add Gold'}</button></div>
      </Modal>}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

// ─── Redesigned Asset/Liability Row ───────────────────────
function AssetRow({ type, label, icon, value, subItems = [], onValueChange, onSubSave, color, totalForPercent }) {
  const [subModal, setSubModal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasSubItems = subItems.length > 0;
  const total = hasSubItems ? subItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0) : parseFloat(value) || 0;
  const pct = totalForPercent > 0 ? Math.min(100, (total / totalForPercent) * 100) : 0;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
        {/* Icon */}
        <div style={{ width: 32, height: 32, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
          {icon}
        </div>
        {/* Label + bar */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {total > 0 && <span style={{ fontSize: 13, fontWeight: 800, color }}>{fmt(total)}</span>}
              {total > 0 && <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600 }}>{pct.toFixed(0)}%</span>}
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .5s ease' }} />
          </div>
        </div>
        {/* Controls */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          {!hasSubItems && (
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', fontSize: 11 }}>₹</span>
              <input type="number" style={{ width: 110, paddingLeft: 20, padding: '5px 8px 5px 20px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 7, color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'monospace' }}
                value={value || ''} onChange={e => onValueChange(e.target.value)} placeholder="0" min="0" />
            </div>
          )}
          {hasSubItems && (
            <button onClick={() => setExpanded(p => !p)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {subItems.length} items {expanded ? '▲' : '▼'}
            </button>
          )}
          <button onClick={() => setSubModal(true)} style={{ background: hasSubItems ? color + '18' : 'var(--bg3)', border: `1px solid ${hasSubItems ? color + '40' : 'var(--border2)'}`, borderRadius: 7, padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: hasSubItems ? color : 'var(--t3)', whiteSpace: 'nowrap' }}>
            {hasSubItems ? '✏️' : '+'}
          </button>
        </div>
      </div>

      {/* Expanded sub-items */}
      {hasSubItems && expanded && (
        <div style={{ marginLeft: 42, background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px', borderLeft: `3px solid ${color}`, marginBottom: 4 }}>
          {subItems.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < subItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>{s.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color }}>{fmt(s.amount)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, marginTop: 4, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>Total</span>
            <span style={{ fontSize: 13, fontWeight: 900, color }}>{fmt(total)}</span>
          </div>
        </div>
      )}

      {subModal && (
        <Modal title={`${icon} ${label} — Sub-items`} onClose={() => setSubModal(false)}>
          <SubItemModal label={label} icon={icon} items={subItems} onSave={(items, total) => { onSubSave(items, total); setSubModal(false); }} onClose={() => setSubModal(false)} />
        </Modal>
      )}
    </div>
  );
}

// ─── Main NetWorth Page ────────────────────────────────────
export default function NetWorthPage() {
  const [unlocked, setUnlocked] = useState(() => !getPin('networth'));

  const SNAPSHOT_KEY = 'fintrack_nw_snapshots';
  const [snapshots, setSnapshots] = useState(() => { try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]'); } catch { return []; } });
  const [showSnapshots, setShowSnapshots] = useState(false);

  const [assets, setAssets] = useState({});
  const [assetSubs, setAssetSubs] = useState({});
  const [liabilities, setLiabilities] = useState({});
  const [liabSubs, setLiabSubs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('networth');
  const [syncing, setSyncing] = useState(false);
  const [bankMonth, setBankMonth] = useState(new Date().getMonth() + 1);
  const [bankYear, setBankYear] = useState(new Date().getFullYear());
  const [bankCalc, setBankCalc] = useState(null);
  const [showSyncPanel, setShowSyncPanel] = useState(false);

  const ASSET_TYPES = [
    { key: 'cash',        label: 'Cash in Hand',       icon: '💵' },
    { key: 'bank',        label: 'Bank Balance',        icon: '🏦' },
    { key: 'gold',        label: 'Gold',                icon: '🥇' },
    { key: 'stocks',      label: 'Stock Market',        icon: '📈' },
    { key: 'mutualfunds', label: 'Mutual Funds / SIP',  icon: '📊' },
    { key: 'realestate',  label: 'Real Estate',         icon: '🏠' },
    { key: 'fd',          label: 'Fixed Deposits / RD', icon: '🏧' },
    { key: 'ppf',         label: 'PPF / Insurance',     icon: '🛡️' },
    { key: 'other_asset', label: 'Other Assets',        icon: '💼' },
  ];

  const LIABILITY_TYPES = [
    { key: 'personal_loan',    label: 'Personal Loan',     icon: '💳' },
    { key: 'home_loan',        label: 'Home Loan',          icon: '🏠' },
    { key: 'vehicle_loan',     label: 'Vehicle Loan',       icon: '🚗' },
    { key: 'credit_card',      label: 'Credit Card Dues',   icon: '💳' },
    { key: 'gold_loan',        label: 'Gold Loan',          icon: '🥇' },
    { key: 'chittu',           label: 'Chittu / Chit Fund', icon: '📋' },
    { key: 'other_liability',  label: 'Other Liabilities',  icon: '📄' },
  ];

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const d = await netWorthService.get();
      setAssets(d.assets || {}); setAssetSubs(d.assetSubs || {});
      setLiabilities(d.liabilities || {}); setLiabSubs(d.liabSubs || {});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const syncPortfolio = async () => {
    setSyncing(true);
    try {
      const investments = await investmentService.getAll();
      if (investments.length === 0) { toast.error('No stocks in portfolio!'); return; }
      const symMap = {};
      investments.forEach(i => { const sym = i.symbol || i.stockName; if (!symMap[sym]) symMap[sym] = { name: i.stockName, symbol: sym, value: 0, qty: 0 }; symMap[sym].value += i.currentValue; symMap[sym].qty += i.quantity; });
      const totalValue = Object.values(symMap).reduce((s, v) => s + v.value, 0);
      const subItems = Object.values(symMap).sort((a, b) => b.value - a.value).map(v => ({ name: `${v.symbol} (${v.qty} qty)`, amount: v.value }));
      setAssets(p => ({ ...p, stocks: totalValue })); setAssetSubs(p => ({ ...p, stocks: subItems }));
      toast.success(`Synced ${Object.keys(symMap).length} symbols — ${fmt(totalValue)}`);
    } catch { toast.error('Sync failed'); } finally { setSyncing(false); }
  };

  const syncLoans = async () => {
    setSyncing(true);
    try {
      const loans = await loanService.getAll();
      if (loans.length === 0) { toast.error('No loans found!'); return; }
      const typeMap = {};
      for (const l of loans) {
        const key = l.loanType || 'other_liability';
        if (!typeMap[key]) typeMap[key] = { total: 0, items: [] };
        const pays = await loanPaymentService.getAll(l.id);
        const paid = pays.reduce((s, p) => s + p.amount, 0);
        const outstanding = Math.max(0, l.amount - paid);
        if (outstanding > 0) { typeMap[key].total += outstanding; typeMap[key].items.push({ name: l.name, amount: outstanding }); }
      }
      const newLiab = { ...liabilities }, newLiabSubs = { ...liabSubs };
      let synced = 0;
      Object.entries(typeMap).forEach(([key, data]) => { const liabKey = LIABILITY_TYPES.find(t => t.key === key)?.key || 'other_liability'; newLiab[liabKey] = data.total; newLiabSubs[liabKey] = data.items; synced += data.items.length; });
      setLiabilities(newLiab); setLiabSubs(newLiabSubs);
      toast.success(`Synced ${synced} loans into Liabilities!`);
    } catch (e) { console.error(e); toast.error('Sync failed'); } finally { setSyncing(false); }
  };

  const calcBankBalance = async () => {
    setSyncing(true);
    try {
      const [incomeAll, expensesAll] = await Promise.all([incomeService.getAll({ month: bankMonth, year: bankYear }), expenseService.getAll({ month: bankMonth, year: bankYear })]);
      const totalIncome = incomeAll.reduce((s, i) => s + +i.amount, 0);
      const totalExpense = expensesAll.reduce((s, i) => s + +i.amount, 0);
      setBankCalc({ income: totalIncome, expense: totalExpense, balance: totalIncome - totalExpense, month: bankMonth, year: bankYear });
      toast.success('Bank balance calculated!');
    } catch { toast.error('Failed'); } finally { setSyncing(false); }
  };

  const applyBankBalance = () => {
    if (!bankCalc) return;
    setAssets(p => ({ ...p, bank: bankCalc.balance }));
    setAssetSubs(p => { const n = { ...p }; delete n.bank; return n; });
    toast.success('Bank balance applied!');
  };

  const save = async () => {
    setSaving(true);
    try { await netWorthService.save({ assets, assetSubs, liabilities, liabSubs }); toast.success('Net worth saved!'); }
    catch { toast.error('Failed to save'); } finally { setSaving(false); }
  };

  const getVal = (map, subMap, key) => {
    const subs = subMap[key];
    if (subs && subs.length > 0) return subs.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    return parseFloat(map[key]) || 0;
  };

  const totalAssets = ASSET_TYPES.reduce((s, t) => s + getVal(assets, assetSubs, t.key), 0);
  const totalLiabilities = LIABILITY_TYPES.reduce((s, t) => s + getVal(liabilities, liabSubs, t.key), 0);
  const netWorth = totalAssets - totalLiabilities;
  const healthPct = totalAssets > 0 ? Math.min(100, ((totalAssets - totalLiabilities) / totalAssets) * 100) : 0;

  const takeSnapshot = () => {
    const snap = { id: Date.now(), date: new Date().toISOString(), label: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), totalAssets, totalLiabilities, netWorth };
    const updated = [snap, ...snapshots].slice(0, 24);
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(updated)); setSnapshots(updated);
    toast.success(`📸 Snapshot saved — ${fmt(netWorth)}`);
  };

  const deleteSnapshot = (id) => {
    const updated = snapshots.filter(s => s.id !== id);
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(updated)); setSnapshots(updated);
  };

  if (!unlocked) return <LockedScreen page="networth" onUnlock={() => setUnlocked(true)} />;
  if (loading) return <div className="spin-center"><div className="spin spin-lg" /></div>;

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-head">
        <div><div className="page-title">🏛️ Net Worth</div><div className="page-sub">Track your complete financial position</div></div>
        <div className="flex gap-2">
          {activeTab === 'networth' && <button className="btn btn-secondary" onClick={() => setShowSnapshots(s => !s)}>📸 {snapshots.length > 0 ? `${snapshots.length} Snapshots` : 'Snapshots'}</button>}
          {activeTab === 'networth' && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spin" /> : null} 💾 Save</button>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        {[{ key: 'networth', label: '💎 Net Worth' }, { key: 'property', label: '🏠 Investments' }, { key: 'gold', label: '🥇 Gold Tracker' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: activeTab === t.key ? 'var(--bg3)' : 'transparent', color: activeTab === t.key ? 'var(--text)' : 'var(--t3)', borderBottom: activeTab === t.key ? '2px solid var(--blue)' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'networth' && (
        <>
          {/* ══ HERO: Net Worth Banner ══════════════════════════════ */}
          <div style={{ background: netWorth >= 0 ? 'linear-gradient(135deg, rgba(34,197,94,.12) 0%, rgba(34,197,94,.04) 100%)' : 'linear-gradient(135deg, rgba(244,63,94,.12) 0%, rgba(244,63,94,.04) 100%)', border: `1px solid ${netWorth >= 0 ? 'rgba(34,197,94,.25)' : 'rgba(244,63,94,.25)'}`, borderRadius: 16, padding: '24px 28px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              {/* Left: big net worth */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>💎 Total Net Worth</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: netWorth >= 0 ? 'var(--green)' : 'var(--red)', lineHeight: 1, letterSpacing: '-1px' }}>
                  {fmt(netWorth)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>Assets − Liabilities</div>
              </div>

              {/* Center: health meter */}
              <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg4)" strokeWidth="10" />
                  <circle cx="50" cy="50" r="42" fill="none"
                    stroke={healthPct >= 70 ? 'var(--green)' : healthPct >= 40 ? '#f59e0b' : 'var(--red)'}
                    strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(healthPct / 100) * 264} 264`}
                    strokeDashoffset="66"
                    style={{ transition: 'stroke-dasharray .8s ease' }}
                  />
                  <text x="50" y="46" textAnchor="middle" style={{ fontSize: 16, fontWeight: 900, fill: 'var(--text)', fontFamily: 'inherit' }}>{healthPct.toFixed(0)}%</text>
                  <text x="50" y="60" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--t3)', fontFamily: 'inherit' }}>healthy</text>
                </svg>
              </div>

              {/* Right: asset/liability split */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 180 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(34,197,94,.08)', borderRadius: 10, padding: '10px 14px' }}>
                  <div><div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>📈 Total Assets</div><div style={{ fontSize: 18, fontWeight: 900, color: 'var(--green)' }}>{fmt(totalAssets)}</div></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(244,63,94,.08)', borderRadius: 10, padding: '10px 14px' }}>
                  <div><div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>📉 Total Liabilities</div><div style={{ fontSize: 18, fontWeight: 900, color: 'var(--red)' }}>{fmt(totalLiabilities)}</div></div>
                </div>
              </div>

              {/* Snap button */}
              <button onClick={takeSnapshot} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                📸 Snap
              </button>
            </div>

            {/* Asset vs Liability bar */}
            {totalAssets > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>
                  <span>Assets {totalAssets > 0 ? ((totalAssets / (totalAssets + totalLiabilities || 1)) * 100).toFixed(0) : 0}%</span>
                  <span>Liabilities {totalLiabilities > 0 ? ((totalLiabilities / (totalAssets + totalLiabilities || 1)) * 100).toFixed(0) : 0}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg4)', borderRadius: 8, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ height: '100%', width: `${totalAssets / (totalAssets + totalLiabilities || 1) * 100}%`, background: 'var(--green)', borderRadius: '8px 0 0 8px', transition: 'width .6s ease' }} />
                  <div style={{ height: '100%', flex: 1, background: 'var(--red)', borderRadius: '0 8px 8px 0' }} />
                </div>
              </div>
            )}
          </div>

          {/* ══ Sync Tools Bar (collapsed by default) ══════════════ */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
            <button onClick={() => setShowSyncPanel(p => !p)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 15 }}>⚡</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Quick Sync Tools</span>
              <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 4 }}>Sync portfolio, loans & bank balance</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t3)' }}>{showSyncPanel ? '▲' : '▼'}</span>
            </button>
            {showSyncPanel && (
              <div style={{ borderTop: '1px solid var(--border)', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                {/* Portfolio Sync */}
                <div style={{ background: 'rgba(77,158,255,.06)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>📈 Portfolio → Stocks</span>
                    <button className="btn btn-primary btn-sm" onClick={syncPortfolio} disabled={syncing}>{syncing ? <span className="spin" /> : '🔄'} Sync</button>
                  </div>
                  <div className="text-muted fs-11">Fills Stock Market value from your portfolio</div>
                  {assetSubs.stocks?.length > 0 && <div className="fs-11 mt-1" style={{ color: 'var(--green)' }}>✅ {assetSubs.stocks.length} symbols synced</div>}
                </div>
                {/* Loans Sync */}
                <div style={{ background: 'rgba(244,63,94,.06)', border: '1px solid rgba(244,63,94,.2)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>💳 Loans → Liabilities</span>
                    <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }} onClick={syncLoans} disabled={syncing}>{syncing ? <span className="spin" /> : '🔄'} Sync</button>
                  </div>
                  <div className="text-muted fs-11">Auto-fills outstanding loan balances</div>
                  {Object.values(liabSubs).flat().length > 0 && <div className="fs-11 mt-1" style={{ color: 'var(--green)' }}>✅ {Object.values(liabSubs).flat().length} loans synced</div>}
                </div>
                {/* Bank Calc */}
                <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>🏦 Calculate Bank Balance</div>
                  <div className="flex gap-2 mb-2">
                    <select className="fs btn-sm" value={bankMonth} onChange={e => setBankMonth(+e.target.value)} style={{ flex: 1 }}>
                      {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                    </select>
                    <select className="fs btn-sm" value={bankYear} onChange={e => setBankYear(+e.target.value)} style={{ flex: 1 }}>
                      {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={calcBankBalance} disabled={syncing}>{syncing ? <span className="spin" /> : '🧮'}</button>
                  </div>
                  {bankCalc && (
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
                      <div className="flex justify-between mb-1"><span className="text-muted">Income</span><span className="amt-g fw-700">{fmt(bankCalc.income)}</span></div>
                      <div className="flex justify-between mb-1"><span className="text-muted">Expenses</span><span className="amt-r fw-700">{fmt(bankCalc.expense)}</span></div>
                      <div className="flex justify-between mb-2"><span className="fw-700">Balance</span><span className={`fw-800 ${bankCalc.balance >= 0 ? 'amt-g' : 'amt-r'}`}>{fmt(bankCalc.balance)}</span></div>
                      <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={applyBankBalance}>✅ Apply as Bank Balance</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ══ Assets & Liabilities side-by-side ══════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
            {/* Assets */}
            <div className="card" style={{ padding: '20px 20px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 28, background: 'var(--green)', borderRadius: 4 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>Assets</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{ASSET_TYPES.filter(t => getVal(assets, assetSubs, t.key) > 0).length} of {ASSET_TYPES.length} filled</div>
                  </div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--green)' }}>{fmt(totalAssets)}</div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                {ASSET_TYPES.map(t => (
                  <AssetRow key={t.key} type={t.key} label={t.label} icon={t.icon} color="var(--green)"
                    value={assets[t.key]} subItems={assetSubs[t.key] || []}
                    totalForPercent={totalAssets}
                    onValueChange={val => setAssets(p => ({ ...p, [t.key]: val }))}
                    onSubSave={(items, total) => { setAssetSubs(p => ({ ...p, [t.key]: items })); setAssets(p => ({ ...p, [t.key]: total })); }}
                  />
                ))}
              </div>
              <div style={{ borderTop: '2px solid var(--green)', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>Total Assets</span>
                <span style={{ fontWeight: 900, fontSize: 16, color: 'var(--green)' }}>{fmt(totalAssets)}</span>
              </div>
            </div>

            {/* Liabilities */}
            <div className="card" style={{ padding: '20px 20px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 28, background: 'var(--red)', borderRadius: 4 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>Liabilities</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{LIABILITY_TYPES.filter(t => getVal(liabilities, liabSubs, t.key) > 0).length} of {LIABILITY_TYPES.length} filled</div>
                  </div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--red)' }}>{fmt(totalLiabilities)}</div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                {LIABILITY_TYPES.map(t => (
                  <AssetRow key={t.key} type={t.key} label={t.label} icon={t.icon} color="var(--red)"
                    value={liabilities[t.key]} subItems={liabSubs[t.key] || []}
                    totalForPercent={totalLiabilities}
                    onValueChange={val => setLiabilities(p => ({ ...p, [t.key]: val }))}
                    onSubSave={(items, total) => { setLiabSubs(p => ({ ...p, [t.key]: items })); setLiabilities(p => ({ ...p, [t.key]: total })); }}
                  />
                ))}
              </div>
              <div style={{ borderTop: '2px solid var(--red)', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>Total Liabilities</span>
                <span style={{ fontWeight: 900, fontSize: 16, color: 'var(--red)' }}>{fmt(totalLiabilities)}</span>
              </div>
            </div>
          </div>

          {/* ══ Snapshots Panel ════════════════════════════════════ */}
          {showSnapshots && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div className="card-title" style={{ marginBottom: 2 }}>📸 Net Worth Snapshots</div>
                  <div className="text-muted fs-12">{snapshots.length}/24 saved · stored locally on this device</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={takeSnapshot}>+ Take Now</button>
              </div>

              {snapshots.length === 0 ? (
                <div className="text-muted fs-13" style={{ textAlign: 'center', padding: 24 }}>No snapshots yet — click "Snap" in the hero banner above</div>
              ) : (
                <>
                  {/* Inline sparkline chart */}
                  {snapshots.length >= 2 && (() => {
                    const sorted = [...snapshots].reverse();
                    const vals = sorted.map(s => s.netWorth);
                    const max = Math.max(...vals), min = Math.min(...vals);
                    const range = max - min || 1;
                    const W = 100, H = 48;
                    const points = sorted.map((s, i) => {
                      const x = (i / (sorted.length - 1)) * W;
                      const y = H - ((s.netWorth - min) / range) * (H - 8) - 4;
                      return `${x},${y}`;
                    }).join(' ');
                    const latest = sorted[sorted.length - 1];
                    const first = sorted[0];
                    const trendUp = latest.netWorth >= first.netWorth;
                    return (
                      <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>NET WORTH TREND</div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: trendUp ? 'var(--green)' : 'var(--red)' }}>{fmt(latest.netWorth)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: 'var(--t3)' }}>Change from first</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: trendUp ? 'var(--green)' : 'var(--red)' }}>
                              {trendUp ? '▲' : '▼'} {fmt(Math.abs(latest.netWorth - first.netWorth))}
                            </div>
                          </div>
                        </div>
                        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 56, display: 'block' }}>
                          <defs>
                            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={trendUp ? 'var(--green)' : 'var(--red)'} stopOpacity="0.3" />
                              <stop offset="100%" stopColor={trendUp ? 'var(--green)' : 'var(--red)'} stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <polyline points={points} fill="none" stroke={trendUp ? 'var(--green)' : 'var(--red)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          {sorted.map((s, i) => {
                            const x = (i / (sorted.length - 1)) * W;
                            const y = H - ((s.netWorth - min) / range) * (H - 8) - 4;
                            return <circle key={s.id} cx={x} cy={y} r="2.5" fill={trendUp ? 'var(--green)' : 'var(--red)'} />;
                          })}
                        </svg>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                          <span>{first.label}</span><span>{latest.label}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Snapshot table */}
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Date</th><th style={{ textAlign: 'right' }}>Assets</th><th style={{ textAlign: 'right' }}>Liabilities</th><th style={{ textAlign: 'right' }}>Net Worth</th><th style={{ textAlign: 'right' }}>Change</th><th></th></tr></thead>
                      <tbody>{snapshots.map((s, i) => {
                        const prev = snapshots[i + 1];
                        const change = prev ? s.netWorth - prev.netWorth : null;
                        return (
                          <tr key={s.id}>
                            <td className="fw-600 fs-13">{s.label}</td>
                            <td style={{ textAlign: 'right' }} className="amt-g fs-12">{fmt(s.totalAssets)}</td>
                            <td style={{ textAlign: 'right' }} className="amt-r fs-12">{fmt(s.totalLiabilities)}</td>
                            <td style={{ textAlign: 'right' }}><span className="fw-800" style={{ color: s.netWorth >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(s.netWorth)}</span></td>
                            <td style={{ textAlign: 'right' }}>
                              {change !== null ? <span className={`fw-700 fs-12 ${change >= 0 ? 'amt-g' : 'amt-r'}`}>{change >= 0 ? '+' : ''}{fmt(change)}</span> : <span className="text-muted fs-12">—</span>}
                            </td>
                            <td><button className="btn-icon" onClick={() => deleteSnapshot(s.id)}>🗑️</button></td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'property' && <PropertyCalc />}
      {activeTab === 'gold' && <GoldTracker />}
    </div>
  );
}