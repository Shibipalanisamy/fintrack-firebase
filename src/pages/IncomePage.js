import { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../utils/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { incomeService, categoryService } from '../utils/dbService';
import { fmt, fmtDate, fmtDateInput, today, exportCSV, importCSV } from '../utils/helpers';
import { Modal, ConfirmDelete, DateStepper, DateRangeFilter } from '../components/UI';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

// ─── Isolated collection helpers (never touch incomeService / dashboard) ────
const isolatedService = (collectionName) => ({
  getAll: async () => {
    const uid = auth.currentUser?.uid; if (!uid) return [];
    const snap = await getDocs(query(collection(db, collectionName), where('userId', '==', uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.date?.localeCompare?.(a.date) || 0);
  },
  create: async (data) => {
    const uid = auth.currentUser?.uid; if (!uid) throw new Error('Not authenticated');
    return addDoc(collection(db, collectionName), { ...data, userId: uid, createdAt: serverTimestamp() });
  },
  update: async (id, data) => updateDoc(doc(db, collectionName, id), { ...data, updatedAt: serverTimestamp() }),
  delete: async (id) => deleteDoc(doc(db, collectionName, id)),
});

const salaryService   = isolatedService('salaryrecords');
const freelanceService = isolatedService('freelancerecords');

// ─── Shared simple form for Salary / Freelance ──────────────────────────────
function SimpleForm({ item, banks, onSave, onClose, type }) {
  const [f, setF] = useState({
    date: today(), amount: '', notes: '', bankAccount: '', clientName: '',
    ...(item ? { ...item, date: fmtDateInput(item.date) } : {}),
  });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async e => {
    e.preventDefault(); setLoading(true);
    try { await onSave({ ...f, amount: parseFloat(f.amount) }); }
    finally { setLoading(false); }
  };
  return (
    <form onSubmit={submit}>
      <div className="frow">
        <div className="fg"><label className="fl">Date</label><DateStepper name="date" value={f.date} onChange={ch} required max={today()} /></div>
        <div className="fg"><label className="fl">Amount (₹)</label><input className="fi" type="number" name="amount" value={f.amount} onChange={ch} placeholder="0.00" step="0.01" min="0" required /></div>
      </div>
      {type === 'freelance' && (
        <div className="fg"><label className="fl">Client / Project</label><input className="fi" name="clientName" value={f.clientName} onChange={ch} placeholder="e.g. Acme Corp — Logo Design" /></div>
      )}
      <div className="fg">
        <label className="fl">Bank Account <span style={{ color: 'var(--t3)', fontWeight: 400, fontSize: 11 }}>(credited to)</span></label>
        {banks.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4 }}>
            {banks.map(b => (
              <button key={b.id} type="button"
                onClick={() => setF(p => ({ ...p, bankAccount: f.bankAccount === b.name ? '' : b.name }))}
                style={{ padding: '7px 6px', borderRadius: 8, border: `2px solid ${f.bankAccount === b.name ? 'var(--blue)' : 'var(--border2)'}`, background: f.bankAccount === b.name ? 'rgba(77,158,255,.12)' : 'var(--bg3)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: f.bankAccount === b.name ? 'var(--blue)' : 'var(--t3)', textAlign: 'center', lineHeight: 1.4, transition: 'all .15s' }}>
                <span style={{ fontSize: 13 }}>{b.icon || '🏦'}</span><br />{b.shortName || b.name}
              </button>
            ))}
          </div>
        ) : (
          <input className="fi" name="bankAccount" value={f.bankAccount} onChange={ch} placeholder="e.g. ICICI Bank" />
        )}
        {f.bankAccount
          ? <div style={{ marginTop: 5, fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>✅ Credited to <strong>{f.bankAccount}</strong></div>
          : <div style={{ marginTop: 5, fontSize: 11, color: 'var(--t3)' }}>ℹ️ Select a bank account</div>}
      </div>
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" name="notes" value={f.notes} onChange={ch} rows={2} /></div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <span className="spin" /> : null}{item ? 'Update' : `Add ${type === 'salary' ? 'Salary' : 'Freelance'}`}
        </button>
      </div>
    </form>
  );
}

// ─── Reusable isolated tab (Salary or Freelance) ────────────────────────────
function IsolatedTab({ type, banks }) {
  const svc        = type === 'salary' ? salaryService : freelanceService;
  const icon       = type === 'salary' ? '🧾' : '💼';
  const accentCol  = type === 'salary' ? 'var(--blue)' : '#8b5cf6';
  const label      = type === 'salary' ? 'Salary' : 'Freelance';

  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [edit, setEdit]         = useState(null);
  const [delId, setDelId]       = useState(null);
  const [search, setSearch]     = useState('');
  const [monthFilter, setMonthFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [showChart, setShowChart] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await svc.getAll()); }
    catch { toast.error(`Failed to load ${label} records`); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async data => {
    try {
      if (edit) { await svc.update(edit.id, data); toast.success('Updated!'); }
      else       { await svc.create(data);          toast.success(`${label} added!`); }
      setModal(false); setEdit(null); load();
    } catch { toast.error('Failed to save'); }
  };

  const del = async () => {
    try { await svc.delete(delId); toast.success('Deleted'); setDelId(null); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const toggleSelect = id => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => setSelected(prev => (
    prev.size === filtered.length ? new Set() : new Set(filtered.map(i => i.id))
  ));

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected ${label.toLowerCase()} records?`)) return;
    try {
      for (const id of selected) {
        await svc.delete(id);
      }
      toast.success(`Deleted ${selected.size} records`);
      setSelected(new Set());
      load();
    } catch {
      toast.error('Failed to delete selected records');
    }
  };

  useEffect(() => {
    setSelected(new Set());
  }, [search, monthFilter, items]);

  const handleImport = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const rows = await importCSV(file);
      let n = 0;
      for (const row of rows) {
        const amount = parseFloat(row.amount || row['Amount']); if (!amount) continue;
        await svc.create({
          date:        row.date        || row['Date']         || today(),
          amount,
          notes:       row.notes       || row['Notes']        || '',
          bankAccount: row.bankAccount || row['Bank Account'] || row['bankaccount'] || '',
          clientName:  row.clientName  || row['Client']       || row['Project']     || '',
        });
        n++;
      }
      toast.success(`Imported ${n} ${label} records!`); load();
    } catch { toast.error('Import failed. Check CSV format.'); }
    e.target.value = '';
  };

  const handleExport = () => exportCSV(
    items.map(i => ({
      date: fmtDate(i.date),
      ...(type === 'freelance' ? { clientName: i.clientName || '' } : {}),
      bankAccount: i.bankAccount || '',
      amount: i.amount,
      notes: i.notes || '',
    })),
    `${type}-records.csv`
  );

  const months = [...new Set(items.map(i => i.date?.slice(0, 7)))].filter(Boolean).sort((a, b) => b.localeCompare(a));

  const filtered = items.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = !search || i.notes?.toLowerCase().includes(q) || i.bankAccount?.toLowerCase().includes(q) || i.clientName?.toLowerCase().includes(q);
    const matchMonth  = monthFilter === 'all' || i.date?.startsWith(monthFilter);
    return matchSearch && matchMonth;
  });

  const total   = filtered.reduce((s, i) => s + +i.amount, 0);
  const avg     = filtered.length ? total / filtered.length : 0;
  const highest = filtered.length ? Math.max(...filtered.map(i => +i.amount)) : 0;

  const chartData = months.slice().reverse().map(m => ({
    month: new Date(`${m}-01`).toLocaleString('default', { month: 'short', year: 'numeric' }),
    amount: filtered.filter(i => i.date?.startsWith(m)).reduce((s, i) => s + +i.amount, 0),
  }));

  const summaryCards = type === 'salary'
    ? [
        { label: 'Total Salary',    value: fmt(total),   icon: '💰', color: 'var(--green)' },
        { label: 'Monthly Average', value: fmt(avg),     icon: '📊', color: accentCol },
        { label: 'Highest Credit',  value: fmt(highest), icon: '🏆', color: '#f59e0b' },
      ]
    : [
        { label: 'Total Earned',    value: fmt(total),   icon: '💼', color: '#8b5cf6' },
        { label: 'Avg per Project', value: fmt(avg),     icon: '📈', color: 'var(--blue)' },
        { label: 'Largest Project', value: fmt(highest), icon: '⭐', color: '#f59e0b' },
      ];

  return (
    <div>
      {/* Isolated notice banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(139,92,246,.07)', border: '1px solid rgba(139,92,246,.18)', borderRadius: 8, padding: '7px 12px', marginBottom: 14, fontSize: 12, color: 'var(--t3)' }}>
        <span style={{ fontSize: 15 }}>🔒</span>
        <span><strong style={{ color: accentCol }}>{label} records</strong> are private to this tab — they do <strong>not</strong> appear on the dashboard or All Income.</span>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {summaryCards.map(card => (
          <div key={card.label} className="card" style={{ padding: '14px 16px', borderTop: `3px solid ${card.color}` }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{card.icon}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{card.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: card.color, marginTop: 2 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="filters" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div className="search" style={{ flex: 1, minWidth: 160 }}>
          <span className="si">🔍</span>
          <input placeholder={`Search ${label.toLowerCase()} records...`} value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} className="btn-ghost">✕</button>}
        </div>
        <select className="fs" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{ minWidth: 140, maxWidth: 160 }}>
          <option value="all">All Months</option>
          {months.map(m => {
            const [y, mo] = m.split('-');
            return <option key={m} value={m}>{new Date(+y, +mo - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</option>;
          })}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={handleExport}>⬇️ Export</button>
        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
          ⬆️ Import CSV
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
        </label>
        {type === 'salary' && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowChart(p => !p)}>
            {showChart ? '🙈 Hide chart' : '📈 Show chart'}
          </button>
        )}
        {selected.size > 0 && (
          <button className="btn btn-danger btn-sm" onClick={bulkDelete}>
            🗑️ Delete selected ({selected.size})
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>+ Add {label}</button>
      </div>

      {type === 'salary' && showChart && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>Salary trend</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>{chartData.length} month{chartData.length === 1 ? '' : 's'}</div>
          </div>
          {chartData.length === 0 ? (
            <div className="text-muted fs-13">No salary data available to chart.</div>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 20, bottom: 6, left: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip formatter={value => `₹${fmt(value)}`} cursor={{ stroke: 'var(--border)', strokeWidth: 1, opacity: 0.4 }} />
                  <Line type="monotone" dataKey="amount" stroke={accentCol} strokeWidth={3} dot={{ r: 4, fill: accentCol }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
      {/* Table */}
      {loading ? (
        <div className="spin-center"><div className="spin spin-lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">{icon}</div>
            <div className="empty-title">No {label.toLowerCase()} records</div>
            <div className="empty-sub">Import a CSV or add your first entry above</div>
          </div>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 38, textAlign: 'center' }}>
                  <input type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th>#</th>
                <th>Month</th>
                <th>Date</th>
                {type === 'freelance' && <th>Client / Project</th>}
                <th>Bank Account</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i, idx) => {
                const d     = new Date(i.date);
                const month = d.toLocaleString('default', { month: 'long', year: 'numeric' });
                return (
                  <tr key={i.id} style={{ background: selected.has(i.id) ? 'rgba(255,88,127,.08)' : 'transparent' }}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSelect(i.id)} />
                    </td>
                    <td className="text-muted fs-12">{idx + 1}</td>
                    <td style={{ fontWeight: 700, fontSize: 13 }}>{month}</td>
                    <td className="font-mono fs-12 text-muted">{fmtDate(i.date)}</td>
                    {type === 'freelance' && (
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{i.clientName || <span className="text-muted">—</span>}</td>
                    )}
                    <td>
                      {i.bankAccount
                        ? <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(77,158,255,.1)', color: 'var(--blue)', borderRadius: 6, padding: '2px 8px' }}>🏦 {i.bankAccount}</span>
                        : <span className="text-muted fs-12">—</span>}
                    </td>
                    <td className="text-muted fs-13">{i.notes || '—'}</td>
                    <td style={{ textAlign: 'right' }}><span className="amt amt-g">{fmt(i.amount)}</span></td>
                    <td>
                      <div className="actions" style={{ justifyContent: 'center' }}>
                        <button className="btn-icon" onClick={() => { setEdit(i); setModal(true); }}>✏️</button>
                        <button className="btn-icon" onClick={() => setDelId(i.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={type === 'freelance' ? 7 : 6} className="text-muted fs-12" style={{ padding: '11px 14px' }}>
                  TOTAL ({filtered.length} records)
                </td>
                <td style={{ textAlign: 'right', padding: '11px 14px' }}><span className="amt amt-g fw-800">{fmt(total)}</span></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={edit ? `✏️ Edit ${label}` : `➕ Add ${label}`} onClose={() => { setModal(false); setEdit(null); }}>
          <SimpleForm item={edit} banks={banks} onSave={save} onClose={() => { setModal(false); setEdit(null); }} type={type} />
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

// ─── Main Income Form (unchanged, for All Income tab) ───────────────────────
function IncomeForm({ item, cats, banks, onSave, onClose }) {
  const [f, setF] = useState({ date: today(), category: cats[0]?.name || 'Salary', amount: '', notes: '', bankAccount: '', ...(item ? { ...item, date: fmtDateInput(item.date) } : {}) });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async e => { e.preventDefault(); setLoading(true); try { await onSave({ ...f, amount: parseFloat(f.amount) }); } finally { setLoading(false); } };
  return (
    <form onSubmit={submit}>
      <div className="frow">
        <div className="fg"><label className="fl">Date</label><DateStepper name="date" value={f.date} onChange={ch} required max={today()} /></div>
        <div className="fg"><label className="fl">Amount (₹)</label><input className="fi" type="number" name="amount" value={f.amount} onChange={ch} placeholder="0.00" step="0.01" min="0" required /></div>
      </div>
      <div className="fg"><label className="fl">Category</label><select className="fs" name="category" value={f.category} onChange={ch}>{cats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
      <div className="fg">
        <label className="fl">Bank Account <span style={{ color: 'var(--t3)', fontWeight: 400, fontSize: 11 }}>(credited to — used for Banking sync)</span></label>
        {banks.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4 }}>
            {banks.map(b => (
              <button key={b.id} type="button" onClick={() => setF(p => ({ ...p, bankAccount: f.bankAccount === b.name ? '' : b.name }))}
                style={{ padding: '7px 6px', borderRadius: 8, border: `2px solid ${f.bankAccount === b.name ? 'var(--blue)' : 'var(--border2)'}`, background: f.bankAccount === b.name ? 'rgba(77,158,255,.12)' : 'var(--bg3)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: f.bankAccount === b.name ? 'var(--blue)' : 'var(--t3)', textAlign: 'center', lineHeight: 1.4, transition: 'all .15s' }}>
                <span style={{ fontSize: 13 }}>{b.icon || '🏦'}</span><br />{b.shortName || b.name}
              </button>
            ))}
          </div>
        ) : (
          <input className="fi" name="bankAccount" value={f.bankAccount} onChange={ch} placeholder="e.g. ICICI Bank (add accounts in Banking page)" />
        )}
        {f.bankAccount
          ? <div style={{ marginTop: 5, fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>✅ Will be credited to <strong>{f.bankAccount}</strong></div>
          : <div style={{ marginTop: 5, fontSize: 11, color: 'var(--t3)' }}>ℹ️ Select a bank to enable balance sync in Banking page</div>}
      </div>
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" name="notes" value={f.notes} onChange={ch} rows={2} /></div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spin" /> : null}{item ? 'Update' : 'Add Income'}</button>
      </div>
    </form>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function IncomePage() {
  const [activeTab, setActiveTab] = useState('all');
  const [items, setItems]         = useState([]);
  const [cats, setCats]           = useState([]);
  const [banks, setBanks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(false);
  const [edit, setEdit]           = useState(null);
  const [delId, setDelId]         = useState(null);
  const [search, setSearch]       = useState('');
  const [dateFrom, setDateFrom]   = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; });
  const [dateTo, setDateTo]       = useState(() => new Date().toISOString().slice(0,10));

  useEffect(() => {
    const uid = auth.currentUser?.uid; if (!uid) return;
    getDocs(query(collection(db, 'bankaccounts'), where('userId', '==', uid)))
      .then(snap => setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, c] = await Promise.all([
        incomeService.getAll({ dateFrom, dateTo, search: search || undefined }),
        categoryService.getAll('income'),
      ]);
      setItems(inc); setCats(c);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, search]);

  useEffect(() => { const t = setTimeout(load, search ? 400 : 0); return () => clearTimeout(t); }, [load]);

  const save = async data => {
    try {
      if (edit) { await incomeService.update(edit.id, data); toast.success('Updated!'); }
      else       { await incomeService.create(data);          toast.success('Income added! 💵'); }
      setModal(false); setEdit(null); load();
    } catch { toast.error('Failed to save'); }
  };

  const del = async () => {
    try { await incomeService.delete(delId); toast.success('Deleted'); setDelId(null); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const total = items.reduce((s, i) => s + +i.amount, 0);

  const handleCSVImport = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const rows = await importCSV(file);
      let imported = 0;
      for (const row of rows) {
        const amount = parseFloat(row.amount || row['Amount']); if (!amount) continue;
        await incomeService.create({ date: row.date || row['Date'] || today(), category: row.category || row['Category'] || 'Other', amount, notes: row.notes || row['Notes'] || '' });
        imported++;
      }
      toast.success(`Imported ${imported} income records!`); load();
    } catch { toast.error('Import failed. Check CSV format.'); }
    e.target.value = '';
  };

  const TABS = [
    { key: 'all',      label: '📋 All Income',      count: items.length },
    { key: 'salary',   label: '🧾 Salary Records',   count: null },
    { key: 'freelance',label: '💼 Freelance Records', count: null },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-head">
        <div>
          <div className="page-title">💵 Income</div>
          <div className="page-sub">{items.length} records • Total: <span className="amt amt-g">{fmt(total)}</span></div>
        </div>
        {activeTab === 'all' && (
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              ⬆️ Import CSV<input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} />
            </label>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(items.map(i => ({ date: fmtDate(i.date), category: i.category, bankAccount: i.bankAccount || '', amount: i.amount, notes: i.notes || '' })), 'income.csv')}>⬇️ Export</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>+ Add</button>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--border2)' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500, color: activeTab === tab.key ? 'var(--blue)' : 'var(--t3)', borderBottom: activeTab === tab.key ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -2, borderRadius: 0, transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 6 }}>
            {tab.label}
            {tab.count !== null && (
              <span style={{ background: activeTab === tab.key ? 'var(--blue)' : 'var(--border2)', color: activeTab === tab.key ? '#fff' : 'var(--t3)', borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: All Income */}
      {activeTab === 'all' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          </div>
          <div className="filters">
            <div className="search" style={{ flex: 1 }}>
              <span className="si">🔍</span>
              <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="btn-ghost">✕</button>}
            </div>
          </div>
          {loading
            ? <div className="spin-center"><div className="spin spin-lg" /></div>
            : items.length === 0
              ? <div className="card"><div className="empty"><div className="empty-icon">💵</div><div className="empty-title">No income records</div><div className="empty-sub">Add your first income entry</div></div></div>
              : <div className="tbl-wrap"><table className="tbl">
                  <thead><tr><th>Date</th><th>Category</th><th>Bank Account</th><th>Notes</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
                  <tbody>{items.map(i => (
                    <tr key={i.id}>
                      <td className="font-mono fs-12 text-muted">{fmtDate(i.date)}</td>
                      <td><span className="badge badge-g">{i.category}</span></td>
                      <td>{i.bankAccount ? <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(77,158,255,.1)', color: 'var(--blue)', borderRadius: 6, padding: '2px 8px' }}>🏦 {i.bankAccount}</span> : <span className="text-muted fs-12">—</span>}</td>
                      <td className="text-muted fs-13">{i.notes || '—'}</td>
                      <td style={{ textAlign: 'right' }}><span className="amt amt-g">{fmt(i.amount)}</span></td>
                      <td><div className="actions" style={{ justifyContent: 'center' }}><button className="btn-icon" onClick={() => { setEdit(i); setModal(true); }}>✏️</button><button className="btn-icon" onClick={() => setDelId(i.id)}>🗑️</button></div></td>
                    </tr>
                  ))}</tbody>
                  <tfoot><tr><td colSpan={4} className="text-muted fs-12" style={{ padding: '11px 14px' }}>TOTAL</td><td style={{ textAlign: 'right', padding: '11px 14px' }}><span className="amt amt-g fw-800">{fmt(total)}</span></td><td /></tr></tfoot>
                </table></div>}
          {modal && <Modal title={edit ? '✏️ Edit Income' : '➕ Add Income'} onClose={() => { setModal(false); setEdit(null); }}><IncomeForm item={edit} cats={cats} banks={banks} onSave={save} onClose={() => { setModal(false); setEdit(null); }} /></Modal>}
          {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
        </>
      )}

      {/* Tab: Salary (isolated — salaryrecords collection) */}
      {activeTab === 'salary' && <IsolatedTab type="salary" banks={banks} />}

      {/* Tab: Freelance (isolated — freelancerecords collection) */}
      {activeTab === 'freelance' && <IsolatedTab type="freelance" banks={banks} />}
    </div>
  );
}