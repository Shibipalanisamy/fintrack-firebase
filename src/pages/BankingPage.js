import { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../utils/firebase';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, getDocs, Timestamp, getDoc
} from 'firebase/firestore';
import { fmt, fmtDate, fmtDateInput, today } from '../utils/helpers';
import { Modal, ConfirmDelete, DateStepper } from '../components/UI';
import toast from 'react-hot-toast';

// ─── safe uid (never crashes if not logged in) ────────────
const uid = () => auth.currentUser?.uid || null;

const BANK_COLORS = [
  '#378ADD', '#E24B4A', '#22c55e', '#f97316', '#a78bfa',
  '#fb923c', '#0F6E56', '#f43f5e', '#fbbf24', '#38bdf8'
];
const BANK_ICONS = ['🏦', '🏧', '💳', '🏛️', '💰', '🏢', '🌐', '💵'];

// ─── bankService ──────────────────────────────────────────
const bankService = {
  async getAll() {
    const u = uid(); if (!u) return [];
    try {
      const q = query(collection(db, 'bankaccounts'), where('userId', '==', u));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
    } catch { return []; }
  },
  async create(data) {
    const u = uid(); if (!u) throw new Error('Not logged in');
    return addDoc(collection(db, 'bankaccounts'), { ...data, userId: u, createdAt: Timestamp.now() });
  },
  async update(id, data) { return updateDoc(doc(db, 'bankaccounts', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'bankaccounts', id)); },
  async adjustBalance(id, delta) {
    try {
      const ref = doc(db, 'bankaccounts', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const current = parseFloat(snap.data().balance) || 0;
      return updateDoc(ref, { balance: current + delta });
    } catch (e) { console.error('adjustBalance failed', e); }
  }
};

// ─── bankTxnService ────────────────────────────────────────
// NO orderBy — avoids needing a composite Firestore index.
// Sort client-side instead.
const bankTxnService = {
  async getAll(filters = {}) {
    const u = uid(); if (!u) return [];
    try {
      const q = query(collection(db, 'banktransactions'), where('userId', '==', u));
      const snap = await getDocs(q);
      let docs = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        date: d.data().date?.toDate?.() || new Date(d.data().date || Date.now())
      }));
      docs.sort((a, b) => new Date(b.date) - new Date(a.date));
      if (filters.accountId)
        docs = docs.filter(d => d.fromAccountId === filters.accountId || d.toAccountId === filters.accountId);
      if (filters.type)
        docs = docs.filter(d => d.type === filters.type);
      if (filters.dateFrom && filters.dateTo) {
        const from = new Date(filters.dateFrom);
        const to = new Date(filters.dateTo); to.setHours(23, 59, 59, 999);
        docs = docs.filter(d => new Date(d.date) >= from && new Date(d.date) <= to);
      }
      return docs;
    } catch (e) {
      console.warn('bankTxnService: collection may not exist yet —', e.message);
      return [];
    }
  },
  async create(data) {
    const u = uid(); if (!u) throw new Error('Not logged in');
    return addDoc(collection(db, 'banktransactions'), {
      ...data, userId: u,
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now()
    });
  },
  async delete(id) { return deleteDoc(doc(db, 'banktransactions', id)); }
};

// ─── friendService ────────────────────────────────────────
// NO orderBy — sort client-side
const friendService = {
  async getAll() {
    const u = uid(); if (!u) return [];
    try {
      const q = query(collection(db, 'friendtransfers'), where('userId', '==', u));
      const snap = await getDocs(q);
      return snap.docs
        .map(d => ({
          id: d.id, ...d.data(),
          date: d.data().date?.toDate?.() || new Date(d.data().date || Date.now())
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (e) {
      console.warn('friendService: collection may not exist yet —', e.message);
      return [];
    }
  },
  async create(data) {
    const u = uid(); if (!u) throw new Error('Not logged in');
    return addDoc(collection(db, 'friendtransfers'), {
      ...data, userId: u,
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now()
    });
  },
  async update(id, data) {
    const clean = { ...data };
    if (clean.date instanceof Date) clean.date = Timestamp.fromDate(clean.date);
    return updateDoc(doc(db, 'friendtransfers', id), clean);
  },
  async delete(id) { return deleteDoc(doc(db, 'friendtransfers', id)); }
};

// ─── computeSyncedBalance ─────────────────────────────────
async function computeSyncedBalance(bankName, openingBalance) {
  const u = uid(); if (!u) return parseFloat(openingBalance) || 0;
  try {
    const bn = bankName.toLowerCase();

    const [incSnap, expSnap, invSnap, txnSnap] = await Promise.all([
      getDocs(query(collection(db, 'income'),       where('userId', '==', u))),
      getDocs(query(collection(db, 'expenses'),     where('userId', '==', u))),
      getDocs(query(collection(db, 'investments'),  where('userId', '==', u))),
      getDocs(query(collection(db, 'banktransactions'), where('userId', '==', u))),
    ]);

    const incTotal = incSnap.docs
      .filter(d => (d.data().bankAccount || '').toLowerCase() === bn)
      .reduce((s, d) => s + (parseFloat(d.data().amount) || 0), 0);

    const expTotal = expSnap.docs
      .filter(d => {
        const pv = (d.data().paidVia || '').toLowerCase();
        return pv === bn || pv.startsWith(bn);
      })
      .reduce((s, d) => s + (parseFloat(d.data().amount) || 0), 0);

    const invTotal = invSnap.docs
      .filter(d => (d.data().bankAccount || '').toLowerCase() === bn)
      .reduce((s, d) => {
        const cost = (parseFloat(d.data().purchasePrice) || 0) * (parseFloat(d.data().quantity) || 0);
        return s + cost;
      }, 0);

    let txnDelta = 0;
    txnSnap.docs.forEach(d => {
      const t = d.data();
      if ((t.fromAccountName || '').toLowerCase() === bn) txnDelta -= parseFloat(t.amount) || 0;
      if ((t.toAccountName   || '').toLowerCase() === bn) txnDelta += parseFloat(t.amount) || 0;
    });

    return parseFloat(openingBalance || 0) + incTotal - expTotal - invTotal + txnDelta;
  } catch (e) {
    console.warn('computeSyncedBalance error:', e.message);
    return parseFloat(openingBalance || 0);
  }
}

// ─── BankForm ─────────────────────────────────────────────
function BankForm({ item, onSave, onClose }) {
  const [f, setF] = useState({
    name: '', shortName: '', accountNumber: '', ifsc: '',
    balance: '', color: BANK_COLORS[0], icon: '🏦',
    accountType: 'Savings', notes: '',
    ...(item || {})
  });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async e => {
    e.preventDefault(); setLoading(true);
    try {
      const bal = parseFloat(f.balance) || 0;
      await onSave({ ...f, balance: bal, openingBalance: item ? (parseFloat(f.openingBalance) || bal) : bal });
    } finally { setLoading(false); }
  };
  return (
    <form onSubmit={submit}>
      <div className="frow">
        <div className="fg"><label className="fl">Bank / Account Name *</label><input className="fi" name="name" value={f.name} onChange={ch} placeholder="e.g. ICICI Bank, SBI Savings" required /></div>
        <div className="fg"><label className="fl">Short Name</label><input className="fi" name="shortName" value={f.shortName} onChange={ch} placeholder="e.g. ICICI, SBI" /></div>
      </div>
      <div className="frow">
        <div className="fg">
          <label className="fl">Account Type</label>
          <select className="fs" name="accountType" value={f.accountType} onChange={ch}>
            {['Savings', 'Current', 'Salary', 'NRE', 'NRO', 'Cash Wallet', 'Digital Wallet'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="fg"><label className="fl">Opening / Current Balance (₹) *</label><input className="fi" type="number" name="balance" value={f.balance} onChange={ch} placeholder="0.00" step="0.01" required /></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="fl">Account Number (last 4)</label><input className="fi" name="accountNumber" value={f.accountNumber} onChange={ch} placeholder="e.g. 4521" maxLength={4} /></div>
        <div className="fg"><label className="fl">IFSC Code</label><input className="fi" name="ifsc" value={f.ifsc} onChange={ch} placeholder="e.g. ICIC0001234" /></div>
      </div>
      <div className="fg">
        <label className="fl">Card Color</label>
        <div className="flex gap-2" style={{ marginTop: 6, flexWrap: 'wrap' }}>
          {BANK_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setF(p => ({ ...p, color: c }))}
              style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `3px solid ${f.color === c ? 'var(--text)' : 'transparent'}`, cursor: 'pointer' }} />
          ))}
        </div>
      </div>
      <div className="fg">
        <label className="fl">Icon</label>
        <div className="flex gap-2" style={{ marginTop: 6, flexWrap: 'wrap' }}>
          {BANK_ICONS.map(ic => (
            <button key={ic} type="button" onClick={() => setF(p => ({ ...p, icon: ic }))}
              style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${f.icon === ic ? 'var(--blue)' : 'var(--border2)'}`, background: f.icon === ic ? 'rgba(77,158,255,.15)' : 'var(--bg3)', fontSize: 18, cursor: 'pointer' }}>
              {ic}
            </button>
          ))}
        </div>
      </div>
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" name="notes" value={f.notes} onChange={ch} rows={2} /></div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spin" /> : null}{item ? 'Update Account' : 'Add Account'}</button>
      </div>
    </form>
  );
}

// ─── TransferForm ─────────────────────────────────────────
function TransferForm({ banks, onSave, onClose }) {
  const bankList = banks.filter(b => b.id);
  const [f, setF] = useState({
    date: today(),
    fromAccountId: bankList[0]?.id || '',
    toAccountId: bankList[1]?.id || bankList[0]?.id || '',
    amount: '', notes: ''
  });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const fromBank = bankList.find(b => b.id === f.fromAccountId);
  const submit = async e => {
    e.preventDefault();
    if (f.fromAccountId === f.toAccountId) { toast.error('Source and destination must be different'); return; }
    const amt = parseFloat(f.amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setLoading(true);
    try { await onSave({ ...f, amount: amt, type: 'transfer' }); }
    finally { setLoading(false); }
  };
  return (
    <form onSubmit={submit}>
      <div className="fg"><label className="fl">Date</label><DateStepper name="date" value={f.date} onChange={ch} required max={today()} /></div>
      <div className="frow">
        <div className="fg">
          <label className="fl">From Account</label>
          <select className="fs" name="fromAccountId" value={f.fromAccountId} onChange={ch} required>
            {bankList.map(b => <option key={b.id} value={b.id}>{b.icon || '🏦'} {b.name} (₹{fmt(b.balance)})</option>)}
          </select>
        </div>
        <div className="fg">
          <label className="fl">To Account</label>
          <select className="fs" name="toAccountId" value={f.toAccountId} onChange={ch} required>
            {bankList.filter(b => b.id !== f.fromAccountId).map(b => <option key={b.id} value={b.id}>{b.icon || '🏦'} {b.name} (₹{fmt(b.balance)})</option>)}
          </select>
        </div>
      </div>
      <div className="fg">
        <label className="fl">Amount (₹)</label>
        <input className="fi" type="number" name="amount" value={f.amount} onChange={ch} placeholder="0.00" step="0.01" min="0" required />
        {fromBank && f.amount && parseFloat(f.amount) > fromBank.balance &&
          <div style={{ marginTop: 5, fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>⚠️ Insufficient balance in {fromBank.name}</div>}
      </div>
      <div className="fg"><label className="fl">Notes</label><input className="fi" name="notes" value={f.notes} onChange={ch} placeholder="Optional note" /></div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spin" /> : null}Transfer</button>
      </div>
    </form>
  );
}

// ─── WithdrawalForm ───────────────────────────────────────
function WithdrawalForm({ banks, onSave, onClose }) {
  const bankList = banks.filter(b => b.id);
  const cashWallet = bankList.find(b => b.accountType === 'Cash Wallet' || b.name.toLowerCase().includes('cash'));
  const nonCash = bankList.filter(b => b.accountType !== 'Cash Wallet' && !b.name.toLowerCase().includes('cash'));
  const [f, setF] = useState({ date: today(), fromAccountId: nonCash[0]?.id || '', amount: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async e => {
    e.preventDefault();
    const amt = parseFloat(f.amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setLoading(true);
    try { await onSave({ ...f, amount: amt, type: 'withdrawal', toAccountId: cashWallet?.id || null }); }
    finally { setLoading(false); }
  };
  return (
    <form onSubmit={submit}>
      <div className="fg"><label className="fl">Date</label><DateStepper name="date" value={f.date} onChange={ch} required max={today()} /></div>
      <div className="fg">
        <label className="fl">From Bank Account</label>
        <select className="fs" name="fromAccountId" value={f.fromAccountId} onChange={ch} required>
          {nonCash.map(b => <option key={b.id} value={b.id}>{b.icon || '🏦'} {b.name} (₹{fmt(b.balance)})</option>)}
        </select>
      </div>
      <div className="fg"><label className="fl">Amount (₹)</label><input className="fi" type="number" name="amount" value={f.amount} onChange={ch} placeholder="0.00" step="0.01" min="0" required /></div>
      <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
        {cashWallet ? <span>💵 Will be added to <strong>{cashWallet.name}</strong></span> : <span className="text-muted">ℹ️ Add a "Cash Wallet" account to auto-track withdrawn cash</span>}
      </div>
      <div className="fg"><label className="fl">Notes</label><input className="fi" name="notes" value={f.notes} onChange={ch} placeholder="ATM withdrawal, cash for expenses..." /></div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spin" /> : null}Withdraw</button>
      </div>
    </form>
  );
}

// ─── FriendForm ───────────────────────────────────────────
function FriendForm({ item, banks, onSave, onClose }) {
  const bankList = banks.filter(b => b.id);
  const [f, setF] = useState({
    date: today(), name: '', amount: '', type: 'given',
    bankAccountId: bankList[0]?.id || '', notes: '', status: 'pending',
    ...(item ? { ...item, date: fmtDateInput(item.date) } : {})
  });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async e => {
    e.preventDefault();
    const amt = parseFloat(f.amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (!f.name.trim()) { toast.error('Enter friend name'); return; }
    setLoading(true);
    try { await onSave({ ...f, amount: amt }); }
    finally { setLoading(false); }
  };
  return (
    <form onSubmit={submit}>
      <div className="frow">
        <div className="fg"><label className="fl">Date</label><DateStepper name="date" value={f.date} onChange={ch} required max={today()} /></div>
        <div className="fg">
          <label className="fl">Type</label>
          <div className="flex gap-2" style={{ marginTop: 4 }}>
            {[{ v: 'given', label: '💸 Given (Lent)', c: '#f43f5e' }, { v: 'received', label: '💵 Received (Borrowed)', c: '#22c55e' }].map(opt => (
              <button key={opt.v} type="button" onClick={() => setF(p => ({ ...p, type: opt.v }))}
                style={{ flex: 1, padding: '9px 8px', borderRadius: 10, border: `2px solid ${f.type === opt.v ? opt.c : 'var(--border2)'}`, background: f.type === opt.v ? opt.c + '18' : 'var(--bg3)', cursor: 'pointer', fontSize: 12, fontWeight: 800, color: f.type === opt.v ? opt.c : 'var(--t3)' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="frow">
        <div className="fg"><label className="fl">Friend's Name</label><input className="fi" name="name" value={f.name} onChange={ch} placeholder="e.g. Ravi, Priya" required /></div>
        <div className="fg"><label className="fl">Amount (₹)</label><input className="fi" type="number" name="amount" value={f.amount} onChange={ch} placeholder="0.00" step="0.01" min="0" required /></div>
      </div>
      {bankList.length > 0 && (
        <div className="fg">
          <label className="fl">Bank Account</label>
          <select className="fs" name="bankAccountId" value={f.bankAccountId} onChange={ch}>
            {bankList.map(b => <option key={b.id} value={b.id}>{b.icon || '🏦'} {b.name}</option>)}
          </select>
        </div>
      )}
      <div style={{ background: f.type === 'given' ? 'rgba(244,63,94,.07)' : 'rgba(34,197,94,.07)', border: `1px solid ${f.type === 'given' ? 'rgba(244,63,94,.2)' : 'rgba(34,197,94,.2)'}`, borderRadius: 10, padding: '9px 14px', marginBottom: 12, fontSize: 12, fontWeight: 700, color: f.type === 'given' ? 'var(--red)' : 'var(--green)' }}>
        {f.type === 'given' ? '📤 Amount will be DEDUCTED from selected bank' : '📥 Amount will be ADDED to selected bank'}
      </div>
      <div className="fg"><label className="fl">Notes / Reason</label><textarea className="fta" name="notes" value={f.notes} onChange={ch} rows={2} placeholder="Optional reason" /></div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spin" /> : null}{item ? 'Update' : 'Add Friend Transfer'}</button>
      </div>
    </form>
  );
}

// ─── BankCard visual ──────────────────────────────────────
function BankCard({ bank, isSelected, onClick, syncedBalance }) {
  const displayBalance = syncedBalance !== undefined ? syncedBalance : bank.balance;
  return (
    <div onClick={onClick} style={{
      background: `linear-gradient(135deg, ${bank.color || '#378ADD'}, ${bank.color || '#378ADD'}bb)`,
      borderRadius: 18, padding: '20px 22px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
      border: `3px solid ${isSelected ? '#fff' : 'transparent'}`,
      boxShadow: isSelected ? `0 0 0 3px ${bank.color || '#378ADD'}, 0 8px 32px rgba(0,0,0,.25)` : '0 4px 20px rgba(0,0,0,.15)',
      transition: 'all .2s', minWidth: 220, flex: '0 0 auto'
    }}>
      <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
      <div style={{ position: 'absolute', bottom: -20, right: 20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 28 }}>{bank.icon || '🏦'}</div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginTop: 4 }}>{bank.accountType || 'Savings'}</div>
          </div>
          {bank.accountNumber && <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, fontFamily: 'monospace' }}>••••{bank.accountNumber}</div>}
        </div>
        <div>
          <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Balance</div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>₹{fmt(displayBalance)}</div>
        </div>
        <div style={{ marginTop: 12, color: 'rgba(255,255,255,.9)', fontSize: 13, fontWeight: 700 }}>{bank.name}</div>
      </div>
    </div>
  );
}

// ─── SyncBadge ────────────────────────────────────────────
function SyncBadge({ type }) {
  const MAP = {
    income:          { bg: 'rgba(34,197,94,.12)',  color: '#22c55e', icon: '💵', label: 'Income' },
    expense:         { bg: 'rgba(244,63,94,.12)',  color: '#f43f5e', icon: '💸', label: 'Expense' },
    investment:      { bg: 'rgba(147,197,253,.15)',color: '#93c5fd', icon: '📈', label: 'Investment' },
    transfer:        { bg: 'rgba(251,191,36,.12)', color: '#fbbf24', icon: '🔄', label: 'Transfer' },
    withdrawal:      { bg: 'rgba(248,113,113,.12)',color: '#fb923c', icon: '🏧', label: 'Withdrawal' },
    friend_given:    { bg: 'rgba(244,63,94,.12)',  color: '#f43f5e', icon: '🤝', label: 'Lent' },
    friend_received: { bg: 'rgba(34,197,94,.12)',  color: '#22c55e', icon: '🤝', label: 'Borrowed' },
  };
  const s = MAP[type] || MAP.expense;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {s.icon} {s.label}
    </span>
  );
}

// ─── Main BankingPage ─────────────────────────────────────
export default function BankingPage() {
  const [banks, setBanks]                   = useState([]);
  const [txns, setTxns]                     = useState([]);
  const [friends, setFriends]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [syncing, setSyncing]               = useState(false);
  const [syncedBalances, setSyncedBalances] = useState({});
  const [selectedBank, setSelectedBank]     = useState(null);
  const [authReady, setAuthReady]           = useState(!!auth.currentUser);
  const [error, setError]                   = useState(null);

  // Modals
  const [bankModal, setBankModal]           = useState(false);
  const [editBank, setEditBank]             = useState(null);
  const [delBankId, setDelBankId]           = useState(null);
  const [transferModal, setTransferModal]   = useState(false);
  const [withdrawModal, setWithdrawModal]   = useState(false);
  const [friendModal, setFriendModal]       = useState(false);
  const [editFriend, setEditFriend]         = useState(null);
  const [delFriendId, setDelFriendId]       = useState(null);
  const [settleId, setSettleId]             = useState(null);

  // Tabs / filters
  const [tab, setTab]                       = useState('overview');
  const [txnFilter, setTxnFilter]           = useState({ accountId: '', type: '', dateFrom: '', dateTo: '' });
  const [friendFilter, setFriendFilter]     = useState('all');

  // ── Wait for Firebase Auth ────────────────────────────
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(user => {
      if (user) {
        setAuthReady(true);
      } else {
        setLoading(false);
        setError('Please sign in to access Banking.');
      }
    });
    return () => unsub();
  }, []);

  // ── Load data ─────────────────────────────────────────
  const load = useCallback(async () => {
    if (!uid()) return;
    setLoading(true); setError(null);
    try {
      const [b, t, f] = await Promise.all([
        bankService.getAll(),
        bankTxnService.getAll(),
        friendService.getAll()
      ]);
      console.log('Banks:', b);          // 👈 add
    console.log('Transactions:', t);   // 👈 add
    console.log('Friends:', f);        // 👈 add
    console.log('uid:', uid()); 

      setBanks(b); setTxns(t); setFriends(f);
      if (b.length > 0) setSelectedBank(prev => prev || b[0].id);
    } catch (e) {
      console.error('BankingPage load error:', e);
      setError('Failed to load. Please refresh the page.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authReady) load(); }, [authReady, load]);

  // ── Sync balances ─────────────────────────────────────
  const syncAllBalances = useCallback(async (bankList) => {
    const list = bankList || banks;
    if (!list.length) return;
    setSyncing(true);
    try {
      const balances = {};
      await Promise.all(list.map(async bank => {
        balances[bank.id] = await computeSyncedBalance(bank.name, bank.openingBalance ?? bank.balance);
      }));
      setSyncedBalances(balances);
    } catch (e) { console.error('sync error:', e); }
    finally { setSyncing(false); }
  }, [banks]);

  useEffect(() => { if (banks.length > 0) syncAllBalances(banks); }, [banks.length]); // eslint-disable-line

  // ── CRUD banks ────────────────────────────────────────
  const saveBank = async data => {
    try {
      if (editBank) { await bankService.update(editBank.id, data); toast.success('Account updated!'); }
      else { await bankService.create(data); toast.success('Bank account added! 🏦'); }
      setBankModal(false); setEditBank(null); load();
    } catch (e) { toast.error('Failed: ' + e.message); }
  };
  const deleteBank = async () => {
    try { await bankService.delete(delBankId); toast.success('Deleted'); setDelBankId(null); load(); }
    catch { toast.error('Failed to delete'); }
  };

  // ── Transfer ──────────────────────────────────────────
  const doTransfer = async data => {
    const from = banks.find(b => b.id === data.fromAccountId);
    const to   = banks.find(b => b.id === data.toAccountId);
    if (!from || !to) { toast.error('Invalid accounts'); return; }
    try {
      await bankService.adjustBalance(from.id, -data.amount);
      await bankService.adjustBalance(to.id,    data.amount);
      await bankTxnService.create({
        type: 'transfer', date: data.date, amount: data.amount,
        fromAccountId: from.id, fromAccountName: from.name,
        toAccountId: to.id,     toAccountName: to.name,
        notes: data.notes || `Transfer: ${from.name} → ${to.name}`, source: 'banking'
      });
      toast.success(`₹${fmt(data.amount)} transferred: ${from.name} → ${to.name}`);
      setTransferModal(false); load();
    } catch (e) { toast.error('Transfer failed: ' + e.message); }
  };

  // ── Withdrawal ────────────────────────────────────────
  const doWithdrawal = async data => {
    const from = banks.find(b => b.id === data.fromAccountId);
    const cash = banks.find(b => b.accountType === 'Cash Wallet' || b.name.toLowerCase().includes('cash'));
    if (!from) { toast.error('Invalid account'); return; }
    try {
      await bankService.adjustBalance(from.id, -data.amount);
      if (cash) await bankService.adjustBalance(cash.id, data.amount);
      await bankTxnService.create({
        type: 'withdrawal', date: data.date, amount: data.amount,
        fromAccountId: from.id, fromAccountName: from.name,
        toAccountId: cash?.id || null, toAccountName: cash?.name || 'Cash',
        notes: data.notes || `ATM Withdrawal from ${from.name}`, source: 'banking'
      });
      toast.success(`₹${fmt(data.amount)} withdrawn from ${from.name}`);
      setWithdrawModal(false); load();
    } catch (e) { toast.error('Withdrawal failed: ' + e.message); }
  };

  // ── Friend transfer ───────────────────────────────────
  const saveFriend = async data => {
    const bank = banks.find(b => b.id === data.bankAccountId);
    try {
      if (editFriend) {
        await friendService.update(editFriend.id, data);
        toast.success('Updated!');
      } else {
        await friendService.create(data);
        if (bank) {
          const delta = data.type === 'given' ? -data.amount : data.amount;
          await bankService.adjustBalance(bank.id, delta);
          await bankTxnService.create({
            type: data.type === 'given' ? 'friend_given' : 'friend_received',
            date: data.date, amount: data.amount,
            fromAccountId: data.type === 'given' ? bank.id : null,
            fromAccountName: data.type === 'given' ? bank.name : data.name,
            toAccountId: data.type === 'received' ? bank.id : null,
            toAccountName: data.type === 'received' ? bank.name : data.name,
            notes: `${data.type === 'given' ? 'Lent to' : 'Borrowed from'} ${data.name}${data.notes ? ': ' + data.notes : ''}`,
            source: 'friend', friendName: data.name
          });
        }
        toast.success(data.type === 'given' ? `₹${fmt(data.amount)} lent to ${data.name}` : `₹${fmt(data.amount)} received from ${data.name}`);
      }
      setFriendModal(false); setEditFriend(null); load();
    } catch (e) { toast.error('Failed: ' + e.message); }
  };

  const settleFriend = async action => {
    const f = friends.find(x => x.id === settleId);
    if (!f) return;
    try {
      if (action === 'settle') { await friendService.update(f.id, { status: 'settled', settledOn: today() }); toast.success('Marked as settled ✅'); }
      else { await friendService.delete(f.id); toast.success('Deleted'); }
      setSettleId(null); load();
    } catch { toast.error('Failed'); }
  };

  const deleteFriend = async () => {
    try { await friendService.delete(delFriendId); toast.success('Deleted'); setDelFriendId(null); load(); }
    catch { toast.error('Failed'); }
  };

  // ── Derived ───────────────────────────────────────────
  const totalBalance   = banks.reduce((s, b) => s + (parseFloat(syncedBalances[b.id] ?? b.balance) || 0), 0);
  const totalLedger    = banks.reduce((s, b) => s + (parseFloat(b.balance) || 0), 0);
  const pendingFriends = friends.filter(f => f.status !== 'settled');
  const lentTotal      = pendingFriends.filter(f => f.type === 'given').reduce((s, f) => s + parseFloat(f.amount || 0), 0);
  const borrowedTotal  = pendingFriends.filter(f => f.type === 'received').reduce((s, f) => s + parseFloat(f.amount || 0), 0);

  const filteredTxns = txns.filter(t => {
    if (txnFilter.accountId && t.fromAccountId !== txnFilter.accountId && t.toAccountId !== txnFilter.accountId) return false;
    if (txnFilter.type && t.type !== txnFilter.type) return false;
    if (txnFilter.dateFrom && new Date(t.date) < new Date(txnFilter.dateFrom)) return false;
    if (txnFilter.dateTo) { const to = new Date(txnFilter.dateTo); to.setHours(23,59,59,999); if (new Date(t.date) > to) return false; }
    return true;
  });

  const filteredFriends = friends.filter(f => {
    if (friendFilter === 'given')    return f.type === 'given';
    if (friendFilter === 'received') return f.type === 'received';
    if (friendFilter === 'pending')  return f.status !== 'settled';
    if (friendFilter === 'settled')  return f.status === 'settled';
    return true;
  });

  const selectedBankData = banks.find(b => b.id === selectedBank);
  const selectedBankTxns = txns.filter(t => t.fromAccountId === selectedBank || t.toAccountId === selectedBank).slice(0, 20);

  // ── Render guards ─────────────────────────────────────
  if (!authReady || loading) return <div className="spin-center"><div className="spin spin-lg" /></div>;
  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{error}</div>
      <button className="btn btn-primary" onClick={load}>Retry</button>
    </div>
  );

  // ── Main render ───────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="page-head">
        <div>
          <div className="page-title">🏦 Banking</div>
          <div className="page-sub">
            {banks.length} account{banks.length !== 1 ? 's' : ''} • Total: <span className="amt amt-g">₹{fmt(totalBalance)}</span>
            {syncing && <span className="text-muted fs-11" style={{ marginLeft: 8 }}>syncing…</span>}
          </div>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => syncAllBalances()} disabled={syncing}>
            {syncing ? <><span className="spin" style={{ width: 12, height: 12, borderWidth: 2 }} /> Syncing…</> : '🔄 Sync Balances'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setTransferModal(true)} disabled={banks.length < 2}>🔄 Transfer</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setWithdrawModal(true)} disabled={banks.length === 0}>🏧 Withdraw</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditBank(null); setBankModal(true); }}>+ Add Account</button>
        </div>
      </div>

      {/* Sync info bar */}
      <div style={{ background: 'rgba(77,158,255,.07)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16 }}>🔗</span>
        <div style={{ flex: 1 }}>
          <span className="fw-700" style={{ color: 'var(--blue)' }}>Auto-Sync Active — </span>
          <span className="text-muted">Income (bankAccount field) · Expenses (paidVia) · Investments (bankAccount) update balances automatically.</span>
        </div>
        <div className="flex gap-3" style={{ fontSize: 11, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>💵 Income → +</span>
          <span style={{ color: 'var(--red)', fontWeight: 700 }}>💸 Expense → −</span>
          <span style={{ color: '#93c5fd', fontWeight: 700 }}>📈 Investment → −</span>
        </div>
      </div>

      {/* Stats */}
      <div className="stats" style={{ marginBottom: 20 }}>
        {[
          { icon: '💰', label: 'Total Balance (Synced)', val: `₹${fmt(totalBalance)}`, c: 'var(--green)' },
          { icon: '🏦', label: 'Accounts',               val: banks.length,            c: 'var(--blue)' },
          { icon: '🤝', label: 'Money Lent Out',         val: `₹${fmt(lentTotal)}`,    c: 'var(--red)' },
          { icon: '💵', label: 'Money Borrowed',         val: `₹${fmt(borrowedTotal)}`,c: 'var(--orange)' },
        ].map((s, i) => (
          <div key={i} className="stat" style={{ '--c': s.c }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-val" style={{ color: s.c }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bank cards carousel */}
      {banks.length === 0 ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="empty">
            <div className="empty-icon">🏦</div>
            <div className="empty-title">No bank accounts yet</div>
            <div className="empty-sub">Add your first account to start tracking</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setBankModal(true)}>+ Add Bank Account</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8, marginBottom: 20 }}>
          {banks.map(b => (
            <BankCard key={b.id} bank={b} isSelected={selectedBank === b.id}
              onClick={() => setSelectedBank(b.id)} syncedBalance={syncedBalances[b.id]} />
          ))}
          <div onClick={() => setBankModal(true)}
            style={{ minWidth: 120, borderRadius: 18, border: '2px dashed var(--border2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: 'var(--t3)', fontSize: 13, fontWeight: 700, padding: '20px 16px', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}>
            <span style={{ fontSize: 28 }}>+</span><span>Add Account</span>
          </div>
        </div>
      )}

      {/* Selected bank detail */}
      {selectedBankData && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: selectedBankData.color || '#378ADD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{selectedBankData.icon || '🏦'}</div>
              <div>
                <div className="fw-800 fs-16">{selectedBankData.name}</div>
                <div className="text-muted fs-12">{selectedBankData.accountType}{selectedBankData.accountNumber ? ` ••••${selectedBankData.accountNumber}` : ''}{selectedBankData.ifsc ? ` · ${selectedBankData.ifsc}` : ''}</div>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <div style={{ textAlign: 'right', marginRight: 8 }}>
                <div className="text-muted fs-11">Synced Balance</div>
                <div className="fw-900 fs-18 amt-g">₹{fmt(syncedBalances[selectedBankData.id] ?? selectedBankData.balance)}</div>
              </div>
              <button className="btn-icon" onClick={() => { setEditBank(selectedBankData); setBankModal(true); }}>✏️</button>
              <button className="btn-icon" onClick={() => setDelBankId(selectedBankData.id)}>🗑️</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Opening Balance', val: selectedBankData.openingBalance ?? selectedBankData.balance, c: 'var(--blue)' },
              { label: 'Ledger Balance',  val: selectedBankData.balance,                                    c: 'var(--text)' },
              { label: 'Synced Balance',  val: syncedBalances[selectedBankData.id] ?? selectedBankData.balance, c: 'var(--green)' },
            ].map((x, i) => (
              <div key={i} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '8px 14px', flex: '1 1 140px' }}>
                <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{x.label}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: x.c }}>₹{fmt(x.val)}</div>
              </div>
            ))}
          </div>
          <div className="card-title">Recent Transactions</div>
          {selectedBankTxns.length === 0
            ? <div className="text-muted fs-13" style={{ padding: '12px 0' }}>No internal transactions yet. Transfers and withdrawals will appear here.</div>
            : <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Date</th><th>Type</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Effect</th></tr></thead>
                <tbody>{selectedBankTxns.map(t => {
                  const isDebit = t.fromAccountId === selectedBank;
                  return (
                    <tr key={t.id}>
                      <td className="font-mono fs-12 text-muted">{fmtDate(t.date)}</td>
                      <td><SyncBadge type={t.type} /></td>
                      <td className="fs-13">{t.notes || '—'}</td>
                      <td style={{ textAlign: 'right' }} className="fw-700">₹{fmt(t.amount)}</td>
                      <td style={{ textAlign: 'right' }} className={`fw-700 ${isDebit ? 'amt-r' : 'amt-g'}`}>{isDebit ? '−' : '+'}₹{fmt(t.amount)}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {[
          { key: 'overview',     label: '📊 All Accounts' },
          { key: 'transactions', label: '📋 Transaction Log' },
          { key: 'friends',      label: `🤝 Friend Transfers${pendingFriends.length > 0 ? ` (${pendingFriends.length})` : ''}` },
          { key: 'sync',         label: '🔗 Sync Details' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 14px', borderRadius: '8px 8px 0 0', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === t.key ? 'var(--bg3)' : 'transparent', color: tab === t.key ? 'var(--text)' : 'var(--t3)', borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gap: 12 }}>
            {banks.map(b => {
              const synced = syncedBalances[b.id] ?? b.balance;
              const diff = synced - b.balance;
              return (
                <div key={b.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: b.color || '#378ADD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>{b.icon || '🏦'}</div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div className="fw-800 fs-15">{b.name}</div>
                    <div className="flex gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
                      <span style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{b.accountType || 'Savings'}</span>
                      {b.accountNumber && <span className="text-muted fs-11">••••{b.accountNumber}</span>}
                    </div>
                  </div>
                  <div className="flex gap-5" style={{ flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}><div className="text-muted fs-10 fw-700">LEDGER</div><div className="fw-800 fs-15">₹{fmt(b.balance)}</div></div>
                    <div style={{ textAlign: 'center' }}><div className="text-muted fs-10 fw-700">SYNCED</div><div className="fw-800 fs-15 amt-g">₹{fmt(synced)}</div></div>
                    {Math.abs(diff) > 0.01 && <div style={{ textAlign: 'center' }}><div className="text-muted fs-10 fw-700">DIFF</div><div className={`fw-800 fs-13 ${diff >= 0 ? 'amt-g' : 'amt-r'}`}>{diff >= 0 ? '+' : ''}{fmt(diff)}</div></div>}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedBank(b.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>View</button>
                    <button className="btn-icon" onClick={() => { setEditBank(b); setBankModal(true); }}>✏️</button>
                    <button className="btn-icon" onClick={() => setDelBankId(b.id)}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
          {banks.length > 0 && (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 14, padding: '14px 20px', marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <span className="fw-800 fs-15">Total Across All Accounts</span>
              <div className="flex gap-6">
                <div style={{ textAlign: 'center' }}><div className="text-muted fs-11">Ledger</div><div className="fw-900 fs-17">₹{fmt(totalLedger)}</div></div>
                <div style={{ textAlign: 'center' }}><div className="text-muted fs-11">Synced</div><div className="fw-900 fs-17 amt-g">₹{fmt(totalBalance)}</div></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transaction log tab */}
      {tab === 'transactions' && (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            <select className="fs btn-sm" value={txnFilter.accountId} onChange={e => setTxnFilter(p => ({ ...p, accountId: e.target.value }))}>
              <option value="">All Accounts</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.icon || '🏦'} {b.name}</option>)}
            </select>
            <select className="fs btn-sm" value={txnFilter.type} onChange={e => setTxnFilter(p => ({ ...p, type: e.target.value }))}>
              <option value="">All Types</option>
              {['transfer', 'withdrawal', 'friend_given', 'friend_received'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="date" className="fi" style={{ width: 140, fontSize: 12 }} value={txnFilter.dateFrom} onChange={e => setTxnFilter(p => ({ ...p, dateFrom: e.target.value }))} />
            <span className="text-muted fs-12">→</span>
            <input type="date" className="fi" style={{ width: 140, fontSize: 12 }} value={txnFilter.dateTo} onChange={e => setTxnFilter(p => ({ ...p, dateTo: e.target.value }))} />
            {(txnFilter.accountId || txnFilter.type || txnFilter.dateFrom) &&
              <button className="btn btn-secondary btn-sm" onClick={() => setTxnFilter({ accountId: '', type: '', dateFrom: '', dateTo: '' })}>✕ Clear</button>}
          </div>
          {filteredTxns.length === 0
            ? <div className="card"><div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No transactions yet</div><div className="empty-sub">Transfers, withdrawals, and friend transactions appear here</div></div></div>
            : <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Date</th><th>Type</th><th>From</th><th>To</th><th style={{ textAlign: 'right' }}>Amount</th><th>Notes</th></tr></thead>
                <tbody>{filteredTxns.map(t => (
                  <tr key={t.id}>
                    <td className="font-mono fs-12 text-muted">{fmtDate(t.date)}</td>
                    <td><SyncBadge type={t.type} /></td>
                    <td className="fs-13 fw-600">{t.fromAccountName || '—'}</td>
                    <td className="fs-13 fw-600">{t.toAccountName || '—'}</td>
                    <td style={{ textAlign: 'right' }} className="fw-800">₹{fmt(t.amount)}</td>
                    <td className="text-muted fs-13">{t.notes || '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>}
        </div>
      )}

      {/* Friend transfers tab */}
      {tab === 'friends' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="fw-800 fs-15">🤝 Friend Money Tracking</div>
              <div className="text-muted fs-12">Track money lent or borrowed from friends</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditFriend(null); setFriendModal(true); }}>+ Add</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Lent',    val: `₹${fmt(lentTotal)}`,               c: 'var(--red)',    icon: '💸', sub: `${pendingFriends.filter(f => f.type === 'given').length} pending` },
              { label: 'Total Borrowed',val: `₹${fmt(borrowedTotal)}`,           c: 'var(--green)',  icon: '💵', sub: `${pendingFriends.filter(f => f.type === 'received').length} pending` },
              { label: 'Net Position',  val: `₹${fmt(lentTotal - borrowedTotal)}`,c: lentTotal >= borrowedTotal ? 'var(--red)' : 'var(--green)', icon: '⚖️', sub: lentTotal >= borrowedTotal ? 'You are owed' : 'You owe' },
              { label: 'Settled',       val: friends.filter(f => f.status === 'settled').length, c: 'var(--blue)', icon: '✅', sub: 'completed' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, borderLeft: `4px solid ${s.c}` }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                <div className="fw-900 fs-18" style={{ color: s.c }}>{s.val}</div>
                <div className="fw-700 fs-13">{s.label}</div>
                <div className="text-muted fs-11 mt-1">{s.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {[{ v: 'all', label: 'All' }, { v: 'given', label: '💸 Lent' }, { v: 'received', label: '💵 Borrowed' }, { v: 'pending', label: '⏳ Pending' }, { v: 'settled', label: '✅ Settled' }].map(opt => (
              <button key={opt.v} onClick={() => setFriendFilter(opt.v)}
                style={{ padding: '5px 14px', borderRadius: 20, border: `2px solid ${friendFilter === opt.v ? 'var(--blue)' : 'var(--border2)'}`, background: friendFilter === opt.v ? 'rgba(77,158,255,.15)' : 'var(--bg3)', color: friendFilter === opt.v ? 'var(--blue)' : 'var(--t2)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                {opt.label}
              </button>
            ))}
          </div>
          {filteredFriends.length === 0
            ? <div className="card"><div className="empty"><div className="empty-icon">🤝</div><div className="empty-title">No friend transfers</div><div className="empty-sub">Track money you lend or borrow from friends</div></div></div>
            : <div style={{ display: 'grid', gap: 10 }}>
                {filteredFriends.map(f => {
                  const isGiven = f.type === 'given', isSettled = f.status === 'settled';
                  return (
                    <div key={f.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px', borderLeft: `4px solid ${isSettled ? 'var(--t3)' : isGiven ? 'var(--red)' : 'var(--green)'}`, opacity: isSettled ? 0.7 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                            <div style={{ width: 38, height: 38, borderRadius: '50%', background: isGiven ? 'rgba(244,63,94,.15)' : 'rgba(34,197,94,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{isGiven ? '💸' : '💵'}</div>
                            <div><div className="fw-800 fs-15">{f.name}</div><div className="fs-12 text-muted">{fmtDate(f.date)}</div></div>
                            <span style={{ background: isGiven ? 'rgba(244,63,94,.1)' : 'rgba(34,197,94,.1)', color: isGiven ? 'var(--red)' : 'var(--green)', fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 20 }}>{isGiven ? 'Lent' : 'Borrowed'}</span>
                            {isSettled && <span style={{ background: 'rgba(148,163,184,.15)', color: 'var(--t3)', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20 }}>✅ Settled</span>}
                          </div>
                          {f.notes && <div className="fs-12 text-muted" style={{ fontStyle: 'italic', marginLeft: 48 }}>📝 {f.notes}</div>}
                          {isSettled && f.settledOn && <div className="fs-11 text-muted" style={{ marginLeft: 48 }}>Settled on {fmtDate(f.settledOn)}</div>}
                        </div>
                        <div className="flex items-center gap-3">
                          <div style={{ textAlign: 'right' }}>
                            <div className={`fw-900 fs-18 ${isGiven ? 'amt-r' : 'amt-g'}`}>₹{fmt(f.amount)}</div>
                            {f.bankAccountId && <div className="fs-11 text-muted">{banks.find(b => b.id === f.bankAccountId)?.name || ''}</div>}
                          </div>
                          <div className="flex gap-2">
                            {!isSettled && <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => setSettleId(f.id)}>✅ Settle</button>}
                            <button className="btn-icon" onClick={() => { setEditFriend(f); setFriendModal(true); }}>✏️</button>
                            <button className="btn-icon" onClick={() => setDelFriendId(f.id)}>🗑️</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>}
        </div>
      )}

      {/* Sync details tab */}
      {tab === 'sync' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="fw-800 fs-15">🔗 Cross-Module Sync Details</div>
              <div className="text-muted fs-12">Formula: Opening + Income − Expenses − Investments ± Transfers</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => syncAllBalances()} disabled={syncing}>
              {syncing ? <><span className="spin" style={{ width: 12, height: 12, borderWidth: 2 }} /> Syncing…</> : '🔄 Refresh'}
            </button>
          </div>
          {banks.length === 0
            ? <div className="card"><div className="empty"><div className="empty-icon">🔗</div><div className="empty-title">No accounts to sync</div></div></div>
            : <div style={{ display: 'grid', gap: 16 }}>
                {banks.map(b => (
                  <div key={b.id} className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: b.color || '#378ADD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{b.icon || '🏦'}</div>
                      <div>
                        <div className="fw-800 fs-15">{b.name}</div>
                        <div className="text-muted fs-12">Synced: <span className="amt-g fw-800">₹{fmt(syncedBalances[b.id] ?? b.balance)}</span></div>
                      </div>
                    </div>
                    <div style={{ background: 'rgba(77,158,255,.06)', border: '1px solid rgba(77,158,255,.15)', borderRadius: 10, padding: '12px 14px', fontSize: 12 }}>
                      <div className="fw-700 mb-2" style={{ color: 'var(--blue)' }}>🔗 How to link transactions to <strong>{b.name}</strong>:</div>
                      <div style={{ display: 'grid', gap: 7, color: 'var(--t2)' }}>
                        <div>💵 <strong>Income page</strong> → select "<strong>{b.name}</strong>" in the Bank Account field</div>
                        <div>💸 <strong>Expenses page</strong> → select "<strong>{b.name}</strong>" in Paid Via</div>
                        <div>📈 <strong>Portfolio page</strong> → set bankAccount to "<strong>{b.name}</strong>" when buying stocks</div>
                        <div>🔄 <strong>Transfers &amp; withdrawals</strong> → use buttons at the top of this page</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>}
        </div>
      )}

      {/* Modals */}
      {bankModal && (
        <Modal title={editBank ? '✏️ Edit Account' : '🏦 Add Bank Account'} onClose={() => { setBankModal(false); setEditBank(null); }}>
          <BankForm item={editBank} onSave={saveBank} onClose={() => { setBankModal(false); setEditBank(null); }} />
        </Modal>
      )}
      {transferModal && banks.length >= 2 && (
        <Modal title="🔄 Bank to Bank Transfer" onClose={() => setTransferModal(false)}>
          <TransferForm banks={banks} onSave={doTransfer} onClose={() => setTransferModal(false)} />
        </Modal>
      )}
      {withdrawModal && banks.length > 0 && (
        <Modal title="🏧 Cash Withdrawal" onClose={() => setWithdrawModal(false)}>
          <WithdrawalForm banks={banks} onSave={doWithdrawal} onClose={() => setWithdrawModal(false)} />
        </Modal>
      )}
      {friendModal && (
        <Modal title={editFriend ? '✏️ Edit Friend Transfer' : '🤝 Friend Money Transfer'} onClose={() => { setFriendModal(false); setEditFriend(null); }}>
          <FriendForm item={editFriend} banks={banks} onSave={saveFriend} onClose={() => { setFriendModal(false); setEditFriend(null); }} />
        </Modal>
      )}
      {settleId && (
        <div className="overlay" onClick={() => setSettleId(null)}>
          <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Settle this transfer?</div>
            <div className="text-muted fs-13 mb-5">Mark as settled or delete this record.</div>
            <div className="flex gap-3" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setSettleId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => settleFriend('delete')}>🗑️ Delete</button>
              <button className="btn btn-primary" onClick={() => settleFriend('settle')}>✅ Mark Settled</button>
            </div>
          </div>
        </div>
      )}
      {delBankId   && <ConfirmDelete onConfirm={deleteBank}   onCancel={() => setDelBankId(null)} />}
      {delFriendId && <ConfirmDelete onConfirm={deleteFriend} onCancel={() => setDelFriendId(null)} />}
    </div>
  );
}