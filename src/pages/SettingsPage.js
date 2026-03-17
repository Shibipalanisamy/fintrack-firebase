import { useState, useEffect } from 'react';
import { categoryService, stockMasterService, brokerService } from '../utils/dbService';
import { Modal, ConfirmDelete } from '../components/UI';
import { PALETTE } from '../utils/helpers';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

// ─── Category Form ─────────────────────────────────────────
function CatForm({ item, type, onSave, onClose }) {
  const [f, setF] = useState({ name: '', color: PALETTE[0], type, isFavorite: false, ...(item || {}) });
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
                          {s.symbol.replace(/^NSE:/i, '')}
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
              <input className="fi" type="date" value={demergerDate} onChange={e => setDemergerDate(e.target.value)} />
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

// ─── Settings Page ─────────────────────────────────────────
export default function SettingsPage() {
  return (
    <div>
      <div className="page-head"><div className="page-title">⚙️ Settings</div></div>
      <DemergerSection />
      <BrokerSection />
      <StockMasterSection />
      <CatSection type="income" label="Income" icon="💵" />
      <CatSection type="expense" label="Expense" icon="💸" />
    </div>
  );
}