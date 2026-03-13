import { useState, useEffect } from 'react';
import { db, auth } from '../utils/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { fmt, fmtDate, fmtDateInput, today } from '../utils/helpers';
import { Modal, ConfirmDelete } from '../components/UI';
import toast from 'react-hot-toast';
import { differenceInDays, addDays, format } from 'date-fns';

const uid = () => auth.currentUser?.uid;

const INSURANCE_TYPES = ['Life Insurance', 'Term Insurance', 'Health Insurance', 'Vehicle Insurance', 'Home Insurance', 'Accident Insurance', 'Child Plan', 'Endowment Plan', 'ULIP', 'PPF', 'LIC', 'Other'];
const PAYMENT_FREQ = ['Monthly', 'Quarterly', 'Half Yearly', 'Yearly'];
const STATUS_COLORS = { active: 'var(--green)', expired: 'var(--red)', due_soon: 'var(--orange)', inactive: 'var(--t3)' };

const insuranceService = {
  async getAll() {
    const q = query(collection(db, 'insurance'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id, ...d.data(),
      startDate: d.data().startDate?.toDate?.() || new Date(d.data().startDate),
      dueDate: d.data().dueDate?.toDate?.() || new Date(d.data().dueDate),
      maturityDate: d.data().maturityDate ? (d.data().maturityDate?.toDate?.() || new Date(d.data().maturityDate)) : null,
    }));
  },
  async create(data) {
    return addDoc(collection(db, 'insurance'), {
      ...data, userId: uid(),
      startDate: Timestamp.fromDate(new Date(data.startDate)),
      dueDate: Timestamp.fromDate(new Date(data.dueDate)),
      maturityDate: data.maturityDate ? Timestamp.fromDate(new Date(data.maturityDate)) : null,
      createdAt: Timestamp.now()
    });
  },
  async update(id, data) {
    return updateDoc(doc(db, 'insurance', id), {
      ...data,
      startDate: Timestamp.fromDate(new Date(data.startDate)),
      dueDate: Timestamp.fromDate(new Date(data.dueDate)),
      maturityDate: data.maturityDate ? Timestamp.fromDate(new Date(data.maturityDate)) : null,
    });
  },
  async delete(id) { return deleteDoc(doc(db, 'insurance', id)); }
};

function getStatus(item) {
  const today_date = new Date();
  const due = new Date(item.dueDate);
  const daysUntilDue = differenceInDays(due, today_date);
  if (!item.isActive) return { label: 'Inactive', color: STATUS_COLORS.inactive, days: null };
  if (daysUntilDue < 0) return { label: 'Overdue', color: STATUS_COLORS.expired, days: Math.abs(daysUntilDue) };
  if (daysUntilDue <= 30) return { label: `Due in ${daysUntilDue}d`, color: STATUS_COLORS.due_soon, days: daysUntilDue };
  return { label: 'Active', color: STATUS_COLORS.active, days: daysUntilDue };
}

function InsuranceForm({ item, onSave, onClose }) {
  const [f, setF] = useState({
    name: '', type: 'Life Insurance', policyNumber: '', company: '',
    startDate: today(), dueDate: '', maturityDate: '', premiumAmount: '',
    dueAmount: '', maturityAmount: '', paymentFrequency: 'Yearly',
    isActive: true, isMaintaining: true, notes: '',
    ...(item ? {
      ...item,
      startDate: fmtDateInput(item.startDate),
      dueDate: fmtDateInput(item.dueDate),
      maturityDate: item.maturityDate ? fmtDateInput(item.maturityDate) : '',
    } : {})
  });
  const [loading, setLoading] = useState(false);
  const ch = e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF(p => ({ ...p, [e.target.name]: val }));
  };
  const submit = async e => {
    e.preventDefault(); setLoading(true);
    try {
      await onSave({
        ...f,
        premiumAmount: parseFloat(f.premiumAmount) || 0,
        dueAmount: parseFloat(f.dueAmount) || 0,
        maturityAmount: parseFloat(f.maturityAmount) || 0,
      });
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} style={{ padding: '0 20px 0' }}>
      <div className="frow">
        <div className="fg"><label className="fl">Plan Name</label><input className="fi" type="text" name="name" value={f.name} onChange={ch} placeholder="e.g. LIC Jeevan Anand" required /></div>
        <div className="fg"><label className="fl">Company</label><input className="fi" type="text" name="company" value={f.company} onChange={ch} placeholder="e.g. LIC, HDFC" /></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="fl">Insurance Type</label><select className="fs" name="type" value={f.type} onChange={ch}>{INSURANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        <div className="fg"><label className="fl">Policy Number</label><input className="fi" type="text" name="policyNumber" value={f.policyNumber} onChange={ch} placeholder="Optional" /></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="fl">Start Date</label><input className="fi" type="date" name="startDate" value={f.startDate} onChange={ch} required /></div>
        <div className="fg"><label className="fl">Next Due Date</label><input className="fi" type="date" name="dueDate" value={f.dueDate} onChange={ch} required /></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="fl">Premium Amount (₹)</label><input className="fi" type="number" name="premiumAmount" value={f.premiumAmount} onChange={ch} placeholder="0" min="0" /></div>
        <div className="fg"><label className="fl">Payment Frequency</label><select className="fs" name="paymentFrequency" value={f.paymentFrequency} onChange={ch}>{PAYMENT_FREQ.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="fl">Due Amount (₹)</label><input className="fi" type="number" name="dueAmount" value={f.dueAmount} onChange={ch} placeholder="0" min="0" /></div>
        <div className="fg"><label className="fl">Maturity Date</label><input className="fi" type="date" name="maturityDate" value={f.maturityDate} onChange={ch} /></div>
      </div>
      <div className="fg"><label className="fl">Maturity Amount (₹)</label><input className="fi" type="number" name="maturityAmount" value={f.maturityAmount} onChange={ch} placeholder="Expected maturity amount" min="0" /></div>
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" name="notes" value={f.notes} onChange={ch} rows={2} placeholder="Additional notes..." /></div>
      <div className="flex gap-3 mb-3">
        <label className="flex items-center gap-2 fs-13" style={{ cursor: 'pointer' }}>
          <input type="checkbox" name="isActive" checked={f.isActive} onChange={ch} /> Active Policy
        </label>
        <label className="flex items-center gap-2 fs-13" style={{ cursor: 'pointer' }}>
          <input type="checkbox" name="isMaintaining" checked={f.isMaintaining} onChange={ch} /> Currently Investing
        </label>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spin" /> : null}{item ? 'Update' : 'Add Insurance'}</button>
      </div>
    </form>
  );
}

export default function InsurancePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try { setItems(await insuranceService.getAll()); }
    catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async data => {
    try {
      if (edit) { await insuranceService.update(edit.id, data); toast.success('Updated!'); }
      else { await insuranceService.create(data); toast.success('Insurance added!'); }
      setModal(false); setEdit(null); load();
    } catch { toast.error('Failed to save'); }
  };

  const del = async () => {
    try { await insuranceService.delete(delId); toast.success('Deleted'); setDelId(null); load(); }
    catch { toast.error('Failed'); }
  };

  const filtered = items.filter(i => {
    const s = getStatus(i);
    if (filter === 'due_soon') return s.days !== null && s.days <= 30;
    if (filter === 'active') return i.isActive;
    if (filter === 'inactive') return !i.isActive;
    if (filter === 'maintaining') return i.isMaintaining;
    return true;
  });

  const totalPremium = items.filter(i => i.isActive && i.isMaintaining).reduce((s, i) => s + (i.premiumAmount || 0), 0);
  const totalMaturity = items.reduce((s, i) => s + (i.maturityAmount || 0), 0);
  const dueSoon = items.filter(i => { const s = getStatus(i); return s.days !== null && s.days <= 30; });

  if (loading) return <div className="spin-center"><div className="spin spin-lg" /></div>;

  return (
    <div>
      <div className="page-head">
        <div><div className="page-title">🛡️ Insurance Tracker</div><div className="page-sub">{items.length} policies</div></div>
        <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>+ Add Policy</button>
      </div>

      {/* Stats */}
      <div className="stats">
        {[
          { icon: '🛡️', label: 'Total Policies', val: items.length, c: 'var(--blue)' },
          { icon: '💸', label: 'Annual Premium', val: fmt(totalPremium), c: 'var(--red)' },
          { icon: '💰', label: 'Total Maturity', val: fmt(totalMaturity), c: 'var(--green)' },
          { icon: '⚠️', label: 'Due Soon (30d)', val: dueSoon.length, c: 'var(--orange)' },
        ].map((s, i) => (
          <div key={i} className="stat" style={{ '--c': s.c }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-val" style={{ color: s.c }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Due Soon Alert */}
      {dueSoon.length > 0 && (
        <div style={{ background: 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, color: 'var(--orange)', marginBottom: 8 }}>⚠️ Due Soon — Pay before it lapses!</div>
          {dueSoon.map(i => (
            <div key={i.id} className="flex justify-between items-center fs-13 mb-1">
              <span className="fw-600">{i.name} ({i.company})</span>
              <span style={{ color: 'var(--orange)' }}>Due: {fmtDate(i.dueDate)} — {fmt(i.dueAmount || i.premiumAmount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="filters mb-3">
        {[['all','All'],['active','Active'],['due_soon','Due Soon'],['maintaining','Investing'],['inactive','Inactive']].map(([val, label]) => (
          <button key={val} className={`btn btn-sm ${filter === val ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(val)}>{label}</button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0
        ? <div className="card"><div className="empty"><div className="empty-icon">🛡️</div><div className="empty-title">No insurance policies</div><div className="empty-sub">Add your first insurance policy</div></div></div>
        : <div className="tbl-wrap"><table className="tbl">
          <thead>
            <tr>
              <th>Plan Name</th>
              <th>Company</th>
              <th>Type</th>
              <th>Frequency</th>
              <th style={{ textAlign: 'right' }}>Premium</th>
              <th>Next Due</th>
              <th style={{ textAlign: 'right' }}>Due Amount</th>
              <th>Maturity Date</th>
              <th style={{ textAlign: 'right' }}>Maturity Amt</th>
              <th>Status</th>
              <th>Investing</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => {
              const status = getStatus(i);
              return (
                <tr key={i.id}>
                  <td>
                    <div className="fw-600">{i.name}</div>
                    {i.policyNumber && <div className="fs-11 text-muted">#{i.policyNumber}</div>}
                  </td>
                  <td className="fs-13">{i.company || '—'}</td>
                  <td><span className="badge">{i.type}</span></td>
                  <td className="fs-12 text-muted">{i.paymentFrequency}</td>
                  <td style={{ textAlign: 'right' }}><span className="amt">{fmt(i.premiumAmount)}</span></td>
                  <td className="font-mono fs-12">{fmtDate(i.dueDate)}</td>
                  <td style={{ textAlign: 'right' }}><span className="amt amt-r">{fmt(i.dueAmount)}</span></td>
                  <td className="font-mono fs-12">{i.maturityDate ? fmtDate(i.maturityDate) : '—'}</td>
                  <td style={{ textAlign: 'right' }}><span className="amt amt-g">{i.maturityAmount ? fmt(i.maturityAmount) : '—'}</span></td>
                  <td><span style={{ background: status.color + '22', color: status.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{status.label}</span></td>
                  <td style={{ textAlign: 'center' }}>{i.isMaintaining ? '✅' : '❌'}</td>
                  <td>
                    <div className="actions">
                      <button className="btn-icon" onClick={() => { setEdit(i); setModal(true); }}>✏️</button>
                      <button className="btn-icon" onClick={() => setDelId(i.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>}

      {modal && <Modal title={edit ? '✏️ Edit Insurance' : '➕ Add Insurance Policy'} onClose={() => { setModal(false); setEdit(null); }}><InsuranceForm item={edit} onSave={save} onClose={() => { setModal(false); setEdit(null); }} /></Modal>}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}
