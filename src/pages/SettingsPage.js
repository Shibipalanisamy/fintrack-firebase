import { useState, useEffect } from 'react';
import { db, auth } from '../utils/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { categoryService, stockMasterService, brokerService } from '../utils/dbService';
import { Modal, ConfirmDelete, DateStepper } from '../components/UI';
import { PALETTE } from '../utils/helpers';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

// ─── Category Form ─────────────────────────────────────────
function CatForm({ item, type, onSave, onClose }) {
  const [f, setF] = useState({ name: '', color: PALETTE[0], type, isFavorite: false, isFixed: false, ...(item || {}) });
  const [loading, setLoading] = useState(false);
  const submit = async e => { e.preventDefault(); setLoading(true); try { await onSave(f); } finally { setLoading(false); } };
  return (
    <form onSubmit={submit}>
      <div className="fg"><label className="fl">Category Name</label><input className="fi" type="text" value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Groceries" required /></div>
      <div className="fg">
        <label className="fl">Color</label>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', marginTop: 6 }}>
          {PALETTE.map(c => (<button key={c} type="button" onClick={() => setF(p => ({ ...p, color: c }))} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: f.color === c ? '3px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />))}
        </div>
      </div>
      <div className="fg">
        <label className="fl">Favourite</label>
        <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
          <button type="button" onClick={() => setF(p => ({ ...p, isFavorite: !p.isFavorite }))}
            style={{ width: 36, height: 20, borderRadius: 10, background: f.isFavorite ? 'var(--green)' : 'var(--bg4)', border: '1px solid var(--border2)', position: 'relative', transition: 'background .2s', cursor: 'pointer' }}>
            <span style={{ position: 'absolute', top: 2, left: f.isFavorite ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
          </button>
          <span className="fs-13 text-muted">{f.isFavorite ? '⭐ Marked as Favourite' : 'Mark as Favourite'}</span>
        </div>
      </div>
      {type === 'expense' && (
        <div className="fg">
          <label className="fl">Fixed Expense</label>
          <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
            <button type="button" onClick={() => setF(p => ({ ...p, isFixed: !p.isFixed }))}
              style={{ width: 36, height: 20, borderRadius: 10, background: f.isFixed ? 'var(--orange)' : 'var(--bg4)', border: '1px solid var(--border2)', position: 'relative', transition: 'background .2s', cursor: 'pointer' }}>
              <span style={{ position: 'absolute', top: 2, left: f.isFixed ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </button>
            <span className="fs-13 text-muted">{f.isFixed ? '📌 Fixed Expense (recurring monthly)' : 'Mark as Fixed Expense'}</span>
          </div>
        </div>
      )}
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spin" /> : null}{item ? 'Update' : 'Add Category'}</button>
      </div>
    </form>
  );
}

// ─── Category Section ──────────────────────────────────────
function CatSection({ type, label, icon }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [search, setSearch] = useState('');

  const load = async () => { setLoading(true); try { setCats(await categoryService.getAll(type)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [type]);

  const save = async data => {
    try {
      if (edit) { await categoryService.update(edit.id, data); toast.success('Updated!'); }
      else { await categoryService.create(data); toast.success('Category added!'); }
      setModal(false); setEdit(null); load();
    } catch { toast.error('Failed'); }
  };
  const del = async () => { try { await categoryService.delete(delId); toast.success('Deleted'); setDelId(null); load(); } catch { toast.error('Failed'); } };
  const toggleFav = async (cat) => {
    try { await categoryService.update(cat.id, { ...cat, isFavorite: !cat.isFavorite }); toast.success(cat.isFavorite ? 'Removed from favourites' : 'Added to favourites!'); load(); }
    catch { toast.error('Failed'); }
  };

  const filtered = cats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const favCats = filtered.filter(c => c.isFavorite);
  const otherCats = filtered.filter(c => !c.isFavorite);

  return (
    <div className="card mb-4">
      <div className="flex justify-between items-center mb-3">
        <div className="card-title" style={{ marginBottom: 0 }}>{icon} {label} Categories <span className="text-muted fs-12">({cats.length})</span></div>
        <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>+ Add</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '7px 12px', marginBottom: 14 }}>
        <span className="text-muted fs-12">🔍</span>
        <input style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, flex: 1 }} placeholder="Search categories..." value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch('')} className="btn-ghost" style={{ fontSize: 11 }}>✕</button>}
      </div>
      {loading ? <div className="spin-center" style={{ height: 60 }}><div className="spin" /></div> : (
        <>
          {favCats.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="fs-11 fw-700 text-muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>⭐ Favourites</div>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {favCats.map(c => (
                  <div key={c.id} className="flex items-center gap-2" style={{ background: 'rgba(251,191,36,.08)', borderRadius: 8, padding: '6px 10px', border: '1px solid rgba(251,191,36,.3)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color || '#aaa', flexShrink: 0 }} />
                    <span className="fs-13 fw-600">{c.name}</span>
                    <button className="btn-icon" style={{ fontSize: 11 }} title="Remove favourite" onClick={() => toggleFav(c)}>⭐</button>
                    <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => { setEdit(c); setModal(true); }}>✏️</button>
                    <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => setDelId(c.id)}>🗑️</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {otherCats.length > 0 && (
            <div>
              {favCats.length > 0 && <div className="fs-11 fw-700 text-muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>All Categories</div>}
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {otherCats.map(c => (
                  <div key={c.id} className="flex items-center gap-2" style={{ background: 'var(--bg3)', borderRadius: 8, padding: '6px 10px', border: '1px solid var(--border)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color || '#aaa', flexShrink: 0 }} />
                    <span className="fs-13 fw-600">{c.name}</span>
                    <button className="btn-icon" style={{ fontSize: 11 }} title="Add to favourites" onClick={() => toggleFav(c)}>☆</button>
                    <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => { setEdit(c); setModal(true); }}>✏️</button>
                    <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => setDelId(c.id)}>🗑️</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {filtered.length === 0 && <div className="text-muted fs-13">No categories found.</div>}
        </>
      )}
      {modal && <Modal title={edit ? 'Edit Category' : `Add ${label} Category`} onClose={() => { setModal(false); setEdit(null); }}><CatForm item={edit} type={type} onSave={save} onClose={() => { setModal(false); setEdit(null); }} /></Modal>}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

// ─── Stock Master Form ─────────────────────────────────────
function StockForm({ item, onSave, onClose }) {
  const [f, setF] = useState({ symbol: '', name: '', sector: '', ...(item || {}) });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value.toUpperCase() === e.target.name === 'symbol' ? e.target.value.toUpperCase() : e.target.value }));
  const submit = async e => {
    e.preventDefault(); setLoading(true);
    try { await onSave({ ...f, symbol: f.symbol.toUpperCase() }); }
    finally { setLoading(false); }
  };
  return (
    <form onSubmit={submit}>
      <div className="frow">
        <div className="fg">
          <label className="fl">Symbol (e.g. TCS)</label>
          <input className="fi" type="text" name="symbol" value={f.symbol} onChange={e => setF(p => ({ ...p, symbol: e.target.value.toUpperCase() }))} placeholder="RELIANCE" required style={{ textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700 }} />
        </div>
        <div className="fg">
          <label className="fl">Sector</label>
          <input className="fi" type="text" name="sector" value={f.sector} onChange={e => setF(p => ({ ...p, sector: e.target.value }))} placeholder="IT, Banking, Pharma..." />
        </div>
      </div>
      <div className="fg">
        <label className="fl">Full Stock Name</label>
        <input className="fi" type="text" name="name" value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="Tata Consultancy Services Ltd" required />
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spin" /> : null}{item ? 'Update' : 'Add Stock'}</button>
      </div>
    </form>
  );
}

// ─── Stock Master Section ──────────────────────────────────
function StockMasterSection() {
  const { user } = useAuth();
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [search, setSearch] = useState('');

  const load = async () => { setLoading(true); try { setStocks(await stockMasterService.getAll()); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const save = async data => {
    try {
      if (edit) { await stockMasterService.update(edit.id, data); toast.success('Stock updated!'); }
      else { await stockMasterService.create(data); toast.success('Stock added!'); }
      setModal(false); setEdit(null); load();
    } catch { toast.error('Failed'); }
  };

  const del = async () => { try { await stockMasterService.delete(delId); toast.success('Deleted'); setDelId(null); load(); } catch { toast.error('Failed'); } };

  const seedDefaults = async () => {
    setSeeding(true);
    try { await stockMasterService.seedDefaults(user.uid); toast.success('30 NSE stocks added!'); load(); }
    catch { toast.error('Failed'); }
    finally { setSeeding(false); }
  };

  const filtered = stocks.filter(s =>
    s.symbol.toLowerCase().includes(search.toLowerCase()) ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.sector || '').toLowerCase().includes(search.toLowerCase())
  );

  // Group by sector
  const sectors = [...new Set(filtered.map(s => s.sector || 'Other'))].sort();

  return (
    <div className="card mb-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <div className="card-title" style={{ marginBottom: 2 }}>📈 Stock Master <span className="text-muted fs-12">({stocks.length} stocks)</span></div>
          <div className="text-muted fs-12">Manage symbols used in Portfolio page</div>
        </div>
        <div className="flex gap-2">
          {stocks.length === 0 && (
            <button className="btn btn-secondary btn-sm" onClick={seedDefaults} disabled={seeding}>
              {seeding ? <span className="spin" /> : null} Load NSE Defaults
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>+ Add Stock</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '7px 12px', marginBottom: 14 }}>
        <span className="text-muted fs-12">🔍</span>
        <input style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, flex: 1 }} placeholder="Search by symbol, name or sector..." value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch('')} className="btn-ghost" style={{ fontSize: 11 }}>✕</button>}
      </div>

      {loading ? <div className="spin-center" style={{ height: 60 }}><div className="spin" /></div>
        : stocks.length === 0
          ? (
            <div className="empty" style={{ padding: '24px 0' }}>
              <div className="empty-icon">📈</div>
              <div className="empty-title">No stocks yet</div>
              <div className="empty-sub">Click "Load NSE Defaults" to add 30 popular NSE stocks, or add manually</div>
            </div>
          )
          : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Stock Name</th>
                    <th>Sector</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id}>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, background: 'var(--bg3)', padding: '3px 8px', borderRadius: 6, color: 'var(--blue)' }}>
                          {s.symbol}
                        </span>
                      </td>
                      <td className="fw-600 fs-13">{s.name}</td>
                      <td><span className="badge">{s.sector || '—'}</span></td>
                      <td>
                        <div className="actions" style={{ justifyContent: 'center' }}>
                          <button className="btn-icon" onClick={() => { setEdit(s); setModal(true); }}>✏️</button>
                          <button className="btn-icon" onClick={() => setDelId(s.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="text-muted fs-13" style={{ padding: 16 }}>No stocks match your search.</div>}
            </div>
          )}

      {modal && <Modal title={edit ? '✏️ Edit Stock' : '➕ Add Stock'} onClose={() => { setModal(false); setEdit(null); }}><StockForm item={edit} onSave={save} onClose={() => { setModal(false); setEdit(null); }} /></Modal>}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}


// ─── Broker Master Section ─────────────────────────────────
// ─── Bank Accounts (moved here from the removed Banking page — this app
// only ever used bank accounts as a name list for "Paid Via" on Expenses
// and the Add Stock form on Portfolio, both of which read the same
// 'bankaccounts' collection directly, so nothing else needs to change) ───
const uidOrNull = () => auth.currentUser?.uid || null;
const bankAccountService = {
  async getAll() {
    const u = uidOrNull(); if (!u) return [];
    const snap = await getDocs(query(collection(db, 'bankaccounts'), where('userId', '==', u)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async create(data) {
    const u = uidOrNull(); if (!u) throw new Error('Not logged in');
    return addDoc(collection(db, 'bankaccounts'), { ...data, userId: u, createdAt: Timestamp.now() });
  },
  async update(id, data) { return updateDoc(doc(db, 'bankaccounts', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'bankaccounts', id)); },
};
const BANK_COLORS = ['#378ADD', '#E24B4A', '#22c55e', '#f97316', '#a78bfa', '#fb923c', '#0F6E56', '#f43f5e', '#fbbf24', '#38bdf8'];
const BANK_ICONS = ['🏦', '🏧', '💳', '🏛️', '💰', '🏢', '🌐', '💵'];
const BLANK_BANK = { name: '', shortName: '', accountNumber: '', ifsc: '', balance: '', color: BANK_COLORS[0], icon: '🏦', accountType: 'Savings', notes: '' };

// ─── Generic simple named list (name + color), stored in its own Firestore
// collection — used for dropdown option lists managed from Settings:
// Companies (Income → Salary), Agri Spending/Income Categories.
const SIMPLE_LIST_COLORS = ['#4d9eff', '#22c55e', '#a78bfa', '#f97316', '#f43f5e', '#fbbf24', '#38bdf8', '#e879f9', '#10d98a', '#fb7185'];
const simpleListService = (collectionName) => ({
  async getAll() {
    const u = auth.currentUser?.uid; if (!u) return [];
    const snap = await getDocs(query(collection(db, collectionName), where('userId', '==', u)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async create(data) {
    const u = auth.currentUser?.uid; if (!u) throw new Error('Not logged in');
    return addDoc(collection(db, collectionName), { ...data, userId: u, createdAt: Timestamp.now() });
  },
  async update(id, data) { return updateDoc(doc(db, collectionName, id), data); },
  async delete(id) { return deleteDoc(doc(db, collectionName, id)); },
});

function SimpleListSection({ title, icon, collectionName, hint }) {
  const svc = simpleListService(collectionName);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [delId, setDelId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const load = async () => { setLoading(true); try { setList(await svc.getAll()); } catch { toast.error('Failed to load'); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    setAdding(true);
    try {
      const color = SIMPLE_LIST_COLORS[list.length % SIMPLE_LIST_COLORS.length];
      await svc.create({ name: name.trim(), color });
      setName('');
      load();
    } catch { toast.error('Failed to add'); }
    finally { setAdding(false); }
  };

  const del = async () => { try { await svc.delete(delId); toast.success('Deleted'); setDelId(null); load(); } catch { toast.error('Failed'); } };

  const startEdit = (item) => { setEditingId(item.id); setEditName(item.name); };
  const saveEdit = async () => {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      await svc.update(editingId, { name: editName.trim() });
      setList(prev => prev.map(i => i.id === editingId ? { ...i, name: editName.trim() } : i));
      toast.success('Renamed!');
    } catch { toast.error('Failed to rename'); }
    finally { setEditingId(null); }
  };

  return (
    <div className="card mb-4">
      <div className="card-title" style={{ marginBottom: 2 }}>{icon} {title} <span className="text-muted fs-12">({list.length})</span></div>
      {hint && <div className="text-muted fs-12 mb-3">{hint}</div>}
      <div className="flex gap-2 mb-3">
        <input className="fi" style={{ flex: 1 }} value={name} onChange={e => setName(e.target.value)}
          placeholder={`Add a new ${title.toLowerCase().replace(/s$/, '')}…`}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button className="btn btn-primary btn-sm" onClick={add} disabled={adding || !name.trim()}>+ Add</button>
      </div>
      {loading ? <div className="spin-center" style={{ height: 40 }}><div className="spin" /></div>
        : list.length === 0 ? <div className="text-muted fs-12">None added yet</div>
        : (
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {list.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: (item.color || SIMPLE_LIST_COLORS[0]) + '15', border: `1.5px solid ${(item.color || SIMPLE_LIST_COLORS[0])}40`, borderRadius: 10, padding: '6px 10px' }}>
                {editingId === item.id ? (
                  <input className="fi" autoFocus style={{ padding: '2px 6px', fontSize: 12, width: 120 }}
                    value={editName} onChange={e => setEditName(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditingId(null); }} />
                ) : (
                  <span className="fw-700 fs-12" style={{ color: item.color || SIMPLE_LIST_COLORS[0], cursor: 'pointer' }}
                    onClick={() => startEdit(item)} title="Click to rename">{item.name}</span>
                )}
                <button className="btn-icon" style={{ fontSize: 10 }} onClick={() => startEdit(item)} title="Rename">✏️</button>
                <button className="btn-icon" style={{ fontSize: 10 }} onClick={() => setDelId(item.id)}>🗑️</button>
              </div>
            ))}
          </div>
        )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

function BankAccountsSection() {
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [form, setForm] = useState(BLANK_BANK);

  const load = async () => { setLoading(true); try { setBanks(await bankAccountService.getAll()); } catch { toast.error('Failed to load'); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const ch = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Enter bank/account name'); return; }
    try {
      const bal = parseFloat(form.balance) || 0;
      const payload = { ...form, balance: bal, openingBalance: edit ? (parseFloat(form.openingBalance) || bal) : bal };
      if (edit) { await bankAccountService.update(edit.id, payload); toast.success('Updated!'); }
      else { await bankAccountService.create(payload); toast.success('Bank account added!'); }
      setModal(false); setEdit(null); setForm(BLANK_BANK); load();
    } catch { toast.error('Save failed'); }
  };

  const del = async () => { try { await bankAccountService.delete(delId); toast.success('Deleted'); setDelId(null); load(); } catch { toast.error('Failed'); } };

  return (
    <div className="card mb-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <div className="card-title" style={{ marginBottom: 2 }}>🏦 Bank Accounts <span className="text-muted fs-12">({banks.length})</span></div>
          <div className="text-muted fs-12">Used as "Paid Via" options on Expenses and for stock purchases on Portfolio</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm(BLANK_BANK); setModal(true); }}>+ Add Bank</button>
      </div>

      {loading ? <div className="spin-center" style={{ height: 60 }}><div className="spin" /></div>
        : banks.length === 0
          ? <div className="empty" style={{ padding: '20px 0' }}><div className="empty-icon">🏦</div><div className="empty-title">No bank accounts yet</div></div>
          : (
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {banks.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: (b.color || BANK_COLORS[0]) + '15', border: `1.5px solid ${(b.color || BANK_COLORS[0])}40`, borderRadius: 10, padding: '8px 12px' }}>
                  <span style={{ fontSize: 18 }}>{b.icon || '🏦'}</span>
                  <span className="fw-700 fs-13" style={{ color: b.color || BANK_COLORS[0] }}>{b.name}</span>
                  <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => { setEdit(b); setForm({ ...BLANK_BANK, ...b, balance: String(b.balance ?? '') }); setModal(true); }}>✏️</button>
                  <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => setDelId(b.id)}>🗑️</button>
                </div>
              ))}
            </div>
          )}

      {modal && (
        <Modal title={edit ? '✏️ Edit Bank Account' : '➕ Add Bank Account'} onClose={() => { setModal(false); setEdit(null); }}>
          <div className="frow">
            <div className="fg"><label className="fl">Bank / Account Name *</label><input className="fi" name="name" value={form.name} onChange={ch} placeholder="e.g. ICICI Bank, SBI Savings" required /></div>
            <div className="fg"><label className="fl">Short Name</label><input className="fi" name="shortName" value={form.shortName} onChange={ch} placeholder="e.g. ICICI, SBI" /></div>
          </div>
          <div className="frow">
            <div className="fg">
              <label className="fl">Account Type</label>
              <select className="fs" name="accountType" value={form.accountType} onChange={ch}>
                {['Savings', 'Current', 'Salary', 'NRE', 'NRO', 'Cash Wallet', 'Digital Wallet'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="fg"><label className="fl">Opening / Current Balance (₹) *</label><input className="fi" type="number" name="balance" value={form.balance} onChange={ch} placeholder="0.00" step="0.01" required /></div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">Account Number (last 4)</label><input className="fi" name="accountNumber" value={form.accountNumber} onChange={ch} placeholder="e.g. 4521" maxLength={4} /></div>
            <div className="fg"><label className="fl">IFSC Code</label><input className="fi" name="ifsc" value={form.ifsc} onChange={ch} placeholder="e.g. ICIC0001234" /></div>
          </div>
          <div className="fg">
            <label className="fl">Color</label>
            <div className="flex gap-2" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              {BANK_COLORS.map(c => (<button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `3px solid ${form.color === c ? 'var(--text)' : 'transparent'}`, cursor: 'pointer' }} />))}
            </div>
          </div>
          <div className="fg">
            <label className="fl">Icon</label>
            <div className="flex gap-2" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              {BANK_ICONS.map(ic => (<button key={ic} type="button" onClick={() => setForm(p => ({ ...p, icon: ic }))} style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${form.icon === ic ? 'var(--blue)' : 'var(--border2)'}`, background: form.icon === ic ? 'rgba(77,158,255,.15)' : 'var(--bg3)', fontSize: 18, cursor: 'pointer' }}>{ic}</button>))}
            </div>
          </div>
          <div className="fg"><label className="fl">Notes</label><textarea className="fta" name="notes" value={form.notes} onChange={ch} rows={2} /></div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={() => { setModal(false); setEdit(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{edit ? 'Update' : 'Add Account'}</button>
          </div>
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

// ─── Cards (moved here from the removed Cards page — same reasoning: this
// app only used cards as a name list for "Paid Via" on Expenses, which
// reads the same 'cards' collection directly) ───
const cardAccountService = {
  async getAll() {
    const u = uidOrNull(); if (!u) return [];
    const snap = await getDocs(query(collection(db, 'cards'), where('userId', '==', u)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async create(data) {
    const u = uidOrNull(); if (!u) throw new Error('Not logged in');
    return addDoc(collection(db, 'cards'), { ...data, userId: u, createdAt: Timestamp.now() });
  },
  async update(id, data) { return updateDoc(doc(db, 'cards', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'cards', id)); },
};
const CARD_TYPES = ['Credit Card', 'Debit Card', 'Prepaid Card', 'Corporate Card'];
const CARD_NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex', 'Diners'];
const CARD_COLORS = ['#378ADD', '#E24B4A', '#639922', '#BA7517', '#534AB7', '#0F6E56', '#993C1D'];
const BLANK_CARD = { name: '', bank: '', type: 'Credit Card', network: 'Visa', last4: '', creditLimit: '', outstanding: '', minDue: '', billingDate: '', graceDays: '15', color: CARD_COLORS[0], isActive: true, notes: '' };

function CardsSection() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [form, setForm] = useState(BLANK_CARD);

  const load = async () => { setLoading(true); try { setCards(await cardAccountService.getAll()); } catch { toast.error('Failed to load'); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const ch = e => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setForm(p => ({ ...p, [e.target.name]: v })); };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Enter card name'); return; }
    try {
      const payload = { ...form, creditLimit: parseFloat(form.creditLimit) || 0, outstanding: parseFloat(form.outstanding) || 0, minDue: parseFloat(form.minDue) || 0, billingDate: parseInt(form.billingDate) || 1, graceDays: parseInt(form.graceDays) || 15 };
      if (edit) { await cardAccountService.update(edit.id, payload); toast.success('Updated!'); }
      else { await cardAccountService.create(payload); toast.success('Card added!'); }
      setModal(false); setEdit(null); setForm(BLANK_CARD); load();
    } catch { toast.error('Save failed'); }
  };

  const del = async () => { try { await cardAccountService.delete(delId); toast.success('Deleted'); setDelId(null); load(); } catch { toast.error('Failed'); } };

  return (
    <div className="card mb-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <div className="card-title" style={{ marginBottom: 2 }}>💳 Cards <span className="text-muted fs-12">({cards.length})</span></div>
          <div className="text-muted fs-12">Used as "Paid Via" options on Expenses</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm(BLANK_CARD); setModal(true); }}>+ Add Card</button>
      </div>

      {loading ? <div className="spin-center" style={{ height: 60 }}><div className="spin" /></div>
        : cards.length === 0
          ? <div className="empty" style={{ padding: '20px 0' }}><div className="empty-icon">💳</div><div className="empty-title">No cards yet</div></div>
          : (
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {cards.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: (c.color || CARD_COLORS[0]) + '15', border: `1.5px solid ${(c.color || CARD_COLORS[0])}40`, borderRadius: 10, padding: '8px 12px' }}>
                  <span className="fw-700 fs-13" style={{ color: c.color || CARD_COLORS[0] }}>{c.name}{c.last4 ? ` (••${c.last4})` : ''}</span>
                  <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => { setEdit(c); setForm({ ...BLANK_CARD, ...c }); setModal(true); }}>✏️</button>
                  <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => setDelId(c.id)}>🗑️</button>
                </div>
              ))}
            </div>
          )}

      {modal && (
        <Modal title={edit ? '✏️ Edit Card' : '➕ Add Card'} onClose={() => { setModal(false); setEdit(null); }}>
          <div className="frow">
            <div className="fg"><label className="fl">Card Name</label><input className="fi" name="name" value={form.name} onChange={ch} placeholder="e.g. ICICI Coral Credit" required /></div>
            <div className="fg"><label className="fl">Bank / Issuer</label><input className="fi" name="bank" value={form.bank} onChange={ch} placeholder="e.g. ICICI, HDFC" /></div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">Card Type</label><select className="fs" name="type" value={form.type} onChange={ch}>{CARD_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="fg"><label className="fl">Network</label><select className="fs" name="network" value={form.network} onChange={ch}>{CARD_NETWORKS.map(n => <option key={n}>{n}</option>)}</select></div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">Last 4 digits</label><input className="fi" name="last4" value={form.last4} onChange={ch} placeholder="e.g. 4521" maxLength={4} /></div>
            <div className="fg"><label className="fl">Card Color</label>
              <div className="flex gap-2" style={{ marginTop: 6 }}>
                {CARD_COLORS.map(c => (<button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: `2px solid ${form.color === c ? 'var(--text)' : 'transparent'}`, cursor: 'pointer', flexShrink: 0 }} />))}
              </div>
            </div>
          </div>
          {form.type === 'Credit Card' && (
            <>
              <div className="frow">
                <div className="fg"><label className="fl">Credit Limit (₹)</label><input className="fi" type="number" name="creditLimit" value={form.creditLimit} onChange={ch} placeholder="e.g. 3,00,000" min="0" /></div>
                <div className="fg"><label className="fl">Current Outstanding (₹)</label><input className="fi" type="number" name="outstanding" value={form.outstanding} onChange={ch} placeholder="e.g. 42,000" min="0" /></div>
              </div>
              <div className="frow">
                <div className="fg"><label className="fl">Minimum Due (₹)</label><input className="fi" type="number" name="minDue" value={form.minDue} onChange={ch} placeholder="e.g. 2,100" min="0" /></div>
                <div className="fg"><label className="fl">Statement Date (day of month)</label><input className="fi" type="number" name="billingDate" value={form.billingDate} onChange={ch} placeholder="e.g. 5" min="1" max="31" /></div>
              </div>
              <div className="fg"><label className="fl">Grace Period (days after statement)</label><input className="fi" type="number" name="graceDays" value={form.graceDays} onChange={ch} placeholder="e.g. 15" min="0" max="45" /></div>
            </>
          )}
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={() => { setModal(false); setEdit(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{edit ? 'Update' : 'Add Card'}</button>
          </div>
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

function BrokerSection() {
  const { user } = useAuth();
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [form, setForm] = useState({ name: '', icon: '🏦', color: '#3b82f6' });

  const COLORS = ['#f97316','#22c55e','#3b82f6','#8b5cf6','#fbbf24','#f43f5e','#06b6d4','#84cc16','#ec4899','#14b8a6'];
  const ICONS = ['🏦','🔶','🟦','🟣','🟠','🟢','🔵','🔴','⚡','💎'];

  const load = async () => { setLoading(true); try { setBrokers(await brokerService.getAll()); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Enter broker name'); return; }
    try {
      if (edit) { await brokerService.update(edit.id, form); toast.success('Updated!'); }
      else { await brokerService.create(form); toast.success('Broker added!'); }
      setModal(false); setEdit(null); setForm({ name: '', icon: '🏦', color: '#3b82f6' }); load();
    } catch { toast.error('Failed'); }
  };

  const del = async () => { try { await brokerService.delete(delId); toast.success('Deleted'); setDelId(null); load(); } catch { toast.error('Failed'); } };

  const seedDefaults = async () => {
    setSeeding(true);
    try { await brokerService.seedDefaults(user.uid); toast.success('Default brokers added!'); load(); }
    catch { toast.error('Failed'); } finally { setSeeding(false); }
  };

  return (
    <div className="card mb-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <div className="card-title" style={{ marginBottom: 2 }}>🏦 Broker Master <span className="text-muted fs-12">({brokers.length} brokers)</span></div>
          <div className="text-muted fs-12">Manage stock brokers used in Portfolio</div>
        </div>
        <div className="flex gap-2">
          {brokers.length === 0 && <button className="btn btn-secondary btn-sm" onClick={seedDefaults} disabled={seeding}>{seeding ? <span className="spin" /> : null} Load Defaults</button>}
          <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm({ name: '', icon: '🏦', color: '#3b82f6' }); setModal(true); }}>+ Add Broker</button>
        </div>
      </div>

      {loading ? <div className="spin-center" style={{ height: 60 }}><div className="spin" /></div>
        : brokers.length === 0
          ? <div className="empty" style={{ padding: '20px 0' }}><div className="empty-icon">🏦</div><div className="empty-title">No brokers yet</div><div className="empty-sub">Click "Load Defaults" to add Angel One, Mstock, Aionion</div></div>
          : (
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {brokers.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: b.color + '15', border: `1.5px solid ${b.color}40`, borderRadius: 10, padding: '8px 12px' }}>
                  <span style={{ fontSize: 18 }}>{b.icon}</span>
                  <span className="fw-700 fs-13" style={{ color: b.color }}>{b.name}</span>
                  <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => { setEdit(b); setForm({ name: b.name, icon: b.icon, color: b.color }); setModal(true); }}>✏️</button>
                  <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => setDelId(b.id)}>🗑️</button>
                </div>
              ))}
            </div>
          )}

      {modal && (
        <Modal title={edit ? '✏️ Edit Broker' : '➕ Add Broker'} onClose={() => { setModal(false); setEdit(null); }}>
          <div className="fg"><label className="fl">Broker Name</label><input className="fi" type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Zerodha, Groww..." required /></div>
          <div className="fg">
            <label className="fl">Icon</label>
            <div className="flex gap-2" style={{ flexWrap: 'wrap', marginTop: 4 }}>
              {ICONS.map(ic => (<button key={ic} type="button" onClick={() => setForm(p => ({ ...p, icon: ic }))} style={{ width: 36, height: 36, borderRadius: 8, border: form.icon === ic ? '2px solid var(--blue)' : '1px solid var(--border2)', background: form.icon === ic ? 'rgba(77,158,255,.12)' : 'var(--bg3)', fontSize: 18, cursor: 'pointer' }}>{ic}</button>))}
            </div>
          </div>
          <div className="fg">
            <label className="fl">Color</label>
            <div className="flex gap-2" style={{ flexWrap: 'wrap', marginTop: 4 }}>
              {COLORS.map(cl => (<button key={cl} type="button" onClick={() => setForm(p => ({ ...p, color: cl }))} style={{ width: 26, height: 26, borderRadius: '50%', background: cl, border: form.color === cl ? '3px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />))}
            </div>
          </div>
          {form.name && <div style={{ background: form.color + '15', border: `1.5px solid ${form.color}40`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 20 }}>{form.icon}</span><span className="fw-700" style={{ color: form.color }}>{form.name}</span></div>}
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={() => { setModal(false); setEdit(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{edit ? 'Update' : 'Add Broker'}</button>
          </div>
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

// ─── Stock Demerger Tool ───────────────────────────────────
function DemergerSection() {
  const [investments, setInvestments] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState(null);

  // Form state
  const [oldSymbol, setOldSymbol] = useState('');
  const [newParentSymbol, setNewParentSymbol] = useState('');
  const [newParentName, setNewParentName] = useState('');
  const [demergedSymbol, setDemergedSymbol] = useState('');
  const [demergedName, setDemergedName] = useState('');
  const [ratio, setRatio] = useState('1'); // demerged shares per 1 parent share
  const [demergerDate, setDemergerDate] = useState('');
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fintrack_demerger_history') || '[]'); } catch { return []; }
  });

  const load = async () => {
    setLoading(true);
    try {
      const { investmentService, stockMasterService } = await import('../utils/dbService');
      const [inv, sm] = await Promise.all([investmentService.getAll(), stockMasterService.getAll()]);
      setInvestments(inv); setStocks(sm);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const uniqueSymbols = [...new Set(investments.map(i => i.symbol).filter(Boolean))].sort();

  const handlePreview = () => {
    try {
      if (!oldSymbol || !newParentSymbol || !newParentName) { toast.error('Fill Old Symbol, New Parent Symbol and Name'); return; }
      const affected = investments.filter(i => i.symbol === oldSymbol);
      if (affected.length === 0) { toast.error(`No holdings found for ${oldSymbol}`); return; }
      const r = parseFloat(ratio) || 1;
      const previewRows = affected.map(inv => {
        // Safe date formatting — handle string, Date, or Firestore Timestamp
        let dateStr = '—';
        try {
          const d = inv.purchaseDate?.toDate ? inv.purchaseDate.toDate() : new Date(inv.purchaseDate);
          dateStr = isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN');
        } catch { dateStr = String(inv.purchaseDate || '—'); }
        return {
          id: inv.id,
          date: dateStr,
          qty: inv.quantity,
          oldSymbol: inv.symbol,
          oldName: inv.stockName,
          newParentSymbol,
          newParentName,
          newParentQty: inv.quantity,
          ...(demergedSymbol ? {
            demergedSymbol,
            demergedName,
            demergedQty: Math.floor(inv.quantity * r),
          } : {}),
        };
      });
      setPreview(previewRows);
    } catch (e) {
      console.error('Preview error:', e);
      toast.error('Preview failed: ' + e.message);
    }
  };

  const applyDemerger = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      const { investmentService, stockMasterService } = await import('../utils/dbService');
      let updated = 0; let created = 0;

      for (const row of preview) {
        // Update existing record — rename symbol + stock name
        await investmentService.update(row.id, {
          ...investments.find(i => i.id === row.id),
          symbol: row.newParentSymbol,
          stockName: row.newParentName,
        });
        updated++;

        // Create new demerged stock record if specified
        if (row.demergedSymbol && row.demergedQty > 0) {
          const orig = investments.find(i => i.id === row.id);
          await investmentService.create({
            symbol: row.demergedSymbol,
            stockName: row.demergedName,
            quantity: row.demergedQty,
            purchasePrice: 0, // demerged stock cost basis = 0
            currentPrice: 0,
            purchaseDate: demergerDate || orig.purchaseDate,
            brokerName: orig.brokerName || '',
            brokerage: 0,
          });
          created++;
        }
      }

      // Update stock master if new symbols don't exist
      const masterSymbols = stocks.map(s => s.symbol);
      if (!masterSymbols.includes(newParentSymbol)) {
        await stockMasterService.create({ symbol: newParentSymbol, name: newParentName, sector: '' });
      }
      if (demergedSymbol && !masterSymbols.includes(demergedSymbol)) {
        await stockMasterService.create({ symbol: demergedSymbol, name: demergedName, sector: '' });
      }

      // Save to history
      const entry = {
        date: new Date().toISOString(),
        oldSymbol, newParentSymbol, newParentName,
        demergedSymbol, demergedName,
        ratio, demergerDate,
        recordsUpdated: updated, recordsCreated: created,
      };
      const newHistory = [entry, ...history].slice(0, 20);
      setHistory(newHistory);
      localStorage.setItem('fintrack_demerger_history', JSON.stringify(newHistory));

      toast.success(`✅ Demerger applied! ${updated} records renamed, ${created} new records created`);
      setPreview(null);
      setOldSymbol(''); setNewParentSymbol(''); setNewParentName('');
      setDemergedSymbol(''); setDemergedName(''); setRatio('1'); setDemergerDate('');
      load();
    } catch (e) { console.error(e); toast.error('Failed: ' + e.message); }
    finally { setApplying(false); }
  };

  return (
    <div className="card mb-4">
      <div className="card-title">🔀 Stock Demerger / Symbol Change Tool</div>
      <div style={{ background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--t2)', marginBottom: 16, lineHeight: 1.7 }}>
        <strong>When to use:</strong> When a stock you hold undergoes a demerger (e.g. TataMotors → TataMotors + TMPV) or simply changes its symbol name.<br />
        This tool will <strong>rename all your existing holdings</strong> to the new parent symbol, and optionally <strong>create new records</strong> for the demerged entity.
      </div>

      {loading ? <div className="spin-center"><div className="spin" /></div> : (
        <>
          {/* Step 1 — Old symbol */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl">① Old Symbol (what you currently hold)</label>
              <select className="fi" value={oldSymbol} onChange={e => { setOldSymbol(e.target.value); setNewParentSymbol(e.target.value); setPreview(null); }}>
                <option value="">— Select Symbol —</option>
                {uniqueSymbols.map(s => <option key={s} value={s}>{s} ({investments.filter(i => i.symbol === s).length} records)</option>)}
              </select>
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl">📅 Demerger Effective Date</label>
              <DateStepper name="demergerDate" value={demergerDate} onChange={e => setDemergerDate(e.target.value)} />
            </div>
          </div>

          {/* Step 2 — New parent */}
          <div style={{ background: 'rgba(77,158,255,.06)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div className="fs-12 fw-700 mb-2" style={{ color: 'var(--blue)' }}>② New Parent Company (existing stock after demerger)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">New Symbol</label>
                <input className="fi" style={{ fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase' }} value={newParentSymbol} onChange={e => { setNewParentSymbol(e.target.value.toUpperCase()); setPreview(null); }} placeholder="e.g. TATAMOTORS" />
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">New Stock Name</label>
                <input className="fi" value={newParentName} onChange={e => { setNewParentName(e.target.value); setPreview(null); }} placeholder="e.g. Tata Motors Ltd (PV)" />
              </div>
            </div>
          </div>

          {/* Step 3 — Demerged entity (optional) */}
          <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div className="fs-12 fw-700 mb-2" style={{ color: 'var(--green)' }}>③ Demerged Entity <span className="fw-400 text-muted">(optional — leave blank if only symbol rename)</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10 }}>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">New Symbol</label>
                <input className="fi" style={{ fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase' }} value={demergedSymbol} onChange={e => { setDemergedSymbol(e.target.value.toUpperCase()); setPreview(null); }} placeholder="e.g. TMPV" />
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Stock Name</label>
                <input className="fi" value={demergedName} onChange={e => { setDemergedName(e.target.value); setPreview(null); }} placeholder="e.g. Tata Motors PV Ltd" />
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Ratio (shares per 1 held)</label>
                <input className="fi" type="number" min="0" step="0.01" value={ratio} onChange={e => { setRatio(e.target.value); setPreview(null); }} placeholder="e.g. 1" />
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <button className="btn btn-secondary" onClick={handlePreview} disabled={!oldSymbol || !newParentSymbol}>🔍 Preview Changes</button>
            {preview && <button className="btn btn-primary" onClick={applyDemerger} disabled={applying}>{applying ? <><span className="spin" style={{ width: 12, height: 12, borderWidth: 2 }} /> Applying...</> : '✅ Apply Demerger'}</button>}
            {preview && <button className="btn btn-secondary" onClick={() => setPreview(null)}>✕ Cancel</button>}
          </div>

          {/* Preview table */}
          {preview && preview.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="fs-13 fw-700 mb-2">📋 Preview — {preview.length} records will be affected:</div>
              <div className="tbl-wrap"><table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Old Symbol</th>
                    <th>Old Name</th>
                    <th style={{ color: 'var(--blue)' }}>→ New Symbol</th>
                    <th style={{ color: 'var(--blue)' }}>→ New Name</th>
                    <th>Qty</th>
                    {preview.some(r => r.demergedSymbol) && <th style={{ color: 'var(--green)' }}>+ Demerged</th>}
                    {preview.some(r => r.demergedSymbol) && <th style={{ color: 'var(--green)' }}>+ Qty</th>}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td className="font-mono fs-12 text-muted">{r.date}</td>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--red)', textDecoration: 'line-through' }}>{r.oldSymbol}</span></td>
                      <td className="fs-12 text-muted" style={{ textDecoration: 'line-through' }}>{r.oldName}</td>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: 'var(--blue)' }}>{r.newParentSymbol}</span></td>
                      <td className="fs-12 fw-600" style={{ color: 'var(--blue)' }}>{r.newParentName}</td>
                      <td className="font-mono fs-12">{r.newParentQty}</td>
                      {preview.some(p => p.demergedSymbol) && <td>{r.demergedSymbol ? <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: 'var(--green)' }}>+ {r.demergedSymbol}</span> : '—'}</td>}
                      {preview.some(p => p.demergedSymbol) && <td className="font-mono fs-12 amt-g">{r.demergedQty != null ? `+ ${r.demergedQty}` : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div>
              <div className="fs-13 fw-700 mb-2" style={{ color: 'var(--t2)' }}>📜 Demerger History</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map((h, i) => (
                  <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 14px', fontSize: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--red)', textDecoration: 'line-through' }}>{h.oldSymbol}</span>
                      <span className="text-muted mx-2">→</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--blue)' }}>{h.newParentSymbol}</span>
                      {h.demergedSymbol && <><span className="text-muted mx-2">+</span><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--green)' }}>{h.demergedSymbol}</span></>}
                    </div>
                    <div className="text-muted">{h.recordsUpdated} renamed · {h.recordsCreated} created · {new Date(h.date).toLocaleDateString('en-IN')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Data Fix Tools ────────────────────────────────────────
function DataFixSection() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);

  const runFix = async (label, fn) => {
    setRunning(true);
    try {
      const count = await fn();
      setResults(p => [{ label, count, time: new Date().toLocaleTimeString('en-IN'), ok: true }, ...p]);
      toast.success(`${label}: ${count} records fixed!`);
    } catch (e) {
      setResults(p => [{ label, error: e.message, time: new Date().toLocaleTimeString('en-IN'), ok: false }, ...p]);
      toast.error('Failed: ' + e.message);
    } finally { setRunning(false); }
  };

  const fixCategorySpelling = async (oldVal, newVal, collection_name) => {
    const { db } = await import('../utils/firebase');
    const { collection, query, where, getDocs, updateDoc, doc } = await import('firebase/firestore');
    const { getAuth } = await import('firebase/auth');
    const uid = getAuth().currentUser?.uid;
    if (!uid) throw new Error('Not logged in');
    const q = query(collection(db, collection_name), where('userId', '==', uid), where('category', '==', oldVal));
    const snap = await getDocs(q);
    for (const d of snap.docs) await updateDoc(doc(db, collection_name, d.id), { category: newVal });
    return snap.size;
  };

  const FIXES = [
    {
      label: '"Vegetable" → "Vegetables" (expenses)',
      desc: 'Renames old "Vegetable" category to "Vegetables" in all expense records',
      fn: () => fixCategorySpelling('Vegetable', 'Vegetables', 'expenses'),
    },
    {
      label: '"Vegetables for Office" → "Vegetables" (expenses)',
      desc: 'Merges office vegetable entries into the main Vegetables category',
      fn: () => fixCategorySpelling('Vegetables for Office', 'Vegetables', 'expenses'),
    },
  ];

  return (
    <div className="card mb-4">
      <div className="card-title">🔧 Data Fix Tools</div>
      <div className="text-muted fs-12 mb-3">One-click tools to fix category spelling or rename records in bulk</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FIXES.map((fix, i) => (
          <div key={i} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="fw-700 fs-13">{fix.label}</div>
              <div className="text-muted fs-12">{fix.desc}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => runFix(fix.label, fix.fn)} disabled={running}>
              {running ? <span className="spin" /> : '▶ Run Fix'}
            </button>
          </div>
        ))}
      </div>
      {results.length > 0 && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="fs-12 fw-700 text-muted mb-2">📋 Fix Log</div>
          {results.map((r, i) => (
            <div key={i} className="flex justify-between fs-12 mb-1">
              <span>{r.ok ? '✅' : '❌'} {r.label}</span>
              <span className="text-muted">{r.ok ? `${r.count} records · ${r.time}` : r.error}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Backup & Restore ──────────────────────────────────────
function BackupSection() {
  const { user } = useAuth();
  const [backing, setBacking] = useState(false);
  const [backupProgress, setBackupProgress] = useState({ current: 0, total: 0, col: '' });
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState({ current: 0, total: 0, col: '' });
  const [previewData, setPreviewData] = useState(null);
  const [lastBackup, setLastBackup] = useState(() => localStorage.getItem('fintrack_last_backup') || null);

  const COLLECTIONS = [
    { key: 'income',          label: 'Income',         icon: '💵' },
    { key: 'expenses',        label: 'Expenses',       icon: '💸' },
    { key: 'investments',     label: 'Portfolio',      icon: '📈' },
    { key: 'dividends',       label: 'Dividends',      icon: '💸' },
    { key: 'loans',           label: 'Loans',          icon: '🧮' },
    { key: 'goldinvestments', label: 'Gold',           icon: '🥇' },
    { key: 'insurance',       label: 'Insurance',      icon: '🛡️' },
    { key: 'recurring',       label: 'Recurring',      icon: '🔄' },
    { key: 'goals',           label: 'Goals',          icon: '🎯' },
    { key: 'brokers',         label: 'Brokers',        icon: '🏦' },
    { key: 'categories',      label: 'Categories',     icon: '📂' },
    { key: 'stockmaster',     label: 'Stock Master',   icon: '📋' },
  ];

  const backup = async () => {
    setBacking(true);
    setBackupProgress({ current: 0, total: COLLECTIONS.length, col: '' });
    try {
      const { db } = await import('../utils/firebase');
      const { collection, query, where, getDocs, collection: col2, query: q2 } = await import('firebase/firestore');
      const uid = user?.uid;
      if (!uid) { toast.error('Not logged in'); return; }
      const data = { version: 3, exportedAt: new Date().toISOString(), userId: uid, collections: {} };
      for (let i = 0; i < COLLECTIONS.length; i++) {
        const { key, label } = COLLECTIONS[i];
        setBackupProgress({ current: i + 1, total: COLLECTIONS.length, col: label });
        try {
          const snap = await getDocs(query(collection(db, key), where('userId', '==', uid)));
          data.collections[key] = snap.docs.map(d => {
            const raw = d.data(); const clean = { id: d.id };
            Object.entries(raw).forEach(([k, v]) => { clean[k] = v?.toDate ? v.toDate().toISOString() : v; });
            return clean;
          });
        } catch { data.collections[key] = []; }
      }
      // Loan payments
      try {
        const lSnap = await getDocs(query(collection(db, 'loans'), where('userId', '==', uid)));
        const payments = [];
        for (const l of lSnap.docs) {
          const pSnap = await getDocs(query(collection(db, 'loanpayments'), where('loanId', '==', l.id)));
          pSnap.docs.forEach(d => { const raw = d.data(); const clean = { id: d.id }; Object.entries(raw).forEach(([k,v]) => { clean[k] = v?.toDate ? v.toDate().toISOString() : v; }); payments.push(clean); });
        }
        data.collections['loanpayments'] = payments;
      } catch { data.collections['loanpayments'] = []; }

      const total = Object.values(data.collections).reduce((s, a) => s + (a?.length || 0), 0);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `fintrack-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      const now = new Date().toLocaleString('en-IN');
      localStorage.setItem('fintrack_last_backup', now); setLastBackup(now);
      toast.success(`Backup downloaded! ${total} records`);
    } catch (e) { toast.error('Backup failed: ' + e.message); }
    finally { setBacking(false); setBackupProgress({ current: 0, total: 0, col: '' }); }
  };

  const loadFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.collections) { toast.error('Invalid backup file'); return; }
      const summary = Object.entries(data.collections)
        .map(([col, records]) => ({ col, count: records?.length || 0, icon: COLLECTIONS.find(c => c.key === col)?.icon || '📄', label: COLLECTIONS.find(c => c.key === col)?.label || col }))
        .filter(s => s.count > 0);
      const total = summary.reduce((s, r) => s + r.count, 0);
      setPreviewData({ data, summary, total, fileName: file.name, exportedAt: data.exportedAt, sameUser: data.userId === user?.uid });
    } catch (e) { toast.error('Could not read file: ' + e.message); }
    e.target.value = '';
  };

  const confirmRestore = async () => {
    if (!previewData) return;
    setRestoring(true);
    const { data } = previewData;
    try {
      const { db } = await import('../utils/firebase');
      const { collection, addDoc, Timestamp } = await import('firebase/firestore');
      const uid = user?.uid;
      const DATE_FIELDS = ['date','purchaseDate','startDate','dueDate','maturityDate','createdAt','nextDue','investedDate'];
      let restored = 0, failed = 0;
      const allEntries = Object.entries(data.collections).filter(([,records]) => records?.length > 0);
      const totalRecords = allEntries.reduce((s,[,r]) => s + r.length, 0);
      for (const [col, records] of allEntries) {
        const label = COLLECTIONS.find(c => c.key === col)?.label || col;
        for (let i = 0; i < records.length; i++) {
          setRestoreProgress({ current: restored + failed + 1, total: totalRecords, col: label });
          try {
            const { id, userId: _uid, ...fields } = records[i];
            const clean = { ...fields, userId: uid };
            DATE_FIELDS.forEach(k => { if (clean[k] && typeof clean[k] === 'string' && (clean[k].includes('T') || /^\d{4}-\d{2}-\d{2}$/.test(clean[k]))) { try { clean[k] = Timestamp.fromDate(new Date(clean[k])); } catch {} } });
            await addDoc(collection(db, col), clean);
            restored++;
          } catch (err) { console.warn('Row failed:', err); failed++; }
        }
      }
      toast.success(`Restored ${restored} records!${failed > 0 ? ` (${failed} failed)` : ''} Refresh to see data.`);
      setPreviewData(null);
    } catch (e) { toast.error('Restore failed: ' + e.message); }
    finally { setRestoring(false); setRestoreProgress({ current: 0, total: 0, col: '' }); }
  };

  const backupPct = backupProgress.total > 0 ? Math.round((backupProgress.current / backupProgress.total) * 100) : 0;
  const restorePct = restoreProgress.total > 0 ? Math.round((restoreProgress.current / restoreProgress.total) * 100) : 0;

  return (
    <div className="card mb-4">
      <div className="card-title">💾 Backup & Restore</div>
      <div className="text-muted fs-12 mb-4">Export all your FinTrack data as a single JSON file. Import it back anytime to restore.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 14, marginBottom: 16 }}>
        {/* Export */}
        <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
          <div className="fw-800 fs-15 mb-1">Export Backup</div>
          <div className="text-muted fs-12 mb-3">Downloads all your data as a JSON file to your device.</div>
          {lastBackup && <div style={{ background: 'rgba(34,197,94,.08)', borderRadius: 8, padding: '6px 10px', marginBottom: 12, fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>✅ Last backup: {lastBackup}</div>}
          {backing && backupProgress.total > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="flex justify-between fs-12 mb-1"><span className="fw-600" style={{ color: 'var(--green)' }}>Exporting {backupProgress.col}...</span><span className="text-muted">{backupProgress.current}/{backupProgress.total}</span></div>
              <div style={{ background: 'var(--bg3)', borderRadius: 6, height: 8, overflow: 'hidden' }}><div style={{ height: '100%', width: `${backupPct}%`, background: 'var(--green)', borderRadius: 6, transition: 'width .3s' }} /></div>
            </div>
          )}
          <button className="btn btn-primary" onClick={backup} disabled={backing} style={{ background: 'var(--green)', borderColor: 'var(--green)', width: '100%', justifyContent: 'center' }}>
            {backing ? <><span className="spin" /> Exporting {backupPct}%...</> : '⬇️ Download Backup'}
          </button>
          <div className="fs-11 text-muted mt-2" style={{ textAlign: 'center' }}>Income · Expenses · Portfolio · Loans · Insurance · Goals</div>
        </div>
        {/* Restore */}
        <div style={{ background: 'rgba(77,158,255,.06)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>♻️</div>
          <div className="fw-800 fs-15 mb-1">Restore from Backup</div>
          <div className="text-muted fs-12 mb-2">Select a FinTrack JSON backup file to preview and restore.</div>
          <div style={{ background: 'rgba(244,63,94,.07)', border: '1px solid rgba(244,63,94,.18)', borderRadius: 8, padding: '7px 10px', marginBottom: 14, fontSize: 11 }}>⚠️ Restore <strong>adds</strong> records — does not delete existing data.</div>
          {restoring && restoreProgress.total > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="flex justify-between fs-12 mb-1"><span className="fw-600" style={{ color: 'var(--blue)' }}>Restoring {restoreProgress.col}...</span><span className="text-muted">{restoreProgress.current}/{restoreProgress.total}</span></div>
              <div style={{ background: 'var(--bg3)', borderRadius: 6, height: 8, overflow: 'hidden' }}><div style={{ height: '100%', width: `${restorePct}%`, background: 'var(--blue)', borderRadius: 6, transition: 'width .3s' }} /></div>
            </div>
          )}
          <label className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', cursor: restoring ? 'not-allowed' : 'pointer', opacity: restoring ? 0.6 : 1 }}>
            {restoring ? <><span className="spin" /> Restoring {restorePct}%...</> : '📂 Select Backup File'}
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={loadFile} disabled={restoring} />
          </label>
          <div className="fs-11 text-muted mt-2" style={{ textAlign: 'center' }}>Only .json files exported from FinTrack</div>
        </div>
      </div>

      {/* Preview before restore */}
      {previewData && (
        <div style={{ background: 'var(--bg3)', border: '2px solid var(--blue)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div className="fw-800 fs-15 mb-2">📋 Restore Preview</div>
          <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
            <div className="fs-12 text-muted">File: <span className="fw-700">{previewData.fileName}</span></div>
            {previewData.exportedAt && <div className="fs-12 text-muted">Exported: <span className="fw-700">{new Date(previewData.exportedAt).toLocaleString('en-IN')}</span></div>}
            {previewData.sameUser
              ? <span style={{ background: 'rgba(34,197,94,.15)', color: 'var(--green)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>✅ Same account</span>
              : <span style={{ background: 'rgba(244,63,94,.15)', color: 'var(--red)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>⚠️ Different account</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {previewData.summary.map(s => (
              <div key={s.col} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', textAlign: 'center', minWidth: 80 }}>
                <div style={{ fontSize: 20 }}>{s.icon}</div>
                <div className="fw-700 fs-13 mt-1">{s.count}</div>
                <div className="fs-11 text-muted">{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(77,158,255,.08)', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 13 }}>
            <span className="fw-700" style={{ color: 'var(--blue)' }}>{previewData.total} records</span> will be added to your account
          </div>
          <div className="flex gap-3">
            <button className="btn btn-primary" onClick={confirmRestore} disabled={restoring} style={{ flex: 1, justifyContent: 'center' }}>
              {restoring ? <><span className="spin" /> Restoring...</> : `✅ Confirm Restore (${previewData.total} records)`}
            </button>
            <button className="btn btn-secondary" onClick={() => setPreviewData(null)} disabled={restoring}>✕ Cancel</button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '12px 16px' }}>
        <div className="fw-700 fs-13 mb-2">📋 What's included</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[...COLLECTIONS, { key: 'loanpayments', label: 'Loan Payments', icon: '💳' }].map(({ key, icon, label }) => (
            <span key={key} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 10px', fontSize: 12 }}>{icon} {label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── App Lock Section ──────────────────────────────────────
const PIN_KEY = 'fintrack_app_pin';

function AppLockSection() {
  const [hasPin, setHasPin] = useState(!!localStorage.getItem(PIN_KEY));
  const [mode, setMode] = useState('idle'); // idle | setup | confirm
  const [input, setInput] = useState('');
  const [tempPin, setTempPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);

  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 500); };

  const handleDigit = (d) => {
    if (input.length >= 4) return;
    const newInput = input + d;
    setInput(newInput);
    setError('');
    if (newInput.length === 4) {
      setTimeout(() => {
        if (mode === 'setup') {
          setTempPin(newInput); setMode('confirm'); setInput('');
        } else if (mode === 'confirm') {
          if (newInput === tempPin) {
            localStorage.setItem(PIN_KEY, newInput);
            setHasPin(true); setMode('idle'); setInput(''); setTempPin('');
            setSuccess(true); setTimeout(() => setSuccess(false), 2500);
            toast.success('PIN set! App will lock after 1 min in background.');
          } else {
            setError("PINs don't match. Try again.");
            triggerShake(); setTempPin(''); setMode('setup'); setInput('');
          }
        }
      }, 150);
    }
  };

  const handleDelete = () => { setInput(p => p.slice(0, -1)); setError(''); };

  const removePin = () => {
    localStorage.removeItem(PIN_KEY);
    setHasPin(false); setMode('idle'); setInput(''); setError('');
    toast.success('App lock removed.');
  };

  const cancel = () => { setMode('idle'); setInput(''); setTempPin(''); setError(''); };

  const dots = Array.from({ length: 4 }, (_, i) => i < input.length);

  return (
    <div className="card mb-4">
      <div className="card-title">🔐 App Lock</div>
      <div className="text-muted fs-12 mb-4">Secure your FinTrack with a 4-digit PIN. The app locks automatically after 1 minute in the background.</div>

      {mode === 'idle' ? (
        <div>
          {/* Status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: hasPin ? 'rgba(34,197,94,.08)' : 'rgba(148,163,184,.08)', border: `1px solid ${hasPin ? 'rgba(34,197,94,.25)' : 'var(--border2)'}`, borderRadius: 10, padding: '10px 16px' }}>
              <span style={{ fontSize: 20 }}>{hasPin ? '🔒' : '🔓'}</span>
              <div>
                <div className="fw-700 fs-13" style={{ color: hasPin ? 'var(--green)' : 'var(--t2)' }}>{hasPin ? 'PIN Lock Enabled' : 'No PIN Set'}</div>
                <div className="fs-11 text-muted">{hasPin ? 'App locks after 1 min in background' : 'App is currently unlocked'}</div>
              </div>
            </div>
            {success && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>✅ PIN saved!</span>}
          </div>
          <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => { setMode('setup'); setInput(''); setError(''); }}>
              {hasPin ? '🔄 Change PIN' : '➕ Set PIN'}
            </button>
            {hasPin && (
              <button className="btn btn-danger btn-sm" onClick={removePin}>🗑️ Remove PIN</button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 300 }}>
          <div className="fs-13 fw-700 mb-1" style={{ color: 'var(--blue)' }}>
            {mode === 'setup' ? '🔢 Enter new 4-digit PIN' : '🔁 Re-enter PIN to confirm'}
          </div>
          <div className="fs-12 text-muted mb-3">
            {mode === 'setup' ? 'Choose a PIN you can remember' : 'Must match the PIN you just entered'}
          </div>

          {/* Dots */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 8, ...(shake ? { animation: 'shake .4s ease' } : {}) }}>
            {dots.map((filled, i) => (
              <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${filled ? 'var(--blue)' : 'var(--border2)'}`, background: filled ? 'var(--blue)' : 'transparent', transition: 'all .15s', transform: filled ? 'scale(1.15)' : 'scale(1)' }} />
            ))}
          </div>
          {error && <div className="fs-12 mb-2" style={{ color: 'var(--red)', fontWeight: 700 }}>{error}</div>}

          {/* Numpad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 52px)', gap: 8, marginBottom: 14 }}>
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => {
              if (k === '') return <div key={i} />;
              const isDel = k === '⌫';
              return (
                <button key={i} type="button" onClick={() => isDel ? handleDelete() : handleDigit(k)}
                  style={{ height: 52, borderRadius: 10, border: isDel ? 'none' : '1px solid var(--border2)', background: isDel ? 'transparent' : 'var(--bg3)', fontSize: isDel ? 18 : 20, fontWeight: 700, color: isDel ? 'var(--t3)' : 'var(--text)', cursor: 'pointer', transition: 'all .1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isDel ? 'transparent' : 'var(--bg3)'; }}>
                  {k}
                </button>
              );
            })}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={cancel}>✕ Cancel</button>
        </div>
      )}
    </div>
  );
}

// ─── Settings Page ─────────────────────────────────────────
export default function SettingsPage() {
  return (
    <div>
      <div className="page-head"><div className="page-title">⚙️ Settings</div></div>
      <AppLockSection />
      <BackupSection />
      <DemergerSection />
      <DataFixSection />
      <BankAccountsSection />
      <CardsSection />
      <SimpleListSection title="Companies" icon="🏢" collectionName="companies" hint="Used as the Company dropdown on Income → Salary Records" />
      <SimpleListSection title="Agri Spending Categories" icon="🌱" collectionName="agriSpendCategories" hint="Used as the Category dropdown on Agriculture → Spended Amount" />
      <SimpleListSection title="Agri Income Sources" icon="💰" collectionName="agriIncomeCategories" hint="Used as the Source dropdown on Agriculture → Received Amount" />
      <BrokerSection />
      <StockMasterSection />
      <CatSection type="income" label="Income" icon="💵" />
      <CatSection type="expense" label="Expense" icon="💸" />
    </div>
  );
}