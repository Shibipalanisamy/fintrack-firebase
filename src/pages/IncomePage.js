import { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../utils/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { incomeService, categoryService } from '../utils/dbService';
import { fmt, fmtDate, fmtDateInput, today, exportCSV, importCSV } from '../utils/helpers';
import { Modal, ConfirmDelete, MonthYearFilter, DateStepper, DateRangeFilter } from '../components/UI';
import toast from 'react-hot-toast';

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

export default function IncomePage() {
  const now = new Date();
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0,10));

  // Fetch bank accounts for the bankAccount selector in IncomeForm
  useEffect(() => {
    const uid = auth.currentUser?.uid; if (!uid) return;
    getDocs(query(collection(db, 'bankaccounts'), where('userId', '==', uid)))
      .then(snap => setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, c] = await Promise.all([incomeService.getAll({ dateFrom, dateTo, search: search || undefined }), categoryService.getAll('income')]);
      setItems(inc); setCats(c);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, search]);

  useEffect(() => { const t = setTimeout(load, search ? 400 : 0); return () => clearTimeout(t); }, [load]);

  const save = async data => {
    try {
      if (edit) { await incomeService.update(edit.id, data); toast.success('Updated!'); }
      else { await incomeService.create(data); toast.success('Income added! 💵'); }
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
        await incomeService.create({ date: row.date || row['Date'] || today(), category: row.category || row['Category'] || 'Salary', amount, notes: row.notes || row['Notes'] || '' });
        imported++;
      }
      toast.success(`Imported ${imported} income records!`); load();
    } catch { toast.error('Import failed. Check CSV format.'); }
    e.target.value = '';
  };

  return (
    <div>
      <div className="page-head">
        <div><div className="page-title">💵 Income</div><div className="page-sub">{items.length} records • Total: <span className="amt amt-g">{fmt(total)}</span></div></div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>⬆️ Import CSV<input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} /></label>
          <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(items.map(i => ({ date: fmtDate(i.date), category: i.category, bankAccount: i.bankAccount || '', amount: i.amount, notes: i.notes || '' })), 'income.csv')}>⬇️ Export</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>+ Add</button>
        </div>
      </div>
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
      {loading ? <div className="spin-center"><div className="spin spin-lg" /></div>
        : items.length === 0 ? <div className="card"><div className="empty"><div className="empty-icon">💵</div><div className="empty-title">No income records</div><div className="empty-sub">Add your first income entry</div></div></div>
        : <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Date</th><th>Category</th><th>Bank Account</th><th>Notes</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
          <tbody>{items.map(i => (<tr key={i.id}><td className="font-mono fs-12 text-muted">{fmtDate(i.date)}</td><td><span className="badge badge-g">{i.category}</span></td><td>{i.bankAccount ? <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(77,158,255,.1)', color: 'var(--blue)', borderRadius: 6, padding: '2px 8px' }}>🏦 {i.bankAccount}</span> : <span className="text-muted fs-12">—</span>}</td><td className="text-muted fs-13">{i.notes || '—'}</td><td style={{ textAlign: 'right' }}><span className="amt amt-g">{fmt(i.amount)}</span></td><td><div className="actions" style={{ justifyContent: 'center' }}><button className="btn-icon" onClick={() => { setEdit(i); setModal(true); }}>✏️</button><button className="btn-icon" onClick={() => setDelId(i.id)}>🗑️</button></div></td></tr>))}</tbody>
          <tfoot><tr><td colSpan={4} className="text-muted fs-12" style={{ padding: '11px 14px' }}>TOTAL</td><td style={{ textAlign: 'right', padding: '11px 14px' }}><span className="amt amt-g fw-800">{fmt(total)}</span></td><td /></tr></tfoot>
        </table></div>}
      {modal && <Modal title={edit ? '✏️ Edit Income' : '➕ Add Income'} onClose={() => { setModal(false); setEdit(null); }}><IncomeForm item={edit} cats={cats} banks={banks} onSave={save} onClose={() => { setModal(false); setEdit(null); }} /></Modal>}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}