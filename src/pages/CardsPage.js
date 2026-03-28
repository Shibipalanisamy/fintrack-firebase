import { useState, useEffect } from 'react';
import { db, auth } from '../utils/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, Timestamp, getDoc } from 'firebase/firestore';
import { fmt, fmtDate, fmtDateInput, today } from '../utils/helpers';
import { Modal, ConfirmDelete, DateStepper } from '../components/UI';
import toast from 'react-hot-toast';
import { differenceInDays } from 'date-fns';

const uid = () => auth.currentUser?.uid;

const CARD_TYPES = ['Credit Card', 'Debit Card', 'Prepaid Card', 'Corporate Card'];
const CARD_NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex', 'Diners'];
const CARD_COLORS = ['#378ADD', '#E24B4A', '#639922', '#BA7517', '#534AB7', '#0F6E56', '#993C1D'];

const cardsService = {
  async getAll() {
    const q = query(collection(db, 'cards'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async create(data) { return addDoc(collection(db, 'cards'), { ...data, userId: uid(), createdAt: Timestamp.now() }); },
  async update(id, data) { return updateDoc(doc(db, 'cards', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'cards', id)); }
};

const txnService = {
  async getAll(cardId) {
    const q = query(collection(db, 'cardtxns'), where('userId', '==', uid()), where('cardId', '==', cardId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate?.() || new Date(d.data().date) }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  },
  async create(data) { return addDoc(collection(db, 'cardtxns'), { ...data, userId: uid(), date: Timestamp.fromDate(new Date(data.date)), createdAt: Timestamp.now() }); },
  async delete(id) { return deleteDoc(doc(db, 'cardtxns', id)); }
};

function getCardStatus(card) {
  if (!card.billingDate) return { label: 'Active', color: 'var(--green)', urgent: false };
  const today_d = new Date();
  const billing = parseInt(card.billingDate);
  const dueDay = billing + (parseInt(card.graceDays) || 15);
  let dueDate = new Date(today_d.getFullYear(), today_d.getMonth(), dueDay);
  if (dueDate < today_d) dueDate = new Date(today_d.getFullYear(), today_d.getMonth() + 1, dueDay);
  const days = differenceInDays(dueDate, today_d);
  if (days <= 0) return { label: 'Overdue', color: 'var(--red)', urgent: true, days: 0 };
  if (days <= 5) return { label: `Due in ${days}d`, color: 'var(--red)', urgent: true, days };
  if (days <= 15) return { label: `Due in ${days}d`, color: 'var(--orange)', urgent: false, days };
  return { label: 'Active', color: 'var(--green)', urgent: false, days };
}

function CardForm({ item, onSave, onClose }) {
  const [f, setF] = useState({
    name: '', bank: '', type: 'Credit Card', network: 'Visa', last4: '',
    creditLimit: '', outstanding: '', minDue: '', billingDate: '', graceDays: '15',
    color: CARD_COLORS[0], isActive: true, notes: '',
    ...(item || {})
  });
  const [loading, setLoading] = useState(false);
  const ch = e => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setF(p => ({ ...p, [e.target.name]: v })); };
  const submit = async e => {
    e.preventDefault(); setLoading(true);
    try {
      await onSave({ ...f, creditLimit: parseFloat(f.creditLimit) || 0, outstanding: parseFloat(f.outstanding) || 0, minDue: parseFloat(f.minDue) || 0, billingDate: parseInt(f.billingDate) || 1, graceDays: parseInt(f.graceDays) || 15 });
    } finally { setLoading(false); }
  };
  return (
    <form onSubmit={submit}>
      <div className="frow">
        <div className="fg"><label className="fl">Card Name</label><input className="fi" name="name" value={f.name} onChange={ch} placeholder="e.g. ICICI Coral Credit" required /></div>
        <div className="fg"><label className="fl">Bank / Issuer</label><input className="fi" name="bank" value={f.bank} onChange={ch} placeholder="e.g. ICICI, HDFC" /></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="fl">Card Type</label><select className="fs" name="type" value={f.type} onChange={ch}>{CARD_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="fg"><label className="fl">Network</label><select className="fs" name="network" value={f.network} onChange={ch}>{CARD_NETWORKS.map(n => <option key={n}>{n}</option>)}</select></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="fl">Last 4 digits</label><input className="fi" name="last4" value={f.last4} onChange={ch} placeholder="e.g. 4521" maxLength={4} /></div>
        <div className="fg"><label className="fl">Card Color</label>
          <div className="flex gap-2" style={{ marginTop: 6 }}>
            {CARD_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setF(p => ({ ...p, color: c }))}
                style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: `2px solid ${f.color === c ? 'var(--text)' : 'transparent'}`, cursor: 'pointer', flexShrink: 0 }} />
            ))}
          </div>
        </div>
      </div>
      {f.type === 'Credit Card' && (
        <>
          <div className="frow">
            <div className="fg"><label className="fl">Credit Limit (₹)</label><input className="fi" type="number" name="creditLimit" value={f.creditLimit} onChange={ch} placeholder="e.g. 3,00,000" min="0" /></div>
            <div className="fg"><label className="fl">Current Outstanding (₹)</label><input className="fi" type="number" name="outstanding" value={f.outstanding} onChange={ch} placeholder="e.g. 42,000" min="0" /></div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">Minimum Due (₹)</label><input className="fi" type="number" name="minDue" value={f.minDue} onChange={ch} placeholder="e.g. 2,100" min="0" /></div>
            <div className="fg"><label className="fl">Statement Date (day of month)</label><input className="fi" type="number" name="billingDate" value={f.billingDate} onChange={ch} placeholder="e.g. 5" min="1" max="31" /></div>
          </div>
          <div className="fg"><label className="fl">Grace Period (days after statement)</label><input className="fi" type="number" name="graceDays" value={f.graceDays} onChange={ch} placeholder="e.g. 15" min="0" max="45" /></div>
        </>
      )}
      {f.type === 'Debit Card' && (
        <div className="fg"><label className="fl">Available Balance (₹)</label><input className="fi" type="number" name="outstanding" value={f.outstanding} onChange={ch} placeholder="e.g. 84,200" min="0" /></div>
      )}
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" name="notes" value={f.notes} onChange={ch} rows={2} placeholder="Any additional notes..." /></div>
      <div className="flex gap-3 mb-3">
        <label className="flex items-center gap-2 fs-13" style={{ cursor: 'pointer' }}>
          <input type="checkbox" name="isActive" checked={f.isActive} onChange={ch} /> Active
        </label>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spin" /> : null}{item ? 'Update' : 'Add Card'}</button>
      </div>
    </form>
  );
}

function CardTxnModal({ card, onClose }) {
  const [txns, setTxns] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: today(), description: '', amount: '', type: 'debit', category: '', paidFromBankId: '' });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState(null);

  const load = async () => { setLoading(true); try { setTxns(await txnService.getAll(card.id)); } catch { toast.error('Failed to load'); } finally { setLoading(false); } };

  useEffect(() => {
    load();
    // Fetch bank accounts for bill payment selector
    const uid = auth.currentUser?.uid; if (!uid) return;
    getDocs(query(collection(db, 'bankaccounts'), where('userId', '==', uid)))
      .then(snap => setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  const ch = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const add = async () => {
    if (!form.description || !form.amount) { toast.error('Fill description and amount'); return; }
    setSaving(true);
    try {
      const amt = parseFloat(form.amount);
      await txnService.create({ cardId: card.id, ...form, amount: amt });
      // Update card outstanding
      const newOutstanding = form.type === 'debit'
        ? (parseFloat(card.outstanding || 0) + amt)
        : Math.max(0, parseFloat(card.outstanding || 0) - amt);
      await cardsService.update(card.id, { outstanding: newOutstanding });

      // If credit (bill payment) and a bank is selected → deduct from that bank
      if (form.type === 'credit' && form.paidFromBankId) {
        const bankRef = doc(db, 'bankaccounts', form.paidFromBankId);
        const bankSnap = await getDoc(bankRef);
        if (bankSnap.exists()) {
          const currentBal = parseFloat(bankSnap.data().balance) || 0;
          await updateDoc(bankRef, { balance: currentBal - amt });
          const bankName = bankSnap.data().name;
          toast.success(`₹${fmt(amt)} deducted from ${bankName} for card payment`);
        }
      } else {
        toast.success('Transaction added!');
      }

      setForm({ date: today(), description: '', amount: '', type: 'debit', category: '', paidFromBankId: '' });
      load();
    } catch { toast.error('Failed'); }
    finally { setSaving(false); }
  };

  const del = async () => { try { await txnService.delete(delId); toast.success('Deleted'); setDelId(null); load(); } catch { toast.error('Failed'); } };

  const totalDebits = txns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const totalCredits = txns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      {/* Card summary */}
      <div style={{ background: card.color || 'var(--blue)', borderRadius: 14, padding: 16, marginBottom: 16, color: '#fff' }}>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 4 }}>{card.bank} · {card.network} · ****{card.last4}</div>
        <div style={{ fontSize: 20, fontWeight: 900 }}>{card.name}</div>
        {card.type === 'Credit Card' && (
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><div style={{ fontSize: 10, opacity: 0.75 }}>Outstanding</div><div style={{ fontSize: 14, fontWeight: 800 }}>{fmt(card.outstanding || 0)}</div></div>
            <div><div style={{ fontSize: 10, opacity: 0.75 }}>Credit Limit</div><div style={{ fontSize: 14, fontWeight: 800 }}>{fmt(card.creditLimit || 0)}</div></div>
            <div><div style={{ fontSize: 10, opacity: 0.75 }}>Min Due</div><div style={{ fontSize: 14, fontWeight: 800 }}>{fmt(card.minDue || 0)}</div></div>
          </div>
        )}
        {card.type !== 'Credit Card' && (
          <div style={{ marginTop: 8 }}><div style={{ fontSize: 10, opacity: 0.75 }}>Available Balance</div><div style={{ fontSize: 18, fontWeight: 900 }}>{fmt(card.outstanding || 0)}</div></div>
        )}
      </div>

      {/* Add transaction */}
      <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div className="fs-13 fw-700 mb-2">+ Add Transaction</div>
        <div className="frow">
          <div className="fg"><label className="fl">Date</label><DateStepper name="date" value={form.date} onChange={ch} max={today()} /></div>
          <div className="fg">
            <label className="fl">Type</label>
            <div className="flex gap-2">
              {[{ key: 'debit', label: '💸 Spent', c: 'var(--red)' }, { key: 'credit', label: '✅ Payment', c: 'var(--green)' }].map(t => (
                <button key={t.key} type="button" onClick={() => setForm(p => ({ ...p, type: t.key }))}
                  style={{ flex: 1, padding: '6px', borderRadius: 8, border: `2px solid ${form.type === t.key ? t.c : 'var(--border2)'}`, background: form.type === t.key ? t.c + '18' : 'var(--bg3)', cursor: 'pointer', fontWeight: 700, fontSize: 11, color: form.type === t.key ? t.c : 'var(--t2)' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="frow">
          <div className="fg"><label className="fl">Description</label><input className="fi" name="description" value={form.description} onChange={ch} placeholder="e.g. Swiggy order, EMI payment" /></div>
          <div className="fg"><label className="fl">Amount (₹)</label><input className="fi" type="number" name="amount" value={form.amount} onChange={ch} placeholder="0.00" min="0" /></div>
        </div>
        <div className="fg"><label className="fl">Category (optional)</label><input className="fi" name="category" value={form.category} onChange={ch} placeholder="e.g. Food, Shopping, EMI" /></div>

        {/* Bank selector — only shown for credit/payment transactions */}
        {form.type === 'credit' && (
          <div className="fg">
            <label className="fl">
              Paid from Bank Account
              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--t3)', fontWeight: 400 }}>(deducted from bank balance)</span>
            </label>
            {banks.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4 }}>
                {banks.map(b => (
                  <button key={b.id} type="button" onClick={() => setForm(p => ({ ...p, paidFromBankId: p.paidFromBankId === b.id ? '' : b.id }))}
                    style={{ padding: '7px 6px', borderRadius: 8, border: `2px solid ${form.paidFromBankId === b.id ? 'var(--green)' : 'var(--border2)'}`, background: form.paidFromBankId === b.id ? 'rgba(34,197,94,.12)' : 'var(--bg3)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: form.paidFromBankId === b.id ? 'var(--green)' : 'var(--t3)', textAlign: 'center', lineHeight: 1.4, transition: 'all .15s' }}>
                    <span style={{ fontSize: 13 }}>{b.icon || '🏦'}</span><br />{b.shortName || b.name}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--t3)', padding: '8px 0' }}>
                ℹ️ No bank accounts found. Add accounts in the <strong>Banking</strong> page to enable auto-deduction.
              </div>
            )}
            {form.paidFromBankId && (
              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>
                ✅ ₹{form.amount || '0'} will be deducted from <strong>{banks.find(b => b.id === form.paidFromBankId)?.name}</strong>
              </div>
            )}
          </div>
        )}

        <button className="btn btn-primary btn-sm mt-2" onClick={add} disabled={saving}>{saving ? <span className="spin" /> : null} Add</button>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ background: 'rgba(244,63,94,.08)', borderRadius: 8, padding: '8px 12px' }}>
          <div className="fs-11 text-muted">Total Spent</div>
          <div className="fw-800 fs-14 amt-r">{fmt(totalDebits)}</div>
        </div>
        <div style={{ background: 'rgba(34,197,94,.08)', borderRadius: 8, padding: '8px 12px' }}>
          <div className="fs-11 text-muted">Total Payments</div>
          <div className="fw-800 fs-14 amt-g">{fmt(totalCredits)}</div>
        </div>
      </div>

      {/* Transaction history */}
      {loading ? <div className="spin-center"><div className="spin" /></div>
        : txns.length === 0
          ? <div className="text-muted fs-13" style={{ textAlign: 'center', padding: 16 }}>No transactions yet</div>
          : <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Date</th><th>Description</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
              <tbody>{txns.map(t => (
                <tr key={t.id}>
                  <td className="font-mono fs-12 text-muted">{fmtDate(t.date)}</td>
                  <td className="fw-600 fs-13">{t.description}</td>
                  <td className="text-muted fs-12">{t.category || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={`fw-700 fs-13 ${t.type === 'debit' ? 'amt-r' : 'amt-g'}`}>
                      {t.type === 'debit' ? '-' : '+'}{fmt(t.amount)}
                    </span>
                  </td>
                  <td><button className="btn-icon" onClick={() => setDelId(t.id)}>🗑️</button></td>
                </tr>
              ))}</tbody>
            </table></div>
      }
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}

export default function CardsPage() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [txnCard, setTxnCard] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setCards(await cardsService.getAll()); }
    catch { toast.error('Failed to load cards'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async data => {
    try {
      if (edit) { await cardsService.update(edit.id, data); toast.success('Updated!'); }
      else { await cardsService.create(data); toast.success('Card added!'); }
      setModal(false); setEdit(null); load();
    } catch { toast.error('Failed to save'); }
  };

  const del = async () => {
    try { await cardsService.delete(delId); toast.success('Deleted'); setDelId(null); load(); }
    catch { toast.error('Failed'); }
  };

  const creditCards = cards.filter(c => c.type === 'Credit Card');
  const debitCards = cards.filter(c => c.type !== 'Credit Card');
  const totalLimit = creditCards.reduce((s, c) => s + (c.creditLimit || 0), 0);
  const totalOutstanding = creditCards.reduce((s, c) => s + (c.outstanding || 0), 0);
  const urgentCards = cards.filter(c => getCardStatus(c).urgent);

  if (loading) return <div className="spin-center"><div className="spin spin-lg" /></div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">💳 Card Management</div>
          <div className="page-sub">{cards.length} cards · {creditCards.length} credit · {debitCards.length} debit/prepaid</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setModal(true); }}>+ Add Card</button>
      </div>

      {/* Stats */}
      {creditCards.length > 0 && (
        <div className="stats mb-4">
          {[
            { icon: '💳', label: 'Total Credit Limit', val: fmt(totalLimit), c: 'var(--blue)' },
            { icon: '📊', label: 'Total Outstanding', val: fmt(totalOutstanding), c: 'var(--red)' },
            { icon: '📈', label: 'Utilisation', val: totalLimit > 0 ? `${((totalOutstanding / totalLimit) * 100).toFixed(1)}%` : '0%', c: totalOutstanding / totalLimit > 0.3 ? 'var(--orange)' : 'var(--green)' },
            { icon: '⚠️', label: 'Due Soon', val: urgentCards.length, c: urgentCards.length > 0 ? 'var(--red)' : 'var(--t3)' },
          ].map((s, i) => (
            <div key={i} className="stat" style={{ '--c': s.c }}>
              <div className="stat-icon">{s.icon}</div>
              <div className="stat-val" style={{ color: s.c }}>{s.val}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Due Soon Alert */}
      {urgentCards.length > 0 && (
        <div style={{ background: 'rgba(244,63,94,.08)', border: '1px solid rgba(244,63,94,.25)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div className="fw-800 fs-13 mb-2" style={{ color: 'var(--red)' }}>⚠️ Payment Due Soon!</div>
          {urgentCards.map(c => {
            const st = getCardStatus(c);
            return (
              <div key={c.id} className="flex justify-between items-center fs-13 mb-1">
                <span className="fw-600">{c.name} (****{c.last4})</span>
                <span style={{ color: st.color }}>{st.label} · Min due: {fmt(c.minDue || 0)}</span>
              </div>
            );
          })}
        </div>
      )}

      {cards.length === 0
        ? <div className="card"><div className="empty"><div className="empty-icon">💳</div><div className="empty-title">No cards added yet</div><div className="empty-sub">Add your credit or debit cards to track spending and due dates</div></div></div>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {cards.map(card => {
              const status = getCardStatus(card);
              const utilPct = card.creditLimit > 0 ? Math.min(100, (card.outstanding / card.creditLimit) * 100) : 0;
              return (
                <div key={card.id} style={{ background: 'var(--bg2)', borderRadius: 16, overflow: 'hidden', border: `1px solid ${status.urgent ? 'rgba(244,63,94,.3)' : 'var(--border)'}` }}>
                  {/* Card visual header */}
                  <div style={{ background: card.color || 'var(--blue)', padding: '16px 18px', color: '#fff', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>{card.type}</div>
                        <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2 }}>{card.name}</div>
                      </div>
                      <div style={{ fontSize: 22, opacity: 0.9 }}>
                        {card.type === 'Credit Card' ? '💳' : '🏧'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div style={{ fontSize: 13, opacity: 0.85, letterSpacing: 2 }}>**** **** **** {card.last4 || '••••'}</div>
                      <div style={{ fontSize: 11, opacity: 0.8 }}>{card.network}</div>
                    </div>
                  </div>

                  {/* Card info */}
                  <div style={{ padding: 14 }}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-muted fs-12">{card.bank}</span>
                      <span style={{ background: status.color + '20', color: status.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{status.label}</span>
                    </div>

                    {card.type === 'Credit Card' && (
                      <>
                        <div className="flex justify-between fs-12 mb-1">
                          <span className="text-muted">Outstanding</span>
                          <span className="fw-700 amt-r">{fmt(card.outstanding || 0)}</span>
                        </div>
                        <div className="flex justify-between fs-12 mb-2">
                          <span className="text-muted">Credit Limit</span>
                          <span className="fw-700">{fmt(card.creditLimit || 0)}</span>
                        </div>
                        <div style={{ background: 'var(--bg4)', borderRadius: 6, height: 6, overflow: 'hidden', marginBottom: 8 }}>
                          <div style={{ height: '100%', width: `${utilPct}%`, background: utilPct > 60 ? 'var(--red)' : utilPct > 30 ? 'var(--orange)' : 'var(--green)', borderRadius: 6, transition: 'width .5s' }} />
                        </div>
                        <div className="flex justify-between fs-11 text-muted mb-2">
                          <span>{utilPct.toFixed(1)}% utilised</span>
                          <span>Min due: <span className="fw-700" style={{ color: 'var(--text)' }}>{fmt(card.minDue || 0)}</span></span>
                        </div>
                        {card.billingDate && (
                          <div className="fs-11 text-muted">Statement: {card.billingDate}th · Due: {(parseInt(card.billingDate) + parseInt(card.graceDays || 15)) > 31 ? (parseInt(card.billingDate) + parseInt(card.graceDays || 15) - 31) : (parseInt(card.billingDate) + parseInt(card.graceDays || 15))}th</div>
                        )}
                      </>
                    )}

                    {card.type !== 'Credit Card' && (
                      <div className="flex justify-between fs-13 mb-1">
                        <span className="text-muted">Available Balance</span>
                        <span className="fw-700 amt-g">{fmt(card.outstanding || 0)}</span>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setTxnCard(card)}>💳 Transactions</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEdit(card); setModal(true); }}>✏️</button>
                      <button className="btn-icon" onClick={() => setDelId(card.id)}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      {/* Usage tip */}
      {cards.length > 0 && (
        <div style={{ background: 'rgba(77,158,255,.06)', border: '1px solid rgba(77,158,255,.15)', borderRadius: 10, padding: '10px 16px', marginTop: 16, fontSize: 12, color: 'var(--t2)' }}>
          💡 <strong>Tip:</strong> When adding expenses in the Expenses page, tag them to a card using the "Paid Via" field. Transactions added here update the outstanding balance automatically.
        </div>
      )}

      {modal && (
        <Modal title={edit ? '✏️ Edit Card' : '➕ Add Card'} onClose={() => { setModal(false); setEdit(null); }}>
          <CardForm item={edit} onSave={save} onClose={() => { setModal(false); setEdit(null); }} />
        </Modal>
      )}
      {txnCard && (
        <Modal title={`💳 ${txnCard.name}`} onClose={() => { setTxnCard(null); load(); }}>
          <CardTxnModal card={txnCard} onClose={() => { setTxnCard(null); load(); }} />
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}