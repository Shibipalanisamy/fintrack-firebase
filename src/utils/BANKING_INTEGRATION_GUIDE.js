// ─────────────────────────────────────────────────────────────────────────────
// FILE 1: src/utils/bankingSync.js
// Drop this new file into your utils folder.
// It exports helpers that BankingPage uses to compute synced balances
// and that IncomePage / ExpensesPage call after each save.
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: This file is already embedded inside BankingPage.js as `computeSyncedBalance`.
// You only need this separate file if you want to call it from other pages.

import { db, auth } from './firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';

const uid = () => auth.currentUser?.uid;

/**
 * Recomputes the synced balance for a bank by name.
 * Opening balance + all income credited − all expenses paid − investments − transfers.
 */
export async function computeSyncedBalance(bankName, openingBalance) {
  const u = uid();

  // Income
  const incSnap = await getDocs(query(collection(db, 'income'), where('userId', '==', u)));
  const incTotal = incSnap.docs
    .filter(d => (d.data().bankAccount || '').toLowerCase() === bankName.toLowerCase())
    .reduce((s, d) => s + (parseFloat(d.data().amount) || 0), 0);

  // Expenses
  const expSnap = await getDocs(query(collection(db, 'expenses'), where('userId', '==', u)));
  const expTotal = expSnap.docs
    .filter(d => {
      const pv = (d.data().paidVia || '').toLowerCase();
      const bn = bankName.toLowerCase();
      return pv === bn || pv.startsWith(bn);
    })
    .reduce((s, d) => s + (parseFloat(d.data().amount) || 0), 0);

  // Investments
  const invSnap = await getDocs(query(collection(db, 'investments'), where('userId', '==', u)));
  const invTotal = invSnap.docs
    .filter(d => (d.data().bankAccount || '').toLowerCase() === bankName.toLowerCase())
    .reduce((s, d) => s + (parseFloat(d.data().purchasePrice) * parseFloat(d.data().quantity) || 0), 0);

  // Bank-level transfers
  const txnSnap = await getDocs(query(collection(db, 'banktransactions'), where('userId', '==', u)));
  let txnDelta = 0;
  txnSnap.docs.forEach(d => {
    const t = d.data();
    if ((t.fromAccountId || '').toLowerCase() === bankName.toLowerCase()) txnDelta -= parseFloat(t.amount) || 0;
    if ((t.toAccountId || '').toLowerCase() === bankName.toLowerCase())   txnDelta += parseFloat(t.amount) || 0;
  });

  return parseFloat(openingBalance || 0) + incTotal - expTotal - invTotal + txnDelta;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE 2: ADDITIONS TO src/utils/dbService.js
// Paste these exports at the bottom of your existing dbService.js
// ─────────────────────────────────────────────────────────────────────────────

/*

// ─── BANK ACCOUNTS ────────────────────────────────────────
export const bankAccountService = {
  async getAll() {
    const q = query(collection(db, 'bankaccounts'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async create(data) {
    return addDoc(collection(db, 'bankaccounts'), { ...data, userId: uid(), createdAt: Timestamp.now() });
  },
  async update(id, data) { return updateDoc(doc(db, 'bankaccounts', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'bankaccounts', id)); },
  async adjustBalance(id, delta) {
    const ref = doc(db, 'bankaccounts', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const current = parseFloat(snap.data().balance) || 0;
    return updateDoc(ref, { balance: current + delta });
  }
};

// ─── BANK TRANSACTIONS LOG ────────────────────────────────
export const bankTxnService = {
  async getAll(filters = {}) {
    const q = query(
      collection(db, 'banktransactions'),
      where('userId', '==', uid()),
      orderBy('date', 'desc')
    );
    const snap = await getDocs(q);
    let docs = snap.docs.map(d => ({
      id: d.id, ...d.data(),
      date: d.data().date?.toDate?.() || new Date(d.data().date)
    }));
    if (filters.accountId)
      docs = docs.filter(d => d.fromAccountId === filters.accountId || d.toAccountId === filters.accountId);
    if (filters.type)
      docs = docs.filter(d => d.type === filters.type);
    return docs;
  },
  async create(data) {
    return addDoc(collection(db, 'banktransactions'), {
      ...data, userId: uid(),
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now()
    });
  },
  async delete(id) { return deleteDoc(doc(db, 'banktransactions', id)); }
};

// ─── FRIEND TRANSFERS ─────────────────────────────────────
export const friendTransferService = {
  async getAll() {
    const q = query(
      collection(db, 'friendtransfers'),
      where('userId', '==', uid()),
      orderBy('date', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id, ...d.data(),
      date: d.data().date?.toDate?.() || new Date(d.data().date)
    }));
  },
  async create(data) {
    return addDoc(collection(db, 'friendtransfers'), {
      ...data, userId: uid(),
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now()
    });
  },
  async update(id, data) { return updateDoc(doc(db, 'friendtransfers', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'friendtransfers', id)); }
};

*/

// ─────────────────────────────────────────────────────────────────────────────
// FILE 3: UPDATED IncomePage.js  —  IncomeForm patch
// Add a "Bank Account" dropdown to IncomeForm so income is linked to a bank.
// ─────────────────────────────────────────────────────────────────────────────

/*

// At the top of IncomePage.js, add this import:
import { bankAccountService } from '../utils/dbService';

// Replace the IncomeForm function with this version:

function IncomeForm({ item, cats, banks, onSave, onClose }) {
  const [f, setF] = useState({
    date: today(),
    category: cats[0]?.name || 'Salary',
    amount: '',
    notes: '',
    bankAccount: banks[0]?.name || '',
    ...(item ? { ...item, date: fmtDateInput(item.date) } : {})
  });
  const [loading, setLoading] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave({ ...f, amount: parseFloat(f.amount) });
    } finally {
      setLoading(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <div className="frow">
        <div className="fg">
          <label className="fl">Date</label>
          <DateStepper name="date" value={f.date} onChange={ch} required max={today()} />
        </div>
        <div className="fg">
          <label className="fl">Amount (₹)</label>
          <input className="fi" type="number" name="amount" value={f.amount} onChange={ch}
            placeholder="0.00" step="0.01" min="0" required />
        </div>
      </div>
      <div className="fg">
        <label className="fl">Category</label>
        <select className="fs" name="category" value={f.category} onChange={ch}>
          {cats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>

      {/* ── NEW: Bank Account selector ── */}
      <div className="fg">
        <label className="fl">💳 Credit to Bank Account</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 6, marginTop: 4 }}>
          {banks.map(b => (
            <button key={b.id} type="button" onClick={() => setF(p => ({ ...p, bankAccount: b.name }))}
              style={{
                padding: '8px 10px', borderRadius: 10,
                border: `2px solid ${f.bankAccount === b.name ? (b.color || 'var(--blue)') : 'var(--border2)'}`,
                background: f.bankAccount === b.name ? (b.color || 'var(--blue)') + '18' : 'var(--bg3)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
              }}>
              <span style={{ fontSize: 16 }}>{b.icon || '🏦'}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: f.bankAccount === b.name ? (b.color || 'var(--blue)') : 'var(--t2)' }}>
                {b.name}
              </span>
            </button>
          ))}
          <button type="button" onClick={() => setF(p => ({ ...p, bankAccount: '' }))}
            style={{ padding: '8px 10px', borderRadius: 10, border: `2px solid ${!f.bankAccount ? 'var(--blue)' : 'var(--border2)'}`, background: !f.bankAccount ? 'rgba(77,158,255,.12)' : 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>💼</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: !f.bankAccount ? 'var(--blue)' : 'var(--t3)' }}>Other</span>
          </button>
        </div>
        {f.bankAccount && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>
            ✅ Will be added to balance of <strong>{f.bankAccount}</strong>
          </div>
        )}
      </div>

      <div className="fg">
        <label className="fl">Notes</label>
        <textarea className="fta" name="notes" value={f.notes} onChange={ch} rows={2} />
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <span className="spin" /> : null}
          {item ? 'Update' : 'Add Income'}
        </button>
      </div>
    </form>
  );
}

// In the main IncomePage component, load banks too:
//   const [banks, setBanks] = useState([]);
//   ...in load(): const [inc, c, b] = await Promise.all([incomeService.getAll(...), categoryService.getAll('income'), bankAccountService.getAll()]);
//   setItems(inc); setCats(c); setBanks(b);
//
// Pass banks to the form:
//   <IncomeForm item={edit} cats={cats} banks={banks} onSave={save} onClose={...} />

*/

// ─────────────────────────────────────────────────────────────────────────────
// FILE 4: UPDATED PortfolioPage.js  —  InvestmentForm patch
// Add a "Bank Account" selector to the investment form so buying a stock
// automatically deducts from the linked bank.
// ─────────────────────────────────────────────────────────────────────────────

/*

// Add to your investment form state:
//   bankAccount: banks[0]?.name || '',

// Add this UI block inside the investment form (after broker selector):

<div className="fg">
  <label className="fl">🏦 Deduct from Bank Account</label>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 6, marginTop: 4 }}>
    {banks.map(b => (
      <button key={b.id} type="button" onClick={() => setF(p => ({ ...p, bankAccount: b.name }))}
        style={{
          padding: '8px 10px', borderRadius: 10,
          border: `2px solid ${f.bankAccount === b.name ? (b.color || 'var(--blue)') : 'var(--border2)'}`,
          background: f.bankAccount === b.name ? (b.color || 'var(--blue)') + '18' : 'var(--bg3)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
        }}>
        <span style={{ fontSize: 16 }}>{b.icon || '🏦'}</span>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{b.name}</span>
      </button>
    ))}
  </div>
  {f.bankAccount && (
    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>
      ⚠️ Investment amount will be deducted from <strong>{f.bankAccount}</strong>
    </div>
  )}
</div>

*/

// ─────────────────────────────────────────────────────────────────────────────
// FILE 5: Router setup — add BankingPage to App.js / Router
// ─────────────────────────────────────────────────────────────────────────────

/*

// In your App.js or router file, add:
import BankingPage from './pages/BankingPage';

// Inside your Routes:
<Route path="/banking" element={<Layout><BankingPage /></Layout>} />

// In UI.js NAV array, add this entry (after Cards):
{ icon: '🏦', label: 'Banking', to: '/banking' },

*/

// ─────────────────────────────────────────────────────────────────────────────
// FILE 6: Firebase Firestore Security Rules additions
// Add these new collections to your Firestore rules
// ─────────────────────────────────────────────────────────────────────────────

/*

// Add to firestore.rules:

match /bankaccounts/{docId} {
  allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
}

match /banktransactions/{docId} {
  allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
}

match /friendtransfers/{docId} {
  allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
}

*/

export default {}; // This file is documentation — see comments above
