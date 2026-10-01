import { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../utils/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { fmt, fmtDate, fmtDateInput, today } from '../utils/helpers';
import { Modal, ConfirmDelete, DateStepper, DateRangeFilter } from '../components/UI';
import toast from 'react-hot-toast';

// ─── Isolated collection helpers (own collections — never touch expenses/income) ───
const isolatedService = (collectionName) => ({
  getAll: async () => {
    const uid = auth.currentUser?.uid; if (!uid) return [];
    const snap = await getDocs(query(collection(db, collectionName), where('userId', '==', uid)));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate?.() || new Date(d.data().date || Date.now()) }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  },
  create: async (data) => {
    const uid = auth.currentUser?.uid; if (!uid) throw new Error('Not authenticated');
    return addDoc(collection(db, collectionName), { ...data, userId: uid, date: Timestamp.fromDate(new Date(data.date)), createdAt: Timestamp.now() });
  },
  update: async (id, data) => updateDoc(doc(db, collectionName, id), { ...data, date: Timestamp.fromDate(new Date(data.date)) }),
  delete: async (id) => deleteDoc(doc(db, collectionName, id)),
});

const spendService = isolatedService('agriSpending');
const collectService = isolatedService('agriCollection');

// ─── Add/Edit Form ───────────────────────────────────────────
function AgriForm({ item, onSave, onClose, mode }) {
  const [f, setF] = useState({
    date: today(), description: '', amount: '',
    ...(item ? { ...item, date: fmtDateInput(item.date) } : {}),
  });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async e => {
    e.preventDefault(); setLoading(true);
    try { await onSave({ ...f, amount: parseFloat(f.amount) }); }
    finally { setLoading(false); }
  };
  const amountLabel = mode === 'spend' ? 'Amount Spent (₹)' : 'Amount Received (₹)';
  return (
    <form onSubmit={submit}>
      <div className="frow">
        <div className="fg"><label className="fl">Date</label><DateStepper name="date" value={f.date} onChange={ch} required max={today()} /></div>
        <div className="fg"><label className="fl">{amountLabel}</label><input className="fi" type="number" name="amount" value={f.amount} onChange={ch} placeholder="0.00" step="0.01" min="0" required /></div>
      </div>
      <div className="fg"><label className="fl">Description</label><textarea className="fta" name="description" value={f.description} onChange={ch} rows={2} placeholder={mode === 'spend' ? 'e.g. Seeds, fertilizer, labour...' : 'e.g. Crop sale, subsidy...'} /></div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <span className="spin" /> : null}{item ? 'Update' : 'Add'}
        </button>
      </div>
    </form>
  );
}

// ─── Reusable tab (Spending or Collection) ──────────────────
function AgriTab({ mode }) {
  const svc      = mode === 'spend' ? spendService : collectService;
  const icon     = mode === 'spend' ? '🌱' : '💰';
  const amtClass = mode === 'spend' ? 'amt-r' : 'amt-g';
  const label    = mode === 'spend' ? 'Spended Amount' : 'Received Amount';
  const amtHead  = mode === 'spend' ? 'Amount Spent' : 'Amount Received';
  const emptyMsg = mode === 'spend' ? 'No spending records yet' : 'No collection records yet';

  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(false);
  const [edit, setEdit]           = useState(null);
  const [delId, setDelId]         = useState(null);
  const [selected, setSelected]   = useState(new Set());
  const [dateFrom, setDateFrom]   = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
  const [dateTo, setDateTo]       = useState(() => today());

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await svc.getAll()); }
    catch { toast.error(`Failed to load ${label.toLowerCase()}`); }
    finally { setLoading(false); }
  }, [svc, label]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [dateFrom, dateTo, items.length]);

  const filtered = items.filter(i => {
    const d = fmtDateInput(i.date);
    return d >= dateFrom && d <= dateTo;
  });

  const total = filtered.reduce((s, i) => s + (+i.amount || 0), 0);

  const save = async data => {
    try {
      if (edit) { await svc.update(edit.id, data); toast.success('Updated!'); }
      else       { await svc.create(data);          toast.success('Added!'); }
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
    prev.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(i => i.id))
  ));

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected record${selected.size === 1 ? '' : 's'}?`)) return;
    try {
      for (const id of selected) await svc.delete(id);
      toast.success(`Deleted ${selected.size} record${selected.size === 1 ? '' : 's'}`);
      setSelected(new Set());
      load();
    } catch { toast.error('Failed to delete selected records'); }
  };

  return (
    <div>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button className="btn btn-danger btn-sm" onClick={bulkDelete}>🗑️ Delete ({selected.size})</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>+ Add</button>
        </div>
      </div>

      {loading
        ? <div className="spin-center"><div className="spin spin-lg" /></div>
        : filtered.length === 0
          ? <div className="card"><div className="empty"><div className="empty-icon">{icon}</div><div className="empty-title">{emptyMsg}</div><div className="empty-sub">Add your first {mode === 'spend' ? 'expense' : 'collection'} entry</div></div></div>
          : <div className="tbl-wrap"><table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 36 }}><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
                  <th>Date</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>{amtHead}</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>{filtered.map(i => (
                <tr key={i.id}>
                  <td><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSelect(i.id)} /></td>
                  <td className="font-mono fs-12 text-muted">{fmtDate(i.date)}</td>
                  <td className="fs-13">{i.description || '—'}</td>
                  <td style={{ textAlign: 'right' }}><span className={`amt ${amtClass}`}>{fmt(i.amount)}</span></td>
                  <td><div className="actions" style={{ justifyContent: 'center' }}><button className="btn-icon" onClick={() => { setEdit(i); setModal(true); }}>✏️</button><button className="btn-icon" onClick={() => setDelId(i.id)}>🗑️</button></div></td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={3} className="text-muted fs-12" style={{ padding: '11px 14px' }}>TOTAL</td><td style={{ textAlign: 'right', padding: '11px 14px' }}><span className={`amt ${amtClass} fw-800`}>{fmt(total)}</span></td><td /></tr></tfoot>
            </table></div>}

      {modal && (
        <Modal title={edit ? `✏️ Edit ${mode === 'spend' ? 'Spending' : 'Collection'}` : `➕ Add ${mode === 'spend' ? 'Spending' : 'Collection'}`} onClose={() => { setModal(false); setEdit(null); }}>
          <AgriForm item={edit} mode={mode} onSave={save} onClose={() => { setModal(false); setEdit(null); }} />
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function AgriculturePage() {
  const [activeTab, setActiveTab] = useState('spend');
  const [spendTotal, setSpendTotal] = useState(0);
  const [collectTotal, setCollectTotal] = useState(0);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const [spends, collects] = await Promise.all([spendService.getAll(), collectService.getAll()]);
      setSpendTotal(spends.reduce((s, i) => s + (+i.amount || 0), 0));
      setCollectTotal(collects.reduce((s, i) => s + (+i.amount || 0), 0));
    } catch { toast.error('Failed to load summary'); }
    finally { setLoadingSummary(false); }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary, activeTab]);

  const net = collectTotal - spendTotal;

  const TABS = [
    { key: 'spend',    label: '🌱 Spended Amount' },
    { key: 'collect',  label: '💰 Received Amount' },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">🌾 Agriculture</div>
          <div className="page-sub">Track farm spending and collections</div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="text-muted fs-12" style={{ marginBottom: 6, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Total Spending</div>
          <div className="amt amt-r" style={{ fontSize: 22, fontWeight: 800 }}>{loadingSummary ? '…' : fmt(spendTotal)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="text-muted fs-12" style={{ marginBottom: 6, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Total Collection</div>
          <div className="amt amt-g" style={{ fontSize: 22, fontWeight: 800 }}>{loadingSummary ? '…' : fmt(collectTotal)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="text-muted fs-12" style={{ marginBottom: 6, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Net</div>
          <div className={`amt ${net >= 0 ? 'amt-g' : 'amt-r'}`} style={{ fontSize: 22, fontWeight: 800 }}>{loadingSummary ? '…' : fmt(net)}</div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--border2)' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500, color: activeTab === tab.key ? 'var(--blue)' : 'var(--t3)', borderBottom: activeTab === tab.key ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -2, borderRadius: 0, transition: 'all .15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'spend' ? <AgriTab mode="spend" /> : <AgriTab mode="collect" />}
    </div>
  );
}
