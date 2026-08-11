import { useState, useEffect } from 'react';
import { netWorthService, goldService, investmentService, incomeService, expenseService, loanService, loanPaymentService } from '../utils/dbService';
import { fmt, fmtDate, fmtDateInput, today } from '../utils/helpers';
import { Modal, ConfirmDelete, DateStepper } from '../components/UI';
import { differenceInDays } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Area, AreaChart } from 'recharts';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

import { pinService } from '../utils/dbService';

function LockedScreen({ page, onUnlock }) {
  const [input, setInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [storedPin, setStoredPin] = useState(() => pinService.getCached(page));
  const [mode, setMode] = useState(pinService.getCached(page) ? 'unlock' : 'setup');
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(true);

  // Sync PIN from Firestore on mount
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
        <div className="text-muted fs-13 mb-5">{mode === 'setup' ? 'Protect this page with a 4-digit PIN — synced across all devices' : 'This page is PIN protected'}</div>
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

// ─── Sub-item Modal ────────────────────────────────────────
function SubItemModal({ label, icon, items = [], onSave, onClose }) {
  const [list, setList] = useState(items.length > 0 ? items : [{ name: '', amount: '' }]);
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
          {list.length > 1 && <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</button>}
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

  useEffect(() => {
    try { setEntries(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch { setEntries([]); }
    setLoading(false);
  }, []);

  const persist = (list) => { localStorage.setItem(storageKey, JSON.stringify(list)); setEntries(list); };

  const calcEntry = (e) => {
    const invested = parseFloat(e.investedAmount) || 0;
    const rate = parseFloat(e.expectedReturn) / 100 || 0;
    const buyFee = parseFloat(e.buyBrokerFee) || 0;
    const taxAmt = parseFloat(e.tax) || 0;
    const sellPct = parseFloat(e.sellingBrokerPct) / 100 || 0;
    const from = e.investedDate ? new Date(e.investedDate) : new Date();
    const now = new Date();
    const years = Math.max(0, (now - from) / (1000 * 60 * 60 * 24 * 365.25));
    const grossValue = invested * Math.pow(1 + rate, years);
    const sellFee = grossValue * sellPct;
    const netValue = grossValue - buyFee - taxAmt - sellFee;
    const gain = netValue - invested;
    return { grossValue, netValue, gain, years };
  };

  const save = () => {
    if (!form.name || !form.investedAmount || !form.investedDate) { toast.error('Fill Name, Amount, Date'); return; }
    const entry = { ...form, id: edit?.id || `prop_${Date.now()}` };
    if (edit) {
      persist(entries.map(e => e.id === edit.id ? entry : e));
      toast.success('Updated!');
    } else {
      persist([...entries, entry]);
      toast.success('Saved!');
    }
    setModal(false); setEdit(null); setForm(BLANK_PROP);
  };

  const del = () => { persist(entries.filter(e => e.id !== delId)); setDelId(null); toast.success('Deleted'); };

  const ch = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const totals = entries.reduce((s, e) => {
    const c = calcEntry(e);
    return { invested: s.invested + (parseFloat(e.investedAmount) || 0), netValue: s.netValue + c.netValue, gain: s.gain + c.gain };
  }, { invested: 0, netValue: 0, gain: 0 });

  // Live preview for modal
  const preview = form.investedAmount && form.investedDate ? calcEntry(form) : null;

  return (
    <div>
      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>🏠 Property & Investment Tracker</div>
            <div className="text-muted fs-12 mt-1">Track real estate, gold, bonds — see today's value after all fees</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm(BLANK_PROP); setModal(true); }}>+ Add Investment</button>
        </div>

        {/* Summary */}
        {entries.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total Invested', val: fmt(totals.invested), c: 'var(--blue)' },
              { label: "Today's Net Value", val: fmt(totals.netValue), c: 'var(--green)' },
              { label: 'Total Gain', val: `${totals.gain >= 0 ? '+' : ''}${fmt(totals.gain)}`, c: totals.gain >= 0 ? 'var(--green)' : 'var(--red)' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${s.c}` }}>
                <div className="fs-11 text-muted">{s.label}</div>
                <div className="fw-800 fs-14" style={{ color: s.c }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {loading ? <div className="spin-center"><div className="spin" /></div>
          : entries.length === 0
            ? <div className="empty" style={{ padding: '30px 0' }}><div className="empty-icon">🏠</div><div className="empty-title">No investments added yet</div><div className="empty-sub">Add property, gold, or bonds to track appreciation</div></div>
            : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>
                    <th>Property / Asset</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Invested</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Rate %</th>
                    <th style={{ textAlign: 'right' }}>Yrs Held</th>
                    <th style={{ textAlign: 'right' }}>Net Value Today</th>
                    <th style={{ textAlign: 'right' }}>Gain / Loss</th>
                    <th>Actions</th>
                  </tr></thead>
                  <tbody>{entries.map(e => {
                    const c = calcEntry(e);
                    const ptype = PROP_TYPES.find(p => p.key === e.type) || PROP_TYPES[0];
                    return (
                      <tr key={e.id}>
                        <td className="fw-700 fs-13">{e.name}</td>
                        <td><span style={{ background: 'var(--bg3)', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{ptype.icon} {ptype.label}</span></td>
                        <td style={{ textAlign: 'right' }}><span className="amt">{fmt(parseFloat(e.investedAmount))}</span></td>
                        <td className="font-mono fs-12 text-muted">{e.investedDate}</td>
                        <td style={{ color: 'var(--purple)', textAlign: 'right' }} className="fs-12 fw-700">{e.expectedReturn}%</td>
                        <td style={{ textAlign: 'right' }} className="fs-12 text-muted">{c.years.toFixed(1)}y</td>
                        <td style={{ textAlign: 'right' }}><span className="fw-800" style={{ color: 'var(--green)', fontSize: 13 }}>{fmt(c.netValue)}</span></td>
                        <td style={{ textAlign: 'right' }}><span className={`fw-700 fs-12 ${c.gain >= 0 ? 'amt-g' : 'amt-r'}`}>{c.gain >= 0 ? '+' : ''}{fmt(c.gain)}</span></td>
                        <td><div className="actions">
                          <button className="btn-icon" onClick={() => { setEdit(e); setForm({ ...e }); setModal(true); }}>✏️</button>
                          <button className="btn-icon" onClick={() => setDelId(e.id)}>🗑️</button>
                        </div></td>
                      </tr>
                    );
                  })}</tbody>
                  <tfoot><tr>
                    <td colSpan={2} style={{ padding: '8px 14px' }} className="fw-700 fs-12 text-muted">TOTAL</td>
                    <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="amt fw-800">{fmt(totals.invested)}</span></td>
                    <td colSpan={3} />
                    <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="fw-800" style={{ color: 'var(--green)' }}>{fmt(totals.netValue)}</span></td>
                    <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className={`fw-800 ${totals.gain >= 0 ? 'amt-g' : 'amt-r'}`}>{totals.gain >= 0 ? '+' : ''}{fmt(totals.gain)}</span></td>
                    <td />
                  </tr></tfoot>
                </table>
              </div>
            )}
      </div>

      {/* Modal */}
      {modal && (
        <Modal title={edit ? '✏️ Edit Investment' : '+ Add Property / Investment'} onClose={() => { setModal(false); setEdit(null); }}>
          {/* Type selector */}
          <div className="fg mb-3">
            <label className="fl">Investment Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {PROP_TYPES.map(t => (
                <button key={t.key} type="button" onClick={() => setForm(p => ({ ...p, type: t.key }))}
                  style={{ padding: '6px 12px', borderRadius: 20, border: `2px solid ${form.type === t.key ? 'var(--blue)' : 'var(--border2)'}`, background: form.type === t.key ? 'rgba(77,158,255,.12)' : 'var(--bg3)', color: form.type === t.key ? 'var(--blue)' : 'var(--t3)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="fg"><label className="fl">Property / Asset Name</label><input className="fi" name="name" value={form.name} onChange={ch} placeholder="e.g. Anna Nagar Plot, SGB 2021, HDFC Bond" /></div>

          <div className="frow">
            <div className="fg"><label className="fl">Invested Amount (Rs)</label><input className="fi" type="number" name="investedAmount" value={form.investedAmount} onChange={ch} placeholder="e.g. 25,000" min="0" /></div>
            <div className="fg"><label className="fl">Investment Date</label><DateStepper name="investedDate" value={form.investedDate} onChange={ch} /></div>
          </div>

          <div className="frow">
            <div className="fg"><label className="fl">Expected Return % (p.a.)</label><input className="fi" type="number" name="expectedReturn" value={form.expectedReturn} onChange={ch} step="0.1" placeholder="e.g. 12" /></div>
            <div className="fg"><label className="fl">Buy Broker Fee (Rs)</label><input className="fi" type="number" name="buyBrokerFee" value={form.buyBrokerFee} onChange={ch} placeholder="e.g. 500" min="0" /></div>
          </div>

          <div className="frow">
            <div className="fg"><label className="fl">Tax / Registration Fee (Rs)</label><input className="fi" type="number" name="tax" value={form.tax} onChange={ch} placeholder="e.g. 2000" min="0" /></div>
            <div className="fg"><label className="fl">Selling Broker % (at exit)</label><input className="fi" type="number" name="sellingBrokerPct" value={form.sellingBrokerPct} onChange={ch} step="0.1" placeholder="e.g. 1" min="0" /></div>
          </div>

          {/* Live Preview */}
          {preview && (
            <div style={{ background: 'rgba(34,197,94,.07)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 10, padding: '12px 14px', marginTop: 4, marginBottom: 4 }}>
              <div className="fw-700 fs-13 mb-2" style={{ color: 'var(--green)' }}>📊 Live Preview — Today's Value</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Years Held', val: `${preview.years.toFixed(2)} years` },
                  { label: 'Gross Value', val: fmt(preview.grossValue), c: 'var(--blue)' },
                  { label: 'After Fees & Tax', val: fmt(preview.netValue), c: 'var(--green)' },
                  { label: 'Net Gain', val: `${preview.gain >= 0 ? '+' : ''}${fmt(preview.gain)}`, c: preview.gain >= 0 ? 'var(--green)' : 'var(--red)' },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '7px 10px' }}>
                    <div className="fs-11 text-muted">{s.label}</div>
                    <div className="fw-700 fs-13" style={{ color: s.c || 'var(--text)' }}>{s.val}</div>
                  </div>
                ))}
              </div>
              <div className="fs-11 text-muted mt-2">Formula: Invested × (1 + Rate%)^Years − Buy Fee − Tax − (Gross × Selling%)</div>
            </div>
          )}

          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={() => { setModal(false); setEdit(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{edit ? 'Update' : 'Save Investment'}</button>
          </div>
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

// ─── Gold Tracker ──────────────────────────────────────────
// 🔑 goldapi.io API key — get yours free at https://www.goldapi.io
const GOLD_API_KEY = 'goldapi-REPLACE_WITH_YOUR_KEY'; // ← paste your key here

// ── Gold import helpers ─────────────────────────────────────
// Turn a raw CSV/Excel cell into 'yyyy-mm-dd'. Handles Excel serial
// dates, JS Date objects (from xlsx cellDates), and common string
// formats (dd/mm/yyyy, mm/dd/yyyy, yyyy-mm-dd).
function parseImportDate(raw) {
  if (raw === undefined || raw === null || raw === '') return today();
  if (raw instanceof Date && !isNaN(raw.getTime())) return fmtDateInput(raw);
  if (typeof raw === 'number') {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return fmtDateInput(d);
  }
  const str = String(raw).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = `20${y}`;
    const d = new Date(`${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`);
    if (!isNaN(d.getTime())) return fmtDateInput(d);
  }
  const d2 = new Date(str);
  if (!isNaN(d2.getTime())) return fmtDateInput(d2);
  return today();
}

// Match a header cell against a list of accepted names (case/space-insensitive)
function matchHeader(headers, ...aliases) {
  const norm = h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = aliases.map(norm);
  return headers.find(h => wanted.includes(norm(h)));
}

// Parse a CSV/XLSX File into normalized gold-entry rows.
// Expected columns (any order, header names flexible):
//   Date | Item / Description | Price per Gram (optional) | Total Amount
async function parseGoldImportFile(file) {
  const buf = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name);
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const dateKey   = matchHeader(headers, 'date', 'purchasedate');
  const itemKey   = matchHeader(headers, 'item', 'items', 'itemname');
  const descKey   = matchHeader(headers, 'description', 'desc', 'notes');
  const priceKey  = matchHeader(headers, 'priceGram', 'pricepergram', 'rate', 'ratepergram', 'pricePerG');
  const amountKey = matchHeader(headers, 'totalAmount', 'totalamountbrought', 'amount', 'amountbrought', 'totalpaid', 'total');

  return rows.map(row => {
    const item      = itemKey ? String(row[itemKey] || '').trim() : '';
    const desc      = descKey ? String(row[descKey] || '').trim() : '';
    const priceGram = priceKey ? parseFloat(row[priceKey]) || 0 : 0;
    const amount    = amountKey ? parseFloat(row[amountKey]) || 0 : 0;
    const grams     = priceGram > 0 && amount > 0 ? amount / priceGram : 0;
    return {
      purchaseDate: dateKey ? parseImportDate(row[dateKey]) : today(),
      description: [item, desc].filter(Boolean).join(' — '),
      purchasePrice: priceGram,
      totalAmount: amount,
      grams,
      gst: 0,
      wastage: 0,
    };
  }).filter(r => r.totalAmount > 0 || r.grams > 0); // skip blank rows
}

// ─── Import Gold CSV/Excel Modal ────────────────────────────
function ImportGoldModal({ onClose, onImported }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    try {
      const parsed = await parseGoldImportFile(file);
      if (parsed.length === 0) toast.error('No valid rows found — check your column headers');
      setRows(parsed);
    } catch (e) {
      console.error(e);
      toast.error('Could not read that file. Use .csv or .xlsx');
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (i, field, val) => setRows(p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const removeRow = (i) => setRows(p => p.filter((_, idx) => idx !== i));

  const confirmImport = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      for (const r of rows) {
        await goldService.create({
          purchaseDate: r.purchaseDate,
          description: r.description,
          purchasePrice: parseFloat(r.purchasePrice) || 0,
          totalAmount: parseFloat(r.totalAmount) || 0,
          grams: parseFloat(r.grams) || 0,
          gst: 0,
          wastage: 0,
        });
      }
      toast.success(`Imported ${rows.length} gold entr${rows.length === 1 ? 'y' : 'ies'}!`);
      onImported();
    } catch (e) {
      console.error(e);
      toast.error('Import failed partway — check what was added');
      onImported();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="📥 Import Gold Entries" onClose={onClose}>
      <div className="text-muted fs-12 mb-3">
        Upload a CSV or Excel file with columns: <b>Date</b>, <b>Item/Description</b>, <b>Price per Gram</b> (optional), <b>Total Amount</b>.
        If price per gram is left out, weight (grams) won't be tracked for that row — only the amount spent.
      </div>
      <input
        className="fi"
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={e => handleFile(e.target.files?.[0])}
        style={{ marginBottom: 12 }}
      />
      {parsing && <div className="spin-center" style={{ height: 40 }}><div className="spin" /></div>}

      {rows.length > 0 && (
        <>
          <div className="fs-12 fw-700 mb-2">Preview — {fileName} ({rows.length} rows)</div>
          <div className="tbl-wrap" style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Price/g</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                  <th style={{ textAlign: 'right' }}>Grams (calc)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><input className="fi" type="date" value={r.purchaseDate} onChange={e => updateRow(i, 'purchaseDate', e.target.value)} style={{ fontSize: 12, padding: '4px 6px' }} /></td>
                    <td><input className="fi" type="text" value={r.description} onChange={e => updateRow(i, 'description', e.target.value)} style={{ fontSize: 12, padding: '4px 6px' }} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <input className="fi" type="number" value={r.purchasePrice || ''} onChange={e => updateRow(i, 'purchasePrice', e.target.value)} style={{ fontSize: 12, padding: '4px 6px', width: 80, textAlign: 'right' }} placeholder="—" />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input className="fi" type="number" value={r.totalAmount || ''} onChange={e => updateRow(i, 'totalAmount', e.target.value)} style={{ fontSize: 12, padding: '4px 6px', width: 90, textAlign: 'right' }} placeholder="—" />
                    </td>
                    <td style={{ textAlign: 'right' }} className="fs-12 text-muted">{parseFloat(r.grams) > 0 ? `${parseFloat(r.grams).toFixed(3)} g` : '—'}</td>
                    <td><button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="modal-foot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={confirmImport} disabled={rows.length === 0 || saving}>
          {saving ? 'Importing…' : `Import ${rows.length || ''} Entr${rows.length === 1 ? 'y' : 'ies'}`}
        </button>
      </div>
    </Modal>
  );
}

function GoldTracker() {
  const [entries, setEntries]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [currentRate, setCurrentRate] = useState(() => localStorage.getItem('fintrack_gold_rate') || '');
  const [rateLoading, setRateLoading] = useState(false);
  const [rateSource, setRateSource]   = useState(localStorage.getItem('fintrack_gold_rate_source') || '');
  const [rateTime, setRateTime]       = useState(localStorage.getItem('fintrack_gold_rate_time') || '');
  const [modal, setModal]             = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [edit, setEdit]               = useState(null);
  const [delId, setDelId]             = useState(null);
  const [form, setForm]               = useState({ purchaseDate: today(), grams: '', purchasePrice: '', description: '', gst: '3', wastage: '', totalAmount: '' });

  useEffect(() => { load(); }, []);

  // ── Persist manual rate change ─────────────────────────
  const handleRateChange = (val) => {
    setCurrentRate(val);
    setRateSource('manual');
    localStorage.setItem('fintrack_gold_rate', val);
    localStorage.setItem('fintrack_gold_rate_source', 'manual');
    localStorage.setItem('fintrack_gold_rate_time', new Date().toLocaleTimeString('en-IN'));
  };

  // ── Fetch live rate from goldapi.io ────────────────────
  const fetchLiveRate = async () => {
    setRateLoading(true);
    try {
      const res = await fetch('https://www.goldapi.io/api/XAU/INR', {
        headers: {
          'x-access-token': GOLD_API_KEY,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // goldapi returns price per troy oz — convert to per gram (1 troy oz = 31.1035 g)
      const pricePerOz  = parseFloat(data.price) || 0;
      const pricePerGram = parseFloat((pricePerOz / 31.1035).toFixed(2));
      if (!pricePerGram || pricePerGram <= 0) throw new Error('Invalid price from API');

      const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      setCurrentRate(String(pricePerGram));
      setRateSource('live');
      setRateTime(timeStr);
      localStorage.setItem('fintrack_gold_rate', String(pricePerGram));
      localStorage.setItem('fintrack_gold_rate_source', 'live');
      localStorage.setItem('fintrack_gold_rate_time', timeStr);
      toast.success(`🥇 Live rate: ₹${pricePerGram.toLocaleString('en-IN')}/g`);
    } catch (e) {
      console.error('Gold API error:', e);
      toast.error(`Live rate failed: ${e.message}. Enter manually.`);
    } finally {
      setRateLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try { setEntries(await goldService.getAll()); }
    catch { toast.error('Failed to load gold entries'); }
    finally { setLoading(false); }
  };

  const save = async () => {
    const hasWeight = form.grams && form.purchasePrice;
    const hasAmountOnly = !hasWeight && parseFloat(form.totalAmount) > 0;
    if (!hasWeight && !hasAmountOnly) { toast.error('Enter weight + price/gram, or at least a total amount'); return; }
    try {
      // If grams wasn't entered but we know price/gram and total amount, derive it
      const priceGram = parseFloat(form.purchasePrice) || 0;
      const totalAmt  = parseFloat(form.totalAmount) || 0;
      const grams     = form.grams ? parseFloat(form.grams) : (priceGram > 0 && totalAmt > 0 ? totalAmt / priceGram : 0);
      const payload = {
        ...form,
        grams,
        purchasePrice: priceGram,
        totalAmount: totalAmt,
        gst: parseFloat(form.gst) || 0,
        wastage: parseFloat(form.wastage) || 0,
      };
      if (edit) {
        await goldService.update(edit.id, payload);
        toast.success('Updated!');
      } else {
        await goldService.create(payload);
        toast.success('Added!');
      }
      setModal(false); setEdit(null);
      setForm({ purchaseDate: today(), grams: '', purchasePrice: '', description: '', gst: '3', wastage: '', totalAmount: '' });
      load();
    } catch { toast.error('Failed to save'); }
  };

  const del = async () => {
    try { await goldService.delete(delId); toast.success('Deleted'); setDelId(null); load(); }
    catch { toast.error('Failed'); }
  };

  // ✅ Fix 2: Safe date parser — handles Firestore Timestamp, string, or Date object
  const safeDate = (val) => {
    if (!val) return new Date();
    if (val?.toDate) return val.toDate();           // Firestore Timestamp
    if (val instanceof Date) return val;            // already a Date
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;     // string fallback
  };

  const curRate        = parseFloat(currentRate) || 0;
  const totalGrams     = entries.reduce((s, e) => s + (parseFloat(e.grams) || 0), 0);

  // Total cost = base + GST (what you actually paid).
  // Entries imported with only a total amount (no known weight) fall back to that amount.
  const totalInvested  = entries.reduce((s, e) => {
    const grams = parseFloat(e.grams) || 0;
    if (grams === 0) return s + (parseFloat(e.totalAmount) || 0);
    const base = grams * (parseFloat(e.purchasePrice) || 0);
    const gst  = base * ((parseFloat(e.gst) || 0) / 100);
    return s + base + gst;
  }, 0);

  // Current value uses net grams after wastage deduction
  const totalCurrentValue = curRate > 0
    ? entries.reduce((s, e) => {
        const netGrams = (parseFloat(e.grams) || 0) * (1 - (parseFloat(e.wastage) || 0) / 100);
        return s + netGrams * curRate;
      }, 0)
    : 0;

  const totalGain = totalCurrentValue - totalInvested;

  return (
    <div className="card mb-4">
      <div className="flex justify-between items-center mb-1">
        <div className="card-title" style={{ marginBottom: 0 }}>🥇 Gold Investment Tracker</div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => setImportModal(true)}>📥 Import CSV/Excel</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm({ purchaseDate: today(), grams: '', purchasePrice: '', description: '', gst: '3', wastage: '', totalAmount: '' }); setModal(true); }}>+ Add</button>
        </div>
      </div>

      {/* Gold Rate Panel */}
      <div style={{ background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, marginTop: 10 }}>
        <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 18 }}>🥇</span>
            <div>
              <div className="fs-12 fw-700" style={{ color: '#fbbf24' }}>Today's Gold Rate (per gram · 24K)</div>
              <div className="fs-11 text-muted">
                {rateSource === 'live'
                  ? `✅ Live rate fetched at ${rateTime}`
                  : rateSource === 'manual'
                    ? `✏️ Manually entered at ${rateTime}`
                    : 'Fetch live rate or enter manually'}
              </div>
            </div>
          </div>
          {/* Live fetch button */}
          <button
            onClick={fetchLiveRate}
            disabled={rateLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1.5px solid rgba(251,191,36,.5)', background: 'rgba(251,191,36,.15)', color: '#fbbf24', fontWeight: 700, fontSize: 12, cursor: rateLoading ? 'not-allowed' : 'pointer', opacity: rateLoading ? 0.7 : 1 }}>
            {rateLoading
              ? <><span className="spin" style={{ width: 12, height: 12, borderWidth: 2, borderColor: '#fbbf24', borderTopColor: 'transparent' }} /> Fetching…</>
              : '🔄 Fetch Live Rate'}
          </button>
        </div>
        {/* Manual input */}
        <div className="flex items-center gap-2">
          <span className="text-muted fs-12 fw-600">₹</span>
          <input
            style={{ background: 'var(--bg3)', border: `1.5px solid ${currentRate ? 'rgba(251,191,36,.4)' : 'var(--border2)'}`, borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontSize: 15, fontWeight: 800, width: 130, outline: 'none' }}
            type="number"
            value={currentRate}
            onChange={e => handleRateChange(e.target.value)}
            placeholder="e.g. 9200"
          />
          <span className="fs-12 text-muted">per gram</span>
          {currentRate && (
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
              = ₹{(parseFloat(currentRate) * 10).toLocaleString('en-IN')} / 10g
            </span>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {entries.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Total Gold',      val: `${totalGrams.toFixed(3)} g`,                                           c: '#fbbf24',       icon: '⚖️' },
            { label: 'Total Invested',  val: fmt(totalInvested),                                                     c: 'var(--blue)',   icon: '💰' },
            { label: 'Current Value',   val: curRate > 0 ? fmt(totalCurrentValue) : '—',                            c: 'var(--green)',  icon: '📈' },
            { label: 'Gain / Loss',     val: curRate > 0 ? `${totalGain >= 0 ? '+' : ''}${fmt(totalGain)}` : '—',   c: totalGain >= 0 ? 'var(--green)' : 'var(--red)', icon: totalGain >= 0 ? '📈' : '📉' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', borderLeft: `3px solid ${s.c}` }}>
              <div className="fs-11 text-muted mb-1">{s.icon} {s.label}</div>
              <div style={{ fontWeight: 800, color: s.c, fontSize: 13 }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading
        ? <div className="spin-center" style={{ height: 60 }}><div className="spin" /></div>
        : entries.length === 0
          ? <div className="empty" style={{ padding: '20px 0' }}><div className="empty-icon">🥇</div><div className="empty-title">No gold entries</div><div className="empty-sub">Add your gold purchases to track their current value</div></div>
          : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Grams</th>
                    <th style={{ textAlign: 'right' }}>Buy Rate/g</th>
                    <th style={{ textAlign: 'right' }}>GST</th>
                    <th style={{ textAlign: 'right' }}>Wastage</th>
                    <th style={{ textAlign: 'right' }}>Total Cost</th>
                    <th style={{ textAlign: 'right' }}>Net Value Today</th>
                    <th style={{ textAlign: 'right' }}>Gain/Loss</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const dateObj      = safeDate(e.purchaseDate);
                    const daysAgo      = differenceInDays(new Date(), dateObj);
                    const grams        = parseFloat(e.grams) || 0;
                    const buyRate      = parseFloat(e.purchasePrice) || 0;
                    const gstPct       = parseFloat(e.gst) || 0;       // e.g. 3 means 3%
                    const wastagePct   = parseFloat(e.wastage) || 0;   // e.g. 8 means 8%

                    const amountOnly   = grams === 0 && (parseFloat(e.totalAmount) || 0) > 0; // imported w/o weight

                    // Total cost = (grams × rate) + GST on base cost — or the recorded
                    // total amount when weight isn't known (e.g. amount-only imports)
                    const baseCost     = grams * buyRate;
                    const gstAmt       = baseCost * (gstPct / 100);
                    const totalCost    = amountOnly ? (parseFloat(e.totalAmount) || 0) : baseCost + gstAmt;

                    // Net sellable grams = grams reduced by wastage%
                    const netGrams     = grams * (1 - wastagePct / 100);
                    const curVal       = (curRate > 0 && !amountOnly) ? netGrams * curRate : null;  // value after wastage
                    const gain         = curVal !== null ? curVal - totalCost : null;

                    return (
                      <tr key={e.id}>
                        <td>
                          <div className="font-mono fs-12 text-muted">{fmtDate(dateObj)}</div>
                          <div className="fs-11 text-muted">{daysAgo >= 0 ? `${daysAgo}d ago` : '—'}</div>
                        </td>
                        <td className="fw-600 fs-13">{e.description || '—'}</td>
                        <td style={{ textAlign: 'right' }} className="fw-700">{amountOnly ? '—' : `${grams.toFixed(3)} g`}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono fs-12">{amountOnly ? '—' : fmt(buyRate)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="fs-12 text-muted">{gstPct > 0 ? `${gstPct}%` : '—'}</span>
                          {gstAmt > 0 && <div className="fs-11 text-muted">+{fmt(gstAmt)}</div>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="fs-12 text-muted">{wastagePct > 0 ? `${wastagePct}%` : '—'}</span>
                          {wastagePct > 0 && <div className="fs-11 text-muted">{netGrams.toFixed(3)} g net</div>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="amt fw-700">{fmt(totalCost)}</span>
                          {gstAmt > 0 && <div className="fs-11 text-muted">incl. GST</div>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {curVal !== null
                            ? <>
                                <span className="amt amt-g fw-700">{fmt(curVal)}</span>
                                {wastagePct > 0 && <div className="fs-11 text-muted">after wastage</div>}
                              </>
                            : <span className="text-muted fs-12">{amountOnly ? 'Weight unknown' : 'Enter rate ↑'}</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {gain !== null
                            ? <span className={`amt fw-700 ${gain >= 0 ? 'amt-g' : 'amt-r'}`}>{gain >= 0 ? '+' : ''}{fmt(gain)}</span>
                            : '—'}
                        </td>
                        <td>
                          <div className="actions">
                            <button className="btn-icon" onClick={() => {
                              setEdit(e);
                              setForm({
                                purchaseDate: fmtDateInput(dateObj),
                                grams: e.grams,
                                purchasePrice: e.purchasePrice,
                                description: e.description || '',
                                gst: e.gst ?? '3',
                                wastage: e.wastage ?? '',
                                totalAmount: e.totalAmount || '',
                              });
                              setModal(true);
                            }}>✏️</button>
                            <button className="btn-icon" onClick={() => setDelId(e.id)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
      }

      {/* Add/Edit Modal */}
      {modal && (
        <Modal title={edit ? '✏️ Edit Gold Entry' : '🥇 Add Gold Purchase'} onClose={() => { setModal(false); setEdit(null); }}>
          <div className="fg">
            <label className="fl">Purchase Date</label>
            <DateStepper name="purchaseDate" value={form.purchaseDate} onChange={e => setForm(p => ({ ...p, purchaseDate: e.target.value }))} />
          </div>
          <div className="frow">
            <div className="fg">
              <label className="fl">Weight (grams)</label>
              <input className="fi" type="number" value={form.grams} onChange={e => setForm(p => ({ ...p, grams: e.target.value }))} step="0.001" min="0" placeholder="e.g. 10.000" />
            </div>
            <div className="fg">
              <label className="fl">Buy Price per gram (₹) <span className="text-muted fw-400 fs-11">optional</span></label>
              <input className="fi" type="number" value={form.purchasePrice} onChange={e => setForm(p => ({ ...p, purchasePrice: e.target.value }))} min="0" placeholder="e.g. 7500" />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Total Amount Paid (₹) <span className="text-muted fw-400 fs-11">optional</span></label>
            <input className="fi" type="number" value={form.totalAmount} onChange={e => setForm(p => ({ ...p, totalAmount: e.target.value }))} min="0" placeholder="e.g. 75000" />
            <div className="fs-11 text-muted mt-1">Leave weight blank and fill this + price/gram to auto-calc grams. Or fill this alone if you only know the amount spent.</div>
          </div>
          <div className="frow">
            <div className="fg">
              <label className="fl">GST % <span className="text-muted fw-400 fs-11">(added to cost)</span></label>
              <input className="fi" type="number" value={form.gst} onChange={e => setForm(p => ({ ...p, gst: e.target.value }))} step="0.1" min="0" max="30" placeholder="e.g. 3" />
              <div className="fs-11 text-muted mt-1">Jewellery: 3% · Gold coin: 3%</div>
            </div>
            <div className="fg">
              <label className="fl">Wastage % <span className="text-muted fw-400 fs-11">(reduces resale value)</span></label>
              <input className="fi" type="number" value={form.wastage} onChange={e => setForm(p => ({ ...p, wastage: e.target.value }))} step="0.1" min="0" max="30" placeholder="e.g. 8" />
              <div className="fs-11 text-muted mt-1">Jewellery: 8–12% · Coin: 0%</div>
            </div>
          </div>

          {/* Live cost breakdown */}
          {form.grams && form.purchasePrice && (() => {
            const grams      = parseFloat(form.grams) || 0;
            const rate       = parseFloat(form.purchasePrice) || 0;
            const gstPct     = parseFloat(form.gst) || 0;
            const wastagePct = parseFloat(form.wastage) || 0;
            const baseCost   = grams * rate;
            const gstAmt     = baseCost * (gstPct / 100);
            const totalCost  = baseCost + gstAmt;
            const netGrams   = grams * (1 - wastagePct / 100);
            const netVal     = curRate > 0 ? netGrams * curRate : null;
            const gain       = netVal !== null ? netVal - totalCost : null;
            return (
              <div style={{ background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                <div className="fw-700 fs-12 mb-2" style={{ color: '#fbbf24' }}>📊 Cost Breakdown</div>
                <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                  <div className="flex justify-between">
                    <span className="text-muted">Base cost ({grams}g × ₹{fmt(rate)})</span>
                    <span className="fw-700">{fmt(baseCost)}</span>
                  </div>
                  {gstPct > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted">+ GST ({gstPct}%)</span>
                      <span className="fw-700" style={{ color: 'var(--orange)' }}>+{fmt(gstAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between" style={{ borderTop: '1px solid rgba(251,191,36,.2)', paddingTop: 6 }}>
                    <span className="fw-700">Total Cost (what you paid)</span>
                    <span className="fw-800" style={{ color: '#fbbf24' }}>{fmt(totalCost)}</span>
                  </div>
                  {wastagePct > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted">Net sellable gold (after {wastagePct}% wastage)</span>
                      <span className="fw-600">{netGrams.toFixed(3)} g</span>
                    </div>
                  )}
                  {netVal !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted">Current resale value</span>
                      <span className="fw-700 amt-g">{fmt(netVal)}</span>
                    </div>
                  )}
                  {gain !== null && (
                    <div className="flex justify-between" style={{ borderTop: '1px solid rgba(251,191,36,.2)', paddingTop: 6 }}>
                      <span className="fw-700">Net Gain / Loss</span>
                      <span className={`fw-800 ${gain >= 0 ? 'amt-g' : 'amt-r'}`}>{gain >= 0 ? '+' : ''}{fmt(gain)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="fg">
            <label className="fl">Description (optional)</label>
            <input className="fi" type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. 22K chain, Coin, Biscuit..." />
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={() => { setModal(false); setEdit(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{edit ? 'Update' : 'Add Gold'}</button>
          </div>
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
      {importModal && (
        <ImportGoldModal
          onClose={() => setImportModal(false)}
          onImported={() => { setImportModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Asset / Liability Row ─────────────────────────────────
function AssetRow({ type, label, icon, value, subItems = [], onValueChange, onSubSave, color }) {
  const [subModal, setSubModal] = useState(false);
  const hasSubItems = subItems.length > 0;
  const [expanded, setExpanded] = useState(false);
  const total = hasSubItems ? subItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0) : parseFloat(value) || 0;

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 20, width: 28, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div className="fs-12 fw-600 text-muted mb-1">{label}</div>
          {hasSubItems ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }} onClick={() => setExpanded(p => !p)}>
              <span className="fw-700 fs-13" style={{ color: color || 'var(--green)', flex: 1 }}>{fmt(total)}</span>
              <span className="fs-11 text-muted">{subItems.length} entries</span>
              <span className="text-muted fs-11">{expanded ? '▲' : '▼'}</span>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', fontSize: 13 }}>Rs</span>
              <input className="fi" type="number" style={{ paddingLeft: 30 }} value={value || ''} onChange={e => onValueChange(e.target.value)} placeholder="0" min="0" />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" style={{ fontSize: 10, padding: '3px 8px', whiteSpace: 'nowrap' }} onClick={() => setSubModal(true)}>
            {hasSubItems ? '✏️ Edit' : '+ Sub-items'}
          </button>
          {total > 0 && !hasSubItems && <span className="amt fs-12" style={{ color: color || 'var(--green)' }}>{fmt(total)}</span>}
        </div>
      </div>

      {/* Sub-items expanded view */}
      {hasSubItems && expanded && (
        <div style={{ marginLeft: 44, marginTop: 6, background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px', borderLeft: `3px solid ${color || 'var(--green)'}` }}>
          {subItems.map((s, i) => (
            <div key={i} className="flex justify-between items-center mb-1 fs-12">
              <span className="text-muted">{s.name}</span>
              <span className="fw-700" style={{ color: color || 'var(--green)' }}>{fmt(s.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
            <span className="fw-700 fs-12">Total</span>
            <span className="fw-800 fs-13" style={{ color: color || 'var(--green)' }}>{fmt(total)}</span>
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
  const [unlocked, setUnlocked] = useState(() => !pinService.getCached('networth'));
  const [assets, setAssets] = useState({});       // key → amount (simple)
  const [assetSubs, setAssetSubs] = useState({});  // key → [{name, amount}]
  const [liabilities, setLiabilities] = useState({});
  const [liabSubs, setLiabSubs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('networth');
  const [syncing, setSyncing] = useState(false);
  const [bankMonth, setBankMonth] = useState(new Date().getMonth() + 1);
  const [bankYear, setBankYear] = useState(new Date().getFullYear());
  const [bankCalc, setBankCalc] = useState(null);

  const ASSET_TYPES = [
    { key: 'cash', label: 'Cash in Hand', icon: '💵' },
    { key: 'bank', label: 'Bank Balance', icon: '🏦' },
    { key: 'gold', label: 'Gold', icon: '🥇' },
    { key: 'stocks', label: 'Stock Market', icon: '📈' },
    { key: 'mutualfunds', label: 'Mutual Funds / SIP', icon: '📊' },
    { key: 'realestate', label: 'Real Estate', icon: '🏠' },
    { key: 'fd', label: 'Fixed Deposits / RD', icon: '🏧' },
    { key: 'ppf', label: 'PPF / Insurance', icon: '🛡️' },
    { key: 'other_asset', label: 'Other Assets', icon: '💼' },
  ];

  const LIABILITY_TYPES = [
    { key: 'personal_loan', label: 'Personal Loan', icon: '💳' },
    { key: 'home_loan', label: 'Home Loan', icon: '🏠' },
    { key: 'vehicle_loan', label: 'Vehicle Loan', icon: '🚗' },
    { key: 'credit_card', label: 'Credit Card Dues', icon: '💳' },
    { key: 'gold_loan', label: 'Gold Loan', icon: '🥇' },
    { key: 'chittu', label: 'Chittu / Chit Fund', icon: '📋' },
    { key: 'other_liability', label: 'Other Liabilities', icon: '📄' },
  ];

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const d = await netWorthService.get();
      setAssets(d.assets || {});
      setAssetSubs(d.assetSubs || {});
      setLiabilities(d.liabilities || {});
      setLiabSubs(d.liabSubs || {});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // ─── Sync Portfolio → Stocks asset ─────────────────────
  const syncPortfolio = async () => {
    setSyncing(true);
    try {
      const investments = await investmentService.getAll();
      if (investments.length === 0) { toast.error('No stocks in portfolio!'); return; }
      // Combine by symbol
      const symMap = {};
      investments.forEach(i => {
        const sym = i.symbol || i.stockName;
        if (!symMap[sym]) symMap[sym] = { name: i.stockName, symbol: sym, value: 0, qty: 0 };
        symMap[sym].value += i.currentValue;
        symMap[sym].qty += i.quantity;
      });
      const totalValue = Object.values(symMap).reduce((s, v) => s + v.value, 0);
      const subItems = Object.values(symMap)
        .sort((a, b) => b.value - a.value)
        .map(v => ({ name: `${v.symbol} (${v.qty} qty)`, amount: v.value }));
      setAssets(p => ({ ...p, stocks: totalValue }));
      setAssetSubs(p => ({ ...p, stocks: subItems }));
      toast.success(`Synced ${Object.keys(symMap).length} symbols — ${fmt(totalValue)}`);
    } catch { toast.error('Sync failed'); }
    finally { setSyncing(false); }
  };

  // ─── Sync Loans → Liabilities ───────────────────────────
  const syncLoans = async () => {
    setSyncing(true);
    try {
      const loans = await loanService.getAll();
      const payments = await loanPaymentService.getAll ? [] : [];
      if (loans.length === 0) { toast.error('No loans found!'); return; }
      // Group by loanType
      const typeMap = {};
      for (const l of loans) {
        const key = l.loanType || 'other_liability';
        if (!typeMap[key]) typeMap[key] = { total: 0, items: [] };
        // outstanding = amount - payments
        const pays = await loanPaymentService.getAll(l.id);
        const paid = pays.reduce((s, p) => s + p.amount, 0);
        const outstanding = Math.max(0, l.amount - paid);
        if (outstanding > 0) {
          typeMap[key].total += outstanding;
          typeMap[key].items.push({ name: l.name, amount: outstanding });
        }
      }
      let synced = 0;
      const newLiab = { ...liabilities };
      const newLiabSubs = { ...liabSubs };
      Object.entries(typeMap).forEach(([key, data]) => {
        const liabKey = LIABILITY_TYPES.find(t => t.key === key)?.key || 'other_liability';
        newLiab[liabKey] = data.total;
        newLiabSubs[liabKey] = data.items;
        synced += data.items.length;
      });
      setLiabilities(newLiab);
      setLiabSubs(newLiabSubs);
      toast.success(`Synced ${synced} loans into Liabilities!`);
    } catch (e) { console.error(e); toast.error('Sync failed'); }
    finally { setSyncing(false); }
  };

  // ─── Calculate Bank Balance from Income/Expense ─────────
  const calcBankBalance = async () => {
    setSyncing(true);
    try {
      const [incomeAll, expensesAll] = await Promise.all([
        incomeService.getAll({ month: bankMonth, year: bankYear }),
        expenseService.getAll({ month: bankMonth, year: bankYear }),
      ]);
      const totalIncome = incomeAll.reduce((s, i) => s + +i.amount, 0);
      const totalExpense = expensesAll.reduce((s, i) => s + +i.amount, 0);
      const balance = totalIncome - totalExpense;
      setBankCalc({ income: totalIncome, expense: totalExpense, balance, month: bankMonth, year: bankYear });
      toast.success('Bank balance calculated!');
    } catch { toast.error('Failed'); }
    finally { setSyncing(false); }
  };

  const applyBankBalance = () => {
    if (!bankCalc) return;
    setAssets(p => ({ ...p, bank: bankCalc.balance }));
    setAssetSubs(p => {
      const n = { ...p }; delete n.bank; return n;
    });
    toast.success('Bank balance applied!');
  };

  const save = async () => {
    setSaving(true);
    try {
      await netWorthService.save({ assets, assetSubs, liabilities, liabSubs });
      toast.success('Net worth saved!');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  // Helper: get value for a type (sub-items total OR simple value)
  const getVal = (map, subMap, key) => {
    const subs = subMap[key];
    if (subs && subs.length > 0) return subs.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    return parseFloat(map[key]) || 0;
  };

  const totalAssets = ASSET_TYPES.reduce((s, t) => s + getVal(assets, assetSubs, t.key), 0);
  const totalLiabilities = LIABILITY_TYPES.reduce((s, t) => s + getVal(liabilities, liabSubs, t.key), 0);
  const netWorth = totalAssets - totalLiabilities;

  // ─── Snapshots (localStorage) ──────────────────────────
  const SNAPSHOT_KEY = 'fintrack_nw_snapshots';
  const [snapshots, setSnapshots] = useState(() => { try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]'); } catch { return []; } });

  const takeSnapshot = () => {
    const snap = { id: Date.now(), date: new Date().toISOString(), label: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), totalAssets, totalLiabilities, netWorth };
    const updated = [snap, ...snapshots].slice(0, 24);
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(updated));
    setSnapshots(updated);
    toast.success(`📸 Snapshot saved — ${fmt(netWorth)}`);
  };

  const deleteSnapshot = (id) => {
    const updated = snapshots.filter(s => s.id !== id);
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(updated));
    setSnapshots(updated);
  };

  if (!unlocked) return <LockedScreen page="networth" onUnlock={() => setUnlocked(true)} />;
  if (loading) return <div className="spin-center"><div className="spin spin-lg" /></div>;

  return (
    <div>
      <div className="page-head">
        <div><div className="page-title">🏛️ Assets &amp; Liabilities</div><div className="page-sub">Track your complete financial position</div></div>
        <div className="flex gap-2">
          {activeTab === 'networth' && <button className="btn btn-secondary" onClick={() => setActiveTab('trend')}>📈 {snapshots.length > 0 ? `${snapshots.length} Snapshots` : 'View Trends'}</button>}
          {activeTab === 'networth' && <button className="btn btn-secondary" onClick={takeSnapshot}>📸 Snap</button>}
          {activeTab === 'networth' && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spin" /> : null} 💾 Save</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--border)', overflowX: 'auto', display: 'flex', gap: 2, marginBottom: 16 }}>
        {[{ key: 'networth', label: '💎 Net Worth' }, { key: 'trend', label: '📈 Trend & Milestones' }, { key: 'allocation', label: '📊 Allocation' }, { key: 'property', label: '🏠 Investments' }, { key: 'gold', label: '🥇 Gold Tracker' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', background: activeTab === t.key ? 'var(--bg3)' : 'transparent', color: activeTab === t.key ? 'var(--text)' : 'var(--t3)', borderBottom: activeTab === t.key ? '2px solid var(--blue)' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'networth' && (
        <>
          {/* Summary Stats */}
          <div className="stats mb-4">
            <div className="stat" style={{ '--c': 'var(--green)' }}><div className="stat-icon">📈</div><div className="stat-val" style={{ color: 'var(--green)' }}>{fmt(totalAssets)}</div><div className="stat-label">Total Assets</div></div>
            <div className="stat" style={{ '--c': 'var(--red)' }}><div className="stat-icon">📉</div><div className="stat-val" style={{ color: 'var(--red)' }}>{fmt(totalLiabilities)}</div><div className="stat-label">Total Liabilities</div></div>
            <div className="stat" style={{ '--c': netWorth >= 0 ? 'var(--green)' : 'var(--red)' }}><div className="stat-icon">💎</div><div className="stat-val" style={{ color: netWorth >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(netWorth)}</div><div className="stat-label">Net Worth</div></div>
          </div>

          {/* Sync helpers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12, marginBottom: 16 }}>
            {/* Portfolio Sync */}
            <div style={{ background: 'rgba(77,158,255,.06)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 12, padding: 14 }}>
              <div className="flex items-center gap-2 mb-1"><span>📈</span><span className="fw-700 fs-13">Sync Portfolio → Stocks</span></div>
              <div className="text-muted fs-12 mb-2">Combines all trades by symbol, fills Stock Market value</div>
              <button className="btn btn-primary btn-sm" onClick={syncPortfolio} disabled={syncing}>{syncing ? <span className="spin" /> : '🔄'} Sync Now</button>
              {assetSubs.stocks?.length > 0 && <div className="fs-11 text-muted mt-2">✅ {assetSubs.stocks.length} symbols → {fmt(getVal(assets, assetSubs, 'stocks'))}</div>}
            </div>

            {/* Loans Sync */}
            <div style={{ background: 'rgba(244,63,94,.06)', border: '1px solid rgba(244,63,94,.2)', borderRadius: 12, padding: 14 }}>
              <div className="flex items-center gap-2 mb-1"><span>💳</span><span className="fw-700 fs-13">Sync Loans → Liabilities</span></div>
              <div className="text-muted fs-12 mb-2">Auto-fills outstanding loan balances into Liabilities</div>
              <button className="btn btn-primary btn-sm" style={{ background: 'var(--red)' }} onClick={syncLoans} disabled={syncing}>{syncing ? <span className="spin" /> : '🔄'} Sync Loans</button>
              {Object.values(liabSubs).flat().length > 0 && <div className="fs-11 text-muted mt-2">✅ {Object.values(liabSubs).flat().length} loans → {fmt(totalLiabilities)}</div>}
            </div>

            {/* Bank Balance Calc */}
            <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 12, padding: 14 }}>
              <div className="flex items-center gap-2 mb-1"><span>🏦</span><span className="fw-700 fs-13">Calculate Bank Balance</span></div>
              <div className="text-muted fs-12 mb-2">Income − Expenses for selected month</div>
              <div className="flex gap-2 mb-2">
                <select className="fs btn-sm" value={bankMonth} onChange={e => setBankMonth(+e.target.value)} style={{ flex: 1 }}>
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
                <select className="fs btn-sm" value={bankYear} onChange={e => setBankYear(+e.target.value)} style={{ flex: 1 }}>
                  {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" onClick={calcBankBalance} disabled={syncing}>{syncing ? <span className="spin" /> : '🧮'} Calc</button>
              </div>
              {bankCalc && (
                <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                  <div className="flex justify-between mb-1"><span className="text-muted">Income</span><span className="amt-g fw-700">{fmt(bankCalc.income)}</span></div>
                  <div className="flex justify-between mb-1"><span className="text-muted">Expenses</span><span className="amt-r fw-700">{fmt(bankCalc.expense)}</span></div>
                  <div className="flex justify-between mb-2"><span className="fw-700">Balance</span><span className={`fw-800 ${bankCalc.balance >= 0 ? 'amt-g' : 'amt-r'}`}>{fmt(bankCalc.balance)}</span></div>
                  <button className="btn btn-secondary btn-sm w-full" style={{ justifyContent: 'center' }} onClick={applyBankBalance}>✅ Apply as Bank Balance</button>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Assets */}
            <div className="card">
              <div className="card-title">✅ Assets</div>
              {ASSET_TYPES.map(t => (
                <AssetRow key={t.key} type={t.key} label={t.label} icon={t.icon} color="var(--green)"
                  value={assets[t.key]}
                  subItems={assetSubs[t.key] || []}
                  onValueChange={val => setAssets(p => ({ ...p, [t.key]: val }))}
                  onSubSave={(items, total) => { setAssetSubs(p => ({ ...p, [t.key]: items })); setAssets(p => ({ ...p, [t.key]: total })); }}
                />
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }} className="flex justify-between"><span className="fw-800">Total Assets</span><span className="amt amt-g fw-800">{fmt(totalAssets)}</span></div>
            </div>

            {/* Liabilities */}
            <div className="card">
              <div className="card-title">❌ Liabilities</div>
              {LIABILITY_TYPES.map(t => (
                <AssetRow key={t.key} type={t.key} label={t.label} icon={t.icon} color="var(--red)"
                  value={liabilities[t.key]}
                  subItems={liabSubs[t.key] || []}
                  onValueChange={val => setLiabilities(p => ({ ...p, [t.key]: val }))}
                  onSubSave={(items, total) => { setLiabSubs(p => ({ ...p, [t.key]: items })); setLiabilities(p => ({ ...p, [t.key]: total })); }}
                />
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }} className="flex justify-between"><span className="fw-800">Total Liabilities</span><span className="amt amt-r fw-800">{fmt(totalLiabilities)}</span></div>
            </div>
          </div>

          {/* Net Worth Banner */}
          <div className="card" style={{ marginTop: 16, background: netWorth >= 0 ? 'rgba(34,197,94,.06)' : 'rgba(244,63,94,.06)', borderColor: netWorth >= 0 ? 'rgba(34,197,94,.3)' : 'rgba(244,63,94,.3)' }}>
            <div className="flex justify-between items-center">
              <div><div style={{ fontSize: 18, fontWeight: 900 }}>💎 Net Worth</div><div className="text-muted fs-12 mt-1">Total Assets − Total Liabilities</div></div>
              <div className="flex items-center gap-3">
                <div style={{ fontSize: 28, fontWeight: 900, color: netWorth >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(netWorth)}</div>
                <button className="btn btn-secondary btn-sm" onClick={takeSnapshot} title="Save a snapshot of today's net worth">📸 Snap</button>
              </div>
            </div>
          </div>

        </>
      )}

      {activeTab === 'trend' && (() => {
        const sorted = [...snapshots].reverse(); // oldest → newest
        const chartData = sorted.map(s => ({
          name: s.label,
          netWorth: Math.round(s.netWorth),
          assets: Math.round(s.totalAssets),
          liabilities: Math.round(s.totalLiabilities),
        }));

        // Milestone badges
        const MILESTONES = [
          { label: '₹1 Lakh',    val: 100000,    icon: '🌱' },
          { label: '₹5 Lakh',    val: 500000,    icon: '🌿' },
          { label: '₹10 Lakh',   val: 1000000,   icon: '🌳' },
          { label: '₹25 Lakh',   val: 2500000,   icon: '🏅' },
          { label: '₹50 Lakh',   val: 5000000,   icon: '🥈' },
          { label: '₹1 Crore',   val: 10000000,  icon: '🥇' },
          { label: '₹2 Crore',   val: 20000000,  icon: '💎' },
          { label: '₹5 Crore',   val: 50000000,  icon: '👑' },
        ];
        const achieved = MILESTONES.filter(m => netWorth >= m.val);
        const next = MILESTONES.find(m => netWorth < m.val);
        const nextPct = next ? Math.min(100, (netWorth / next.val) * 100) : 100;

        // Growth stats from snapshots
        const newest = snapshots[0];
        const oldest = snapshots[snapshots.length - 1];
        const growth = newest && oldest && oldest.netWorth !== 0
          ? ((newest.netWorth - oldest.netWorth) / Math.abs(oldest.netWorth)) * 100
          : null;
        const totalGrowthAmt = newest && oldest ? newest.netWorth - oldest.netWorth : null;

        return (
          <div>
            {/* Next milestone card */}
            <div className="card mb-4" style={{ background: 'linear-gradient(135deg,rgba(77,158,255,.08),rgba(167,139,250,.06))', borderColor: 'rgba(77,158,255,.2)' }}>
              <div className="flex items-center justify-between mb-3" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div className="fw-900 fs-16">🏆 Next Milestone</div>
                  <div className="text-muted fs-12 mt-1">{next ? `${next.icon} ${next.label}` : '👑 All milestones achieved!'}</div>
                </div>
                {next && (
                  <div style={{ textAlign: 'right' }}>
                    <div className="fw-900 fs-20" style={{ color: 'var(--blue)' }}>{nextPct.toFixed(1)}%</div>
                    <div className="text-muted fs-12">₹{(next.val - netWorth).toLocaleString('en-IN')} to go</div>
                  </div>
                )}
              </div>
              {next && (
                <div style={{ background: 'var(--bg3)', borderRadius: 99, height: 12, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${nextPct}%`, background: 'linear-gradient(90deg,var(--blue),var(--purple,#a78bfa))', borderRadius: 99, transition: 'width .6s' }} />
                </div>
              )}
            </div>

            {/* Achieved milestones */}
            {achieved.length > 0 && (
              <div className="card mb-4">
                <div className="card-title">🎖️ Achieved Milestones</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {achieved.map(m => (
                    <div key={m.val} style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 12, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 22 }}>{m.icon}</span>
                      <div>
                        <div className="fw-800 fs-13" style={{ color: 'var(--green)' }}>{m.label}</div>
                        <div className="fs-11 text-muted">✅ Achieved</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Growth stats */}
            {snapshots.length >= 2 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Current Net Worth', val: fmt(netWorth), c: netWorth >= 0 ? 'var(--green)' : 'var(--red)', icon: '💎' },
                  { label: 'Total Growth', val: totalGrowthAmt !== null ? `${totalGrowthAmt >= 0 ? '+' : ''}${fmt(totalGrowthAmt)}` : '—', c: totalGrowthAmt >= 0 ? 'var(--green)' : 'var(--red)', icon: '📈' },
                  { label: 'Growth %', val: growth !== null ? `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%` : '—', c: growth >= 0 ? 'var(--green)' : 'var(--red)', icon: '📊' },
                  { label: 'Snapshots', val: snapshots.length, c: 'var(--blue)', icon: '📸' },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', borderLeft: `3px solid ${s.c}` }}>
                    <div className="fs-11 text-muted">{s.icon} {s.label}</div>
                    <div className="fw-800 fs-15 mt-1" style={{ color: s.c }}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Trend chart */}
            <div className="card mb-4">
              <div className="flex justify-between items-center mb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>📈 Net Worth Trend</div>
                <button className="btn btn-secondary btn-sm" onClick={takeSnapshot}>📸 Take Snapshot</button>
              </div>
              {chartData.length < 2
                ? (
                  <div className="empty" style={{ padding: '32px 0' }}>
                    <div className="empty-icon">📈</div>
                    <div className="empty-title">Need 2+ snapshots to show trend</div>
                    <div className="empty-sub">Take snapshots regularly to track your net worth journey</div>
                    <button className="btn btn-primary btn-sm mt-3" onClick={takeSnapshot}>📸 Take First Snapshot</button>
                  </div>
                )
                : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--green)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="var(--green)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="assetsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4d9eff" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#4d9eff" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border2)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--t3)' }} />
                      <YAxis tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 10, fill: 'var(--t3)' }} width={52} />
                      <Tooltip
                        formatter={(v, name) => [`₹${v.toLocaleString('en-IN')}`, name === 'netWorth' ? 'Net Worth' : name === 'assets' ? 'Assets' : 'Liabilities']}
                        contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="assets" stroke="#4d9eff" strokeWidth={1.5} fill="url(#assetsGrad)" dot={false} />
                      <Area type="monotone" dataKey="netWorth" stroke="var(--green)" strokeWidth={2.5} fill="url(#nwGrad)" dot={{ fill: 'var(--green)', r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )
              }
            </div>

            {/* Snapshot history table */}
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="fw-700 fs-13">📸 Snapshot History <span className="text-muted fw-400 fs-12">({snapshots.length}/24)</span></div>
                <button className="btn btn-secondary btn-sm" onClick={takeSnapshot}>+ Snap Now</button>
              </div>
              {snapshots.length === 0
                ? <div className="text-muted fs-13" style={{ textAlign: 'center', padding: 24 }}>No snapshots yet — click "Snap" to save today's values</div>
                : (
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
                            {change !== null
                              ? <span className={`fw-700 fs-12 ${change >= 0 ? 'amt-g' : 'amt-r'}`}>{change >= 0 ? '+' : ''}{fmt(change)}</span>
                              : <span className="text-muted fs-12">First</span>}
                          </td>
                          <td><button className="btn-icon" onClick={() => deleteSnapshot(s.id)}>🗑️</button></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                )}
            </div>
          </div>
        );
      })()}

      {activeTab === 'allocation' && (() => {
        // Asset allocation data
        const ASSET_COLORS = {
          cash:        { color: '#38bdf8', label: 'Cash',           group: 'liquid' },
          bank:        { color: '#0ea5e9', label: 'Bank',           group: 'liquid' },
          gold:        { color: '#fbbf24', label: 'Gold',           group: 'commodity' },
          stocks:      { color: '#22c55e', label: 'Stocks',         group: 'equity' },
          mutualfunds: { color: '#4ade80', label: 'Mutual Funds',   group: 'equity' },
          realestate:  { color: '#f97316', label: 'Real Estate',    group: 'realestate' },
          fd:          { color: '#a78bfa', label: 'FD / RD',        group: 'debt' },
          ppf:         { color: '#818cf8', label: 'PPF / Insurance',group: 'debt' },
          other_asset: { color: '#94a3b8', label: 'Others',         group: 'other' },
        };

        const GROUPS = [
          { key: 'equity',     label: 'Equity',      icon: '📈', color: '#22c55e', ideal: '60%', keys: ['stocks','mutualfunds'] },
          { key: 'debt',       label: 'Debt',         icon: '🏧', color: '#818cf8', ideal: '20%', keys: ['fd','ppf'] },
          { key: 'liquid',     label: 'Liquid',       icon: '💧', color: '#38bdf8', ideal: '10%', keys: ['cash','bank'] },
          { key: 'commodity',  label: 'Gold',         icon: '🥇', color: '#fbbf24', ideal: '5%',  keys: ['gold'] },
          { key: 'realestate', label: 'Real Estate',  icon: '🏠', color: '#f97316', ideal: '5%',  keys: ['realestate'] },
          { key: 'other',      label: 'Others',       icon: '💼', color: '#94a3b8', ideal: '0%',  keys: ['other_asset'] },
        ];

        // Build pie data from all non-zero assets
        const pieData = ASSET_TYPES
          .map(t => ({ key: t.key, label: ASSET_COLORS[t.key]?.label || t.label, value: getVal(assets, assetSubs, t.key), color: ASSET_COLORS[t.key]?.color || '#94a3b8' }))
          .filter(d => d.value > 0);

        // Group totals
        const groupData = GROUPS.map(g => {
          const total = g.keys.reduce((s, k) => s + getVal(assets, assetSubs, k), 0);
          const pct = totalAssets > 0 ? (total / totalAssets) * 100 : 0;
          return { ...g, total, pct };
        }).filter(g => g.total > 0 || g.keys.some(k => ASSET_TYPES.find(a => a.key === k)));

        // Liability breakdown
        const liabData = LIABILITY_TYPES
          .map(t => ({ key: t.key, label: t.label, icon: t.icon, value: getVal(liabilities, liabSubs, t.key) }))
          .filter(d => d.value > 0);

        // Financial Health Scores
        const equityPct = (getVal(assets, assetSubs, 'stocks') + getVal(assets, assetSubs, 'mutualfunds')) / totalAssets * 100 || 0;
        const liquidAmt = getVal(assets, assetSubs, 'cash') + getVal(assets, assetSubs, 'bank');
        const debtToAsset = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
        const savingsRatio = netWorth > 0 ? Math.min(100, (netWorth / totalAssets) * 100) : 0;

        const healthScores = [
          {
            label: 'Diversification',
            icon: '🎯',
            score: Math.min(100, pieData.length * 15),
            desc: `${pieData.length} asset types`,
            tip: 'Ideal: 5+ different asset classes',
            color: pieData.length >= 5 ? 'var(--green)' : pieData.length >= 3 ? 'var(--orange)' : 'var(--red)',
          },
          {
            label: 'Equity Exposure',
            icon: '📈',
            score: Math.min(100, equityPct),
            desc: `${equityPct.toFixed(1)}% of assets`,
            tip: 'Ideal: 40-70% in equity for long term',
            color: equityPct >= 40 && equityPct <= 70 ? 'var(--green)' : equityPct > 0 ? 'var(--orange)' : 'var(--red)',
          },
          {
            label: 'Debt Ratio',
            icon: '💳',
            score: Math.max(0, 100 - debtToAsset),
            desc: `${debtToAsset.toFixed(1)}% debt / assets`,
            tip: 'Ideal: Debt below 40% of total assets',
            color: debtToAsset < 30 ? 'var(--green)' : debtToAsset < 50 ? 'var(--orange)' : 'var(--red)',
          },
          {
            label: 'Net Worth Ratio',
            icon: '💎',
            score: Math.min(100, savingsRatio),
            desc: `${savingsRatio.toFixed(1)}% of assets`,
            tip: 'Ideal: Net Worth > 50% of total assets',
            color: savingsRatio >= 50 ? 'var(--green)' : savingsRatio >= 25 ? 'var(--orange)' : 'var(--red)',
          },
        ];

        return (
          <div>
            {/* Top stats */}
            <div className="stats mb-4">
              {[
                { icon: '📈', label: 'Total Assets', val: fmt(totalAssets), c: 'var(--green)' },
                { icon: '📉', label: 'Total Liabilities', val: fmt(totalLiabilities), c: 'var(--red)' },
                { icon: '💎', label: 'Net Worth', val: fmt(netWorth), c: netWorth >= 0 ? 'var(--blue)' : 'var(--red)' },
                { icon: '📊', label: 'Asset Types', val: pieData.length, c: 'var(--purple)' },
              ].map((s, i) => (
                <div key={i} className="stat" style={{ '--c': s.c }}><div className="stat-icon">{s.icon}</div><div className="stat-val" style={{ color: s.c }}>{s.val}</div><div className="stat-label">{s.label}</div></div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
              {/* Donut chart */}
              <div className="card">
                <div className="card-title">🥧 Asset Allocation</div>
                {pieData.length === 0
                  ? <div className="empty"><div className="empty-icon">📊</div><div className="empty-title">No assets added yet</div></div>
                  : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                      <ResponsiveContainer width={180} height={180}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} dataKey="value" paddingAngle={2}>
                            {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Centre label */}
                      <div style={{ flex: 1, minWidth: 150 }}>
                        {pieData.sort((a, b) => b.value - a.value).map((d, i) => (
                          <div key={d.key} className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                              <span className="fs-12 text-muted">{d.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="fs-12 fw-700">{totalAssets > 0 ? ((d.value / totalAssets) * 100).toFixed(1) : 0}%</span>
                              <span className="fs-11 text-muted" style={{ minWidth: 70, textAlign: 'right' }}>{fmt(d.value)}</span>
                            </div>
                          </div>
                        ))}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }} className="flex justify-between">
                          <span className="fw-700 fs-12">Total</span>
                          <span className="fw-800 fs-13 amt-g">{fmt(totalAssets)}</span>
                        </div>
                      </div>
                    </div>
                  )}
              </div>

              {/* Asset group bars */}
              <div className="card">
                <div className="card-title">📊 Asset Classes</div>
                {groupData.length === 0
                  ? <div className="empty"><div className="empty-icon">📊</div><div className="empty-title">No data</div></div>
                  : groupData.sort((a, b) => b.total - a.total).map((g, i) => (
                    <div key={g.key} style={{ marginBottom: 14 }}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 16 }}>{g.icon}</span>
                          <span className="fw-700 fs-13">{g.label}</span>
                          <span style={{ fontSize: 10, background: g.color + '20', color: g.color, padding: '1px 6px', borderRadius: 20, fontWeight: 700 }}>Ideal {g.ideal}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="fw-800 fs-13" style={{ color: g.color }}>{g.pct.toFixed(1)}%</span>
                          <span className="text-muted fs-12">{fmt(g.total)}</span>
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg3)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, g.pct)}%`, background: g.color, borderRadius: 6, transition: 'width .5s' }} />
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Health Scores */}
            <div className="card mb-4">
              <div className="card-title">🏥 Financial Health Scores</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {healthScores.map((h, i) => (
                  <div key={i} style={{ background: 'var(--bg3)', borderRadius: 12, padding: '12px 14px', borderLeft: `4px solid ${h.color}` }}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 18 }}>{h.icon}</span>
                          <span className="fw-700 fs-13">{h.label}</span>
                        </div>
                        <div className="fs-11 text-muted mt-1">{h.desc}</div>
                      </div>
                      <span style={{ fontSize: 22, fontWeight: 900, color: h.color }}>{Math.round(h.score)}</span>
                    </div>
                    {/* Score bar */}
                    <div style={{ background: 'var(--bg2)', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${h.score}%`, background: h.color, borderRadius: 4, transition: 'width .6s' }} />
                    </div>
                    <div className="fs-11 text-muted">{h.tip}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Liabilities breakdown */}
            {liabData.length > 0 && (
              <div className="card mb-4">
                <div className="card-title">💳 Liabilities Breakdown</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  {liabData.map((l, i) => (
                    <div key={l.key} style={{ background: 'rgba(244,63,94,.06)', border: '1px solid rgba(244,63,94,.15)', borderRadius: 10, padding: '10px 14px' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span style={{ fontSize: 16 }}>{l.icon}</span>
                        <span className="fw-600 fs-13">{l.label}</span>
                      </div>
                      <div className="fw-800 fs-14 amt-r">{fmt(l.value)}</div>
                      <div className="fs-11 text-muted mt-1">{totalLiabilities > 0 ? ((l.value / totalLiabilities) * 100).toFixed(1) : 0}% of liabilities</div>
                      <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 4, overflow: 'hidden', marginTop: 6 }}>
                        <div style={{ height: '100%', width: `${totalLiabilities > 0 ? (l.value / totalLiabilities) * 100 : 0}%`, background: 'var(--red)', borderRadius: 4 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(244,63,94,.04)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span className="fw-700">Total Liabilities</span>
                  <span className="fw-800 amt-r fs-14">{fmt(totalLiabilities)}</span>
                </div>
              </div>
            )}

            {/* Net Worth summary banner */}
            <div className="card" style={{ background: netWorth >= 0 ? 'rgba(34,197,94,.06)' : 'rgba(244,63,94,.06)', borderColor: netWorth >= 0 ? 'rgba(34,197,94,.3)' : 'rgba(244,63,94,.3)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Total Assets', val: fmt(totalAssets), c: 'var(--green)' },
                  { label: '− Liabilities', val: fmt(totalLiabilities), c: 'var(--red)' },
                  { label: '= Net Worth', val: fmt(netWorth), c: netWorth >= 0 ? 'var(--green)' : 'var(--red)', big: true },
                  { label: 'Debt/Asset Ratio', val: `${debtToAsset.toFixed(1)}%`, c: debtToAsset < 30 ? 'var(--green)' : 'var(--red)' },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div className="text-muted fs-12">{s.label}</div>
                    <div style={{ fontWeight: 900, fontSize: s.big ? 24 : 16, color: s.c, marginTop: 2 }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {activeTab === 'property' && <PropertyCalc />}
      {activeTab === 'gold' && <GoldTracker />}
    </div>
  );
}