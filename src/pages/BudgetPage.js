import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../utils/firebase';
import {
  collection, query, where,
  onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs,
  setDoc, getDoc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { MonthYearFilter, ConfirmDelete } from '../components/UI';
import toast from 'react-hot-toast';

// ── These two always keep hardcoded values — never overwritten by expense sync ──
const SYNC_EXCLUDED = ['room rent', 'stock investment'];

// ── Banks (columns in the allocation matrix) ──
const BANKS = ['IDFC', 'Axis', 'HDFC', 'SBI', 'ICICI', 'IDFC Credit Card'];

// ── Salary (default — overridable via inline edit) ──
const DEFAULT_SALARY = 155000;

// ── Bank header colour accents ──
const BANK_COLORS = {
  'IDFC':             { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'Axis':             { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  'HDFC':             { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  'SBI':              { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  'ICICI':            { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  'IDFC Credit Card': { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
};

// ── Master list with default bank allocations ──
const DEFAULT_CATEGORIES = [
  { category: 'Room Rent',            target: 10500, bankAmounts: { IDFC: 10500, Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'RD Amount/SIP',        target: 12000, bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 12000 } },
  { category: 'Settu',                target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Mobile Recharge',      target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Credit Card',          target: 56000, bankAmounts: { IDFC: 56000, Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'For Daily Spend',      target: null,  bankAmounts: { IDFC: 0,     Axis: 25000, HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Unwanted',             target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Paytm',                target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Bike',                 target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Dress',                target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Home Amount',          target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Insurance Premium',    target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'EMI Amount',           target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'PPF Amount/SIP Tax',   target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 1500, 'IDFC Credit Card': 0     } },
  { category: 'Children School Fees', target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 3000, ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Stock Investment',     target: 10000, bankAmounts: { IDFC: 10000, Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Savings',              target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Loan to Others',       target: null,  bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Gold Chittu',          target: 35000, bankAmounts: { IDFC: 35000, Axis: 0,     HDFC: 0,     SBI: 0,    ICICI: 0,    'IDFC Credit Card': 0     } },
  { category: 'Emergency Amount',     target: 0,     bankAmounts: { IDFC: 0,     Axis: 0,     HDFC: 0,     SBI: 2000, ICICI: 0,    'IDFC Credit Card': 0     } },
];

function prevMonthYear(month, year) {
  return month === 1 ? { m: 12, y: year - 1 } : { m: month - 1, y: year };
}

export default function BudgetPage() {
  const [month, setMonth]             = useState(new Date().getMonth() + 1);
  const [year, setYear]               = useState(new Date().getFullYear());
  const [budgets, setBudgets]         = useState([]);
  const [expenses, setExpenses]       = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData]       = useState({
    category: '', target: '',
    bankAmounts: Object.fromEntries(BANKS.map(b => [b, ''])),
  });
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [salary, setSalary]             = useState(DEFAULT_SALARY);
  const [isEditingSalary, setIsEditingSalary] = useState(false);
  const [salaryDraft, setSalaryDraft]   = useState(String(DEFAULT_SALARY));
  const [incomeDetails, setIncomeDetails] = useState([]); // individual income line items

  // ── Add Income modal state ──
  const [showIncomeModal, setShowIncomeModal]     = useState(false);
  const [incomeForm, setIncomeForm]               = useState({ source: '', amount: '' });
  const [isSavingIncome, setIsSavingIncome]       = useState(false);
  const [showIncomeDetails, setShowIncomeDetails] = useState(false);

  // ── Defaults modal state ──
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);
  const [defaultDrafts, setDefaultDrafts]         = useState([]);
  const [syncedCategories, setSyncedCategories]   = useState(new Set());
  const [isSavingDefaults, setIsSavingDefaults]   = useState(false);
  const [isSyncing, setIsSyncing]                 = useState(false);
  const [incomeSynced, setIncomeSynced]           = useState(false);

  // ── Tabs ──
  const [activeTab, setActiveTab]                 = useState('budget'); // 'budget' | 'summary'

  // ── Summary filters ──
  const [filterCategory, setFilterCategory]       = useState('All');
  const [filterBank, setFilterBank]               = useState('All');
  const [filterTransfer, setFilterTransfer]       = useState(false);
  const [filterPayment, setFilterPayment]         = useState(false);
  const [pieView, setPieView]                     = useState('category'); // 'category' | 'bank'

  // ── Tracks which uid-month-year combos have already been checked ──
  const checkedKeys = useRef(new Set());

  // ── Reactive auth ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUser(user));
    return unsub;
  }, []);

  // ── Load salary from Firestore (per user + month + year) ──
  useEffect(() => {
    if (!currentUser) return;
    const salaryDocRef = doc(db, 'settings', `${currentUser.uid}_salary_${month}_${year}`);
    getDoc(salaryDocRef).then(snap => {
      if (snap.exists()) {
        const saved = snap.data().salary;
        setSalary(saved);
        setSalaryDraft(String(saved));
        setIncomeDetails(snap.data().incomeDetails ?? []);
      } else {
        // Fall back to default if no record for this month/year
        setSalary(DEFAULT_SALARY);
        setSalaryDraft(String(DEFAULT_SALARY));
        setIncomeDetails([]);
      }
    }).catch(err => console.error('Failed to load salary:', err));
  }, [currentUser, month, year]);

  // ── Sync salary from Income page (incomes collection) ──
  useEffect(() => {
    if (!currentUser) return;
    setIncomeSynced(false);
    const q = query(
      collection(db, 'incomes'),
      where('uid', '==', currentUser.uid),
      where('month', '==', month),
      where('year', '==', year)
    );
    const unsub = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) { setIncomeSynced(false); setIncomeDetails([]); return; }
      const details = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const totalIncome = details.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      if (totalIncome > 0) {
        setSalary(totalIncome);
        setSalaryDraft(String(totalIncome));
        setIncomeDetails(details);
        setIncomeSynced(true);
        try {
          const ref = doc(db, 'settings', `${currentUser.uid}_salary_${month}_${year}`);
          const detailsToStore = details.map(({ id, ...rest }) => rest);
          await setDoc(ref, {
            uid: currentUser.uid, month, year, salary: totalIncome,
            incomeDetails: detailsToStore, updatedAt: new Date(), syncedFromIncome: true,
          });
        } catch (err) { console.error('Failed to persist income-synced salary:', err); }
      }
    });
    return unsub;
  }, [currentUser, month, year]);

  // ── Budgets listener — triggers defaults modal on first empty visit ──
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'budgets'),
      where('uid', '==', currentUser.uid),
      where('month', '==', month),
      where('year', '==', year)
    );
    return onSnapshot(q, async (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setBudgets(docs);

      const key = `${currentUser.uid}-${month}-${year}`;
      if (docs.length === 0 && !checkedKeys.current.has(key)) {
        checkedKeys.current.add(key);
        await openDefaultsModal(currentUser.uid, month, year);
      }
    });
  }, [month, year, currentUser]);

  // ── Fetch last month's expenses → build category totals → open modal ──
  const openDefaultsModal = async (uid, m, y) => {
    setIsSyncing(true);
    const { m: pm, y: py } = prevMonthYear(m, y);
    let expenseMap = {};

    try {
      const q    = query(
        collection(db, 'expenses'),
        where('uid', '==', uid),
        where('month', '==', pm),
        where('year', '==', py)
      );
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data();
        const cat  = (data.category ?? '').toLowerCase().trim();
        expenseMap[cat] = (expenseMap[cat] || 0) + (Number(data.amount) || 0);
      });
    } catch (err) {
      console.error('Expense sync failed:', err);
    }

    const synced = new Set();
    const drafts = DEFAULT_CATEGORIES.map(c => {
      const catKey     = c.category.toLowerCase().trim();
      const isExcluded = SYNC_EXCLUDED.includes(catKey);

      let target = c.target !== null ? String(c.target) : '';

      if (!isExcluded && expenseMap[catKey] !== undefined && expenseMap[catKey] > 0) {
        synced.add(c.category);
        target = String(Math.round(expenseMap[catKey]));
      }

      return {
        category:    c.category,
        target,
        bankAmounts: { ...c.bankAmounts },
      };
    });

    setDefaultDrafts(drafts);
    setSyncedCategories(synced);
    setIsSyncing(false);
    setShowDefaultsModal(true);
  };

  // ── Expenses listener (current month, for table) ──
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'expenses'),
      where('uid', '==', currentUser.uid),
      where('month', '==', month),
      where('year', '==', year)
    );
    return onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(d => d.data()));
    });
  }, [month, year, currentUser]);

  // ── Save all defaults at once ──
  const handleSaveDefaults = async (e) => {
    e.preventDefault();
    if (!currentUser) return toast.error('Not authenticated');

    const blank = defaultDrafts.find(d => d.target.trim() === '');
    if (blank) return toast.error(`Enter an amount for "${blank.category}"`);

    setIsSavingDefaults(true);
    try {
      await Promise.all(
        defaultDrafts.map(d =>
          addDoc(collection(db, 'budgets'), {
            category:    d.category,
            target:      Number(d.target),
            bankAmounts: Object.fromEntries(
              BANKS.map(b => [b, Number(d.bankAmounts[b]) || 0])
            ),
            month, year,
            uid: currentUser.uid,
          })
        )
      );
      toast.success('All budget categories saved!');
      setShowDefaultsModal(false);
    } catch (err) {
      console.error(err);
      toast.error('Error saving defaults');
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const updateDraft = (index, field, value) =>
    setDefaultDrafts(prev => {
      const next  = [...prev];
      if (field === 'target') {
        next[index] = { ...next[index], target: value };
      } else {
        next[index] = {
          ...next[index],
          bankAmounts: { ...next[index].bankAmounts, [field]: value },
        };
      }
      return next;
    });

  // ── Persist salary to Firestore ──
  const saveSalaryToDB = async (value) => {
    if (!currentUser) return;
    try {
      const salaryDocRef = doc(db, 'settings', `${currentUser.uid}_salary_${month}_${year}`);
      await setDoc(salaryDocRef, {
        uid:       currentUser.uid,
        month,
        year,
        salary:    value,
        updatedAt: new Date(),
      });
      toast.success('Salary saved');
    } catch (err) {
      console.error('Failed to save salary:', err);
      toast.error('Could not save salary');
    }
  };

  // ── Add income entry ──
  const handleAddIncome = async (e) => {
    e.preventDefault();
    if (!currentUser) return toast.error('Not authenticated');
    const source = incomeForm.source.trim();
    const amount = Number(incomeForm.amount);
    if (!source)    return toast.error('Enter an income source');
    if (!amount || amount <= 0) return toast.error('Enter a valid amount');

    setIsSavingIncome(true);
    try {
      await addDoc(collection(db, 'incomes'), {
        uid: currentUser.uid, month, year, source, amount, createdAt: new Date(),
      });
      toast.success('Income added');
      setIncomeForm({ source: '', amount: '' });
      setShowIncomeModal(false);
    } catch (err) {
      console.error(err);
      toast.error('Could not save income');
    } finally {
      setIsSavingIncome(false);
    }
  };

  // ── Delete income entry ──
  const handleDeleteIncome = async (id) => {
    if (!id) return;
    try {
      await deleteDoc(doc(db, 'incomes', id));
      toast.success('Income removed');
    } catch (err) {
      console.error(err);
      toast.error('Could not delete income');
    }
  };

  // ── Save single add / edit ──
  const handleSave = async (e) => {
    e.preventDefault();
    if (!currentUser) return toast.error('Not authenticated');
    const data = {
      category:    formData.category.trim(),
      target:      Number(formData.target),
      bankAmounts: Object.fromEntries(
        BANKS.map(b => [b, Number(formData.bankAmounts[b]) || 0])
      ),
      month, year,
      uid: currentUser.uid,
    };
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'budgets', editingItem.id), data);
        toast.success('Budget Updated');
      } else {
        await addDoc(collection(db, 'budgets'), data);
        toast.success('Budget Added');
      }
      closeModal();
    } catch (err) {
      console.error(err);
      toast.error('Error saving budget');
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteDoc(doc(db, 'budgets', deleteTarget));
      toast.success('Deleted');
    } catch {
      toast.error('Error deleting');
    } finally {
      setDeleteTarget(null);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormData({
      category: '', target: '',
      bankAmounts: Object.fromEntries(BANKS.map(b => [b, ''])),
    });
  };

  // ── Derived totals ──
  const blankCount        = defaultDrafts.filter(d => d.target.trim() === '').length;
  const { m: pm, y: py } = prevMonthYear(month, year);

  const bankColumnTotals = Object.fromEntries(
    BANKS.map(b => [
      b,
      budgets.reduce((sum, item) => sum + (Number((item.bankAmounts || {})[b]) || 0), 0),
    ])
  );
  const grandTotal = Object.values(bankColumnTotals).reduce((a, v) => a + v, 0);

  /* ─────────────────────────────────────────────
     Inline style tokens — explicit values so the
     popup never inherits a dark-theme CSS var
  ───────────────────────────────────────────── */
  const POPUP = {
    surface:     '#ffffff',
    border:      '#e5e7eb',
    textPrimary: '#111827',
    textMuted:   '#6b7280',
    rowDefault:  '#f9fafb',
    rowBlank:    '#fffbeb',
    borderBlank: '#fbbf24',
    borderSync:  '#6ee7b7',
    badgeSync:   { bg: '#d1fae5', text: '#065f46' },
    badgeFixed:  { bg: '#dbeafe', text: '#1d4ed8' },
  };

  return (
    <div className="page-content">

      {/* ── Header ── */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="topbar-title">Monthly Budget Plan</h2>
          <p className="text-muted fs-12">Salary allocation for {month}/{year}</p>
        </div>
        <MonthYearFilter month={month} year={year} setMonth={setMonth} setYear={setYear} />
      </div>

      {/* ── Salary summary bar ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>

        {/* Editable Salary card */}
        <div style={{
          background: '#f9fafb', border: '1.5px solid #e5e7eb',
          borderRadius: 10, padding: '10px 20px', minWidth: 140, position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af' }}>SALARY</span>
            {incomeSynced && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7',
              }}>⚡ INCOME SYNCED</span>
            )}
          </div>

          {isEditingSalary ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#4f46e5' }}>₹</span>
              <input
                autoFocus
                type="number"
                min="0"
                value={salaryDraft}
                onChange={e => setSalaryDraft(e.target.value)}
                onBlur={() => {
                  const parsed = Number(salaryDraft);
                  if (!isNaN(parsed) && parsed >= 0) {
                    setSalary(parsed);
                    saveSalaryToDB(parsed);
                  }
                  setIsEditingSalary(false);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const parsed = Number(salaryDraft);
                    if (!isNaN(parsed) && parsed >= 0) {
                      setSalary(parsed);
                      saveSalaryToDB(parsed);
                    }
                    setIsEditingSalary(false);
                  }
                  if (e.key === 'Escape') setIsEditingSalary(false);
                }}
                style={{
                  width: 110, fontSize: 16, fontWeight: 700, color: '#4f46e5',
                  border: '1.5px solid #6366f1', borderRadius: 6, padding: '2px 6px',
                  outline: 'none', background: '#fff',
                }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#4f46e5' }}>
                {`₹${salary.toLocaleString('en-IN')}`}
              </span>
              <button
                onClick={() => { setSalaryDraft(String(salary)); setIsEditingSalary(true); }}
                title="Edit salary"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  border: '1.5px solid #c7d2fe', background: '#eef2ff',
                  color: '#4f46e5', fontSize: 13, cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#4f46e5'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.color = '#4f46e5'; }}
              >
                ✏️
              </button>
            </div>
          )}

          {/* ── Income details toggle ── */}
          {incomeDetails.length > 0 && (
            <button
              onClick={() => setShowIncomeDetails(v => !v)}
              style={{
                marginTop: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                color: '#6366f1', background: 'none', border: 'none', padding: 0,
              }}
            >
              {showIncomeDetails ? '▲ Hide details' : `▼ ${incomeDetails.length} income source${incomeDetails.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>

        {/* ── Add Income button card ── */}
        <div style={{
          background: '#f0fdf4', border: '1.5px dashed #86efac',
          borderRadius: 10, padding: '10px 16px', minWidth: 120,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
          cursor: 'pointer',
        }}
          onClick={() => { setIncomeForm({ source: '', amount: '' }); setShowIncomeModal(true); }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>➕</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>Add Income</span>
        </div>

        {/* Allocated & Balance cards */}
        {[
          { label: 'Allocated', value: grandTotal,         color: grandTotal > salary ? '#dc2626' : '#059669' },
          { label: 'Balance',   value: salary - grandTotal, color: salary - grandTotal < 0 ? '#dc2626' : '#374151' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#f9fafb', border: '1.5px solid #e5e7eb',
            borderRadius: 10, padding: '10px 20px', minWidth: 140,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 2 }}>
              {label.toUpperCase()}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>
              {`₹${value.toLocaleString('en-IN')}`}
            </div>
          </div>
        ))}
      </div>

      {/* ── Income details breakdown panel ── */}
      {showIncomeDetails && incomeDetails.length > 0 && (
        <div style={{
          marginBottom: 16, background: '#f9fafb', border: '1.5px solid #e5e7eb',
          borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 16px', background: '#eef2ff', borderBottom: '1.5px solid #e5e7eb',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>💰 Income Breakdown</span>
            <span style={{ fontSize: 11, color: '#6b7280' }}>{month}/{year}</span>
          </div>
          {incomeDetails.map((item, i) => (
            <div key={item.id ?? i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 16px', borderBottom: i < incomeDetails.length - 1 ? '1px solid #f3f4f6' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 6, background: '#e0e7ff',
                  color: '#4f46e5', fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                  {item.source || 'Salary'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>
                  ₹{Number(item.amount).toLocaleString('en-IN')}
                </span>
                {item.id && (
                  <button
                    onClick={() => handleDeleteIncome(item.id)}
                    title="Remove"
                    style={{
                      width: 22, height: 22, borderRadius: 5, border: '1px solid #fca5a5',
                      background: '#fee2e2', color: '#dc2626', fontSize: 11,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Income Modal ── */}
      {showIncomeModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 24px', borderBottom: '1.5px solid #e5e7eb',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#eef2ff',
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#4f46e5' }}>💰 Add Income</span>
              <button
                onClick={() => setShowIncomeModal(false)}
                style={{
                  width: 28, height: 28, borderRadius: 8, border: '1.5px solid #c7d2fe',
                  background: '#fff', color: '#4f46e5', fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✕</button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddIncome} style={{ padding: 24 }}>
              {/* Source */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  Income Source
                </label>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. Main Salary, Freelance, Bonus…"
                  value={incomeForm.source}
                  onChange={e => setIncomeForm(f => ({ ...f, source: e.target.value }))}
                  style={{
                    width: '100%', height: 40, padding: '0 12px', borderRadius: 8,
                    border: '1.5px solid #d1d5db', fontSize: 13, outline: 'none',
                    boxSizing: 'border-box', color: '#111827',
                  }}
                  onFocus={e => e.target.style.borderColor = '#6366f1'}
                  onBlur={e  => e.target.style.borderColor = '#d1d5db'}
                />
              </div>

              {/* Amount */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  Amount (₹)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 14, fontWeight: 700, color: '#6b7280', pointerEvents: 'none',
                  }}>₹</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="0"
                    value={incomeForm.amount}
                    onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))}
                    style={{
                      width: '100%', height: 40, paddingLeft: 28, paddingRight: 12,
                      borderRadius: 8, border: '1.5px solid #d1d5db',
                      fontSize: 14, fontWeight: 700, color: '#111827',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                    onBlur={e  => e.target.style.borderColor = '#d1d5db'}
                  />
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowIncomeModal(false)}
                  style={{
                    flex: 1, height: 42, borderRadius: 10,
                    border: '1.5px solid #e5e7eb', background: '#f9fafb',
                    color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >Cancel</button>
                <button
                  type="submit"
                  disabled={isSavingIncome}
                  style={{
                    flex: 2, height: 42, borderRadius: 10, border: 'none',
                    background: isSavingIncome ? '#a5b4fc' : '#4f46e5',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: isSavingIncome ? 'not-allowed' : 'pointer',
                  }}
                >{isSavingIncome ? 'Saving…' : 'Save Income'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #e5e7eb' }}>
        {[
          { key: 'budget',  label: '📋 Budget Plan' },
          { key: 'summary', label: '📊 Summary' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '9px 20px', fontSize: 13, fontWeight: 700,
              border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === t.key ? '3px solid #4f46e5' : '3px solid transparent',
              color: activeTab === t.key ? '#4f46e5' : '#6b7280',
              marginBottom: -2, transition: 'color 0.15s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ══════════════════════════════
           SUMMARY TAB
      ══════════════════════════════ */}
      {activeTab === 'summary' && (() => {
        // ── Pie chart colours ──
        const PIE_COLORS = [
          '#4f46e5','#059669','#dc2626','#d97706','#7c3aed',
          '#0891b2','#db2777','#65a30d','#ea580c','#0284c7',
          '#9333ea','#16a34a','#ca8a04','#e11d48','#2563eb',
          '#0d9488','#c026d3','#84cc16','#f97316','#6366f1',
        ];

        // ── Derive per-category rows augmented with transfer/payment flags ──
        // (We read from budgets; transfer/payment come from expenses matching by category)
        const expensesByCategory = {};
        expenses.forEach(e => {
          const cat = (e.category ?? '').trim();
          if (!expensesByCategory[cat]) expensesByCategory[cat] = { transferDone: false, paymentDone: false, total: 0 };
          expensesByCategory[cat].total += Number(e.amount) || 0;
          if (e.transferCompleted || e.transferDone) expensesByCategory[cat].transferDone = true;
          if (e.paymentDone || e.paymentCompleted) expensesByCategory[cat].paymentDone = true;
        });

        // ── Build rows from budgets ──
        let rows = budgets.map(item => {
          const ba = item.bankAmounts || {};
          const rowTotal = BANKS.reduce((s, b) => s + (Number(ba[b]) || 0), 0);
          const catKey = (item.category ?? '').trim();
          const expData = expensesByCategory[catKey] || {};
          const banksUsed = BANKS.filter(b => Number(ba[b]) > 0);
          return {
            id:            item.id,
            category:      item.category,
            target:        Number(item.target) || 0,
            allocated:     rowTotal,
            banksUsed,
            bankAmounts:   ba,
            // prefer the flag stored directly on the budget doc; fall back to expense-derived
            transferDone:  item.transferDone  || expData.transferDone || false,
            paymentDone:   item.paymentDone   || expData.paymentDone  || false,
          };
        });

        // ── Apply filters ──
        if (filterCategory !== 'All') rows = rows.filter(r => r.category === filterCategory);
        if (filterBank     !== 'All') rows = rows.filter(r => r.banksUsed.includes(filterBank));
        if (filterTransfer)           rows = rows.filter(r => r.transferDone);
        if (filterPayment)            rows = rows.filter(r => r.paymentDone);

        // ── Pie data ──
        let pieData = [];
        if (pieView === 'category') {
          pieData = rows.map((r, i) => ({
            label: r.category,
            value: r.allocated,
            color: PIE_COLORS[i % PIE_COLORS.length],
          })).filter(d => d.value > 0);
        } else {
          const bankTotals = {};
          rows.forEach(r => {
            BANKS.forEach(b => {
              const v = Number(r.bankAmounts[b]) || 0;
              if (v > 0) bankTotals[b] = (bankTotals[b] || 0) + v;
            });
          });
          pieData = Object.entries(bankTotals).map(([b, v], i) => ({
            label: b, value: v, color: BANK_COLORS[b]?.bg ? BANK_COLORS[b].text : PIE_COLORS[i % PIE_COLORS.length],
            colorFill: PIE_COLORS[i % PIE_COLORS.length],
          })).filter(d => d.value > 0);
        }

        const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

        // ── Toggle transfer / payment flag directly on the budget doc ──
        const toggleBudgetFlag = async (budgetId, field, currentValue) => {
          try {
            await updateDoc(doc(db, 'budgets', budgetId), { [field]: !currentValue });
          } catch (err) {
            console.error(err);
            toast.error('Could not update status');
          }
        };

        // ── SVG Pie (no library needed) ──
        const renderPie = () => {
          if (pieData.length === 0) return (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 14 }}>
              No data to display
            </div>
          );
          const R = 110, cx = 150, cy = 130, size = 300;
          let cumAngle = -Math.PI / 2;
          const slices = pieData.map(d => {
            const angle = (d.value / pieTotal) * 2 * Math.PI;
            const x1 = cx + R * Math.cos(cumAngle);
            const y1 = cy + R * Math.sin(cumAngle);
            cumAngle += angle;
            const x2 = cx + R * Math.cos(cumAngle);
            const y2 = cy + R * Math.sin(cumAngle);
            const large = angle > Math.PI ? 1 : 0;
            return { ...d, path: `M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`, midAngle: cumAngle - angle / 2 };
          });
          return (
            <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: 260 }}>
              {slices.map((s, i) => (
                <path key={i} d={s.path} fill={s.colorFill || s.color} stroke="#fff" strokeWidth={2}>
                  <title>{s.label}: ₹{s.value.toLocaleString('en-IN')} ({((s.value/pieTotal)*100).toFixed(1)}%)</title>
                </path>
              ))}
              <text x={cx} y={cy - 8} textAnchor="middle" fontSize="11" fill="#6b7280" fontWeight="600">TOTAL</text>
              <text x={cx} y={cy + 10} textAnchor="middle" fontSize="13" fill="#111827" fontWeight="700">
                ₹{pieTotal.toLocaleString('en-IN')}
              </text>
            </svg>
          );
        };

        return (
          <div>
            {/* ── Filters bar ── */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
              background: '#f9fafb', border: '1.5px solid #e5e7eb',
              borderRadius: 12, padding: '12px 16px', marginBottom: 20,
            }}>
              {/* Category filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af' }}>CATEGORY</label>
                <select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  style={{
                    height: 34, padding: '0 10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: '1.5px solid #d1d5db', background: '#fff', color: '#111827',
                    cursor: 'pointer', outline: 'none', minWidth: 160,
                  }}
                >
                  <option value="All">All Categories</option>
                  {budgets.map(b => <option key={b.id} value={b.category}>{b.category}</option>)}
                </select>
              </div>

              {/* Bank filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af' }}>BANK TYPE</label>
                <select
                  value={filterBank}
                  onChange={e => setFilterBank(e.target.value)}
                  style={{
                    height: 34, padding: '0 10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: '1.5px solid #d1d5db', background: '#fff', color: '#111827',
                    cursor: 'pointer', outline: 'none', minWidth: 160,
                  }}
                >
                  <option value="All">All Banks</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {/* Transfer completed */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af' }}>STATUS</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', height: 34 }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 13, fontWeight: 600, color: filterTransfer ? '#059669' : '#374151',
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={filterTransfer}
                      onChange={e => setFilterTransfer(e.target.checked)}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#059669' }}
                    />
                    Transfer Done
                  </label>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 13, fontWeight: 600, color: filterPayment ? '#4f46e5' : '#374151',
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={filterPayment}
                      onChange={e => setFilterPayment(e.target.checked)}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                    Payment Done
                  </label>
                </div>
              </div>

              {/* Reset */}
              {(filterCategory !== 'All' || filterBank !== 'All' || filterTransfer || filterPayment) && (
                <button
                  onClick={() => { setFilterCategory('All'); setFilterBank('All'); setFilterTransfer(false); setFilterPayment(false); }}
                  style={{
                    alignSelf: 'flex-end', height: 34, padding: '0 12px', borderRadius: 8,
                    border: '1.5px solid #fecaca', background: '#fff1f2', color: '#dc2626',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >✕ Reset</button>
              )}
            </div>

            {/* ── Main summary layout: Pie + Legend + Table ── */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>

              {/* Left: Pie Chart */}
              <div style={{
                background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 14,
                padding: '16px', minWidth: 280, flex: '0 0 280px',
              }}>
                {/* Pie toggle */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {[['category','By Category'],['bank','By Bank']].map(([v, l]) => (
                    <button key={v} onClick={() => setPieView(v)} style={{
                      flex: 1, height: 30, borderRadius: 7, fontSize: 11, fontWeight: 700,
                      border: `1.5px solid ${pieView === v ? '#4f46e5' : '#e5e7eb'}`,
                      background: pieView === v ? '#4f46e5' : '#f9fafb',
                      color: pieView === v ? '#fff' : '#6b7280',
                      cursor: 'pointer',
                    }}>{l}</button>
                  ))}
                </div>
                {renderPie()}

                {/* Legend */}
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 200, overflowY: 'auto' }}>
                  {pieData.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                        background: d.colorFill || d.color,
                      }} />
                      <span style={{ fontSize: 11, color: '#374151', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.label}
                      </span>
                      <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, flexShrink: 0 }}>
                        {((d.value / pieTotal) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Summary table */}
              <div style={{ flex: 1, minWidth: 300, overflowX: 'auto' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 10,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                    {rows.length} categor{rows.length === 1 ? 'y' : 'ies'}
                    {filterCategory !== 'All' || filterBank !== 'All' || filterTransfer || filterPayment
                      ? ' (filtered)' : ''}
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                    Total: <span style={{ color: '#4f46e5', fontWeight: 700 }}>₹{rows.reduce((s, r) => s + r.allocated, 0).toLocaleString('en-IN')}</span>
                  </span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280' }}>CATEGORY</th>
                      <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#6b7280' }}>TARGET</th>
                      <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#6b7280' }}>ALLOCATED</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280' }}>BANKS</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280' }}>TRANSFER</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280' }}>PAYMENT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>No results match filters</td></tr>
                    ) : rows.map((r, idx) => (
                      <tr key={r.category} style={{
                        borderBottom: '1px solid #f3f4f6',
                        background: idx % 2 === 0 ? '#fff' : '#f9fafb',
                      }}>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: '#111827', fontSize: 13 }}>
                          {r.category}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#4f46e5', fontWeight: 600 }}>
                          {r.target > 0 ? `₹${r.target.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700,
                          color: r.target > 0 && r.allocated > r.target ? '#dc2626' : '#059669' }}>
                          ₹{r.allocated.toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {r.banksUsed.length === 0 ? <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                              : r.banksUsed.map(b => (
                              <span key={b} style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                                background: BANK_COLORS[b].bg, color: BANK_COLORS[b].text,
                                border: `1px solid ${BANK_COLORS[b].border}`,
                              }}>{b}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <button
                            onClick={() => toggleBudgetFlag(r.id, 'transferDone', r.transferDone)}
                            title={r.transferDone ? 'Mark as not transferred' : 'Mark as transferred'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                              border: r.transferDone ? '2px solid #059669' : '2px solid #d1d5db',
                              background: r.transferDone ? '#d1fae5' : '#f9fafb',
                              color: r.transferDone ? '#059669' : '#9ca3af',
                              fontSize: 13, fontWeight: 700,
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = r.transferDone ? '#a7f3d0' : '#f3f4f6';
                              e.currentTarget.style.borderColor = r.transferDone ? '#047857' : '#9ca3af';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = r.transferDone ? '#d1fae5' : '#f9fafb';
                              e.currentTarget.style.borderColor = r.transferDone ? '#059669' : '#d1d5db';
                            }}
                          >{r.transferDone ? '✓' : '—'}</button>
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <button
                            onClick={() => toggleBudgetFlag(r.id, 'paymentDone', r.paymentDone)}
                            title={r.paymentDone ? 'Mark as not paid' : 'Mark as paid'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                              border: r.paymentDone ? '2px solid #4f46e5' : '2px solid #d1d5db',
                              background: r.paymentDone ? '#ede9fe' : '#f9fafb',
                              color: r.paymentDone ? '#4f46e5' : '#9ca3af',
                              fontSize: 13, fontWeight: 700,
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = r.paymentDone ? '#ddd6fe' : '#f3f4f6';
                              e.currentTarget.style.borderColor = r.paymentDone ? '#3730a3' : '#9ca3af';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = r.paymentDone ? '#ede9fe' : '#f9fafb';
                              e.currentTarget.style.borderColor = r.paymentDone ? '#4f46e5' : '#d1d5db';
                            }}
                          >{r.paymentDone ? '✓' : '—'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {rows.length > 0 && (() => {
                    // ── Derived sums ──
                    const totalAllocated      = rows.reduce((s, r) => s + r.allocated, 0);
                    const totalTarget         = rows.reduce((s, r) => s + r.target, 0);
                    const transferDoneAmt     = rows.filter(r => r.transferDone).reduce((s, r) => s + r.allocated, 0);
                    const paymentDoneAmt      = rows.filter(r => r.paymentDone).reduce((s, r) => s + r.allocated, 0);
                    const remainingTransfer   = totalAllocated - transferDoneAmt;
                    const remainingPayment    = totalAllocated - paymentDoneAmt;

                    // Per-bank totals (all rows)
                    const bankTotals = Object.fromEntries(
                      BANKS.map(b => [b, rows.reduce((s, r) => s + (Number(r.bankAmounts[b]) || 0), 0)])
                    );
                    // Per-bank transfer-done totals
                    const bankTransferDone = Object.fromEntries(
                      BANKS.map(b => [b, rows.filter(r => r.transferDone).reduce((s, r) => s + (Number(r.bankAmounts[b]) || 0), 0)])
                    );
                    // Per-bank payment-done totals
                    const bankPaymentDone = Object.fromEntries(
                      BANKS.map(b => [b, rows.filter(r => r.paymentDone).reduce((s, r) => s + (Number(r.bankAmounts[b]) || 0), 0)])
                    );

                    const BankBadges = ({ data, emptyMsg }) => (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {BANKS.every(b => !data[b]) ? (
                          <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>{emptyMsg}</span>
                        ) : BANKS.map(b => {
                          const amt = data[b];
                          if (!amt) return null;
                          return (
                            <div key={b} style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center',
                              padding: '3px 9px', borderRadius: 7,
                              background: BANK_COLORS[b].bg,
                              border: `1.5px solid ${BANK_COLORS[b].border}`,
                              minWidth: 72,
                            }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: BANK_COLORS[b].text }}>{b}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: BANK_COLORS[b].text }}>
                                ₹{amt.toLocaleString('en-IN')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );

                    // Per-bank remaining after transfer
                    const bankTransferRemaining = Object.fromEntries(
                      BANKS.map(b => [b, (bankTotals[b] || 0) - (bankTransferDone[b] || 0)])
                    );
                    // Per-bank remaining after payment
                    const bankPaymentRemaining = Object.fromEntries(
                      BANKS.map(b => [b, (bankTotals[b] || 0) - (bankPaymentDone[b] || 0)])
                    );

                    return (
                      <tfoot>

                        {/* ══ Row 1: Sum Amount ══ */}
                        <tr style={{ background: '#f0fdf4', borderTop: '2px solid #86efac' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 800, fontSize: 13, color: '#065f46', whiteSpace: 'nowrap' }}>
                            Σ Sum Amount
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#4f46e5' }}>
                            ₹{totalTarget.toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: '#065f46' }}>
                            ₹{totalAllocated.toLocaleString('en-IN')}
                          </td>
                          <td colSpan={3} style={{ padding: '8px 12px' }}>
                            <BankBadges data={bankTotals} emptyMsg="No allocations" />
                          </td>
                        </tr>

                        {/* ══ Row 2: Transfer Done sub-row ══ */}
                        <tr style={{ background: '#f0fdf4', borderTop: '1px dashed #6ee7b7' }}>
                          <td style={{ padding: '8px 12px 4px 22px', fontSize: 11, color: '#059669', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            ✓ Transfer Done
                            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 500, marginTop: 1 }}>
                              {rows.filter(r => r.transferDone).length} of {rows.length} categories
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#059669', fontWeight: 600 }}>
                            −₹{transferDoneAmt.toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>Balance</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: remainingTransfer === 0 ? '#059669' : '#dc2626' }}>
                              ₹{remainingTransfer.toLocaleString('en-IN')}
                            </div>
                          </td>
                          <td colSpan={3} style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>Pending Transfer (Bank-wise)</span>
                              <BankBadges data={bankTransferRemaining} emptyMsg="✓ All transferred!" />
                            </div>
                          </td>
                        </tr>

                        {/* ══ Row 3: Payment Done sub-row ══ */}
                        <tr style={{ background: '#f5f3ff', borderTop: '1px dashed #c4b5fd' }}>
                          <td style={{ padding: '8px 12px 4px 22px', fontSize: 11, color: '#4f46e5', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            ✓ Payment Done
                            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 500, marginTop: 1 }}>
                              {rows.filter(r => r.paymentDone).length} of {rows.length} categories
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#4f46e5', fontWeight: 600 }}>
                            −₹{paymentDoneAmt.toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>Balance</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: remainingPayment === 0 ? '#059669' : '#dc2626' }}>
                              ₹{remainingPayment.toLocaleString('en-IN')}
                            </div>
                          </td>
                          <td colSpan={3} style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>Pending Payment (Bank-wise)</span>
                              <BankBadges data={bankPaymentRemaining} emptyMsg="✓ All paid!" />
                            </div>
                          </td>
                        </tr>

                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════
           BUDGET PLAN TAB
      ══════════════════════════════ */}
      {activeTab === 'budget' && <>

      {/* ── Bank Allocation Matrix ── */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>

            {/* ── Salary header row ── */}
            <tr style={{ background: '#1e1b4b' }}>
              <td style={{ padding: '10px 14px', color: '#fff', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
                Salary
              </td>
              <td style={{ padding: '10px 14px', color: '#a5b4fc', fontWeight: 700, textAlign: 'right' }}>
                ₹{salary.toLocaleString('en-IN')}
              </td>
              {BANKS.map(b => (
                <td key={b} style={{ padding: '10px 10px', color: '#c7d2fe', fontWeight: 600, fontSize: 12, textAlign: 'right' }}>
                  {bankColumnTotals[b] > 0 ? `₹${bankColumnTotals[b].toLocaleString('en-IN')}` : ''}
                </td>
              ))}
              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: '#a5b4fc', fontWeight: 700, marginBottom: 2 }}>BALANCE</div>
                <div style={{
                  fontWeight: 700,
                  color: salary - grandTotal < 0 ? '#fca5a5' : '#86efac',
                }}>
                  {salary - grandTotal < 0 ? '−' : '+'}₹{Math.abs(salary - grandTotal).toLocaleString('en-IN')}
                </div>
              </td>
              <td />
            </tr>

            {/* ── Column headers ── */}
            <tr style={{ background: 'var(--bg3)', borderBottom: '2px solid var(--border2)' }}>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>
                CATEGORY
              </th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>
                TARGET
              </th>
              {BANKS.map(b => (
                <th key={b} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                    background: BANK_COLORS[b].bg, color: BANK_COLORS[b].text,
                    border: `1px solid ${BANK_COLORS[b].border}`, fontSize: 10, fontWeight: 700,
                  }}>{b}</span>
                </th>
              ))}
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>
                TOTAL
              </th>
              <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>
                ACTIONS
              </th>
            </tr>
          </thead>

          <tbody>
            {budgets.length === 0 ? (
              <tr>
                <td colSpan={BANKS.length + 4} style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                  No budget categories set for this month.
                </td>
              </tr>
            ) : (
              budgets.map((item, idx) => {
                const ba       = item.bankAmounts || {};
                const rowTotal = BANKS.reduce((s, b) => s + (Number(ba[b]) || 0), 0);
                const target   = Number(item.target) || 0;

                return (
                  <tr key={item.id} style={{
                    borderBottom: '1px solid var(--border2)',
                    background: idx % 2 === 0 ? 'var(--bg1)' : 'var(--bg2)',
                  }}>
                    <td style={{ padding: '9px 14px', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
                      {item.category}
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: '#4f46e5' }}>
                      {target > 0 ? `₹${target.toLocaleString('en-IN')}` : '—'}
                    </td>
                    {BANKS.map(b => {
                      const val = Number(ba[b]) || 0;
                      return (
                        <td key={b} style={{
                          padding: '9px 10px', textAlign: 'right',
                          fontWeight: val > 0 ? 600 : 400,
                          color: val > 0 ? '#111827' : '#d1d5db',
                        }}>
                          {val > 0 ? `₹${val.toLocaleString('en-IN')}` : '—'}
                        </td>
                      );
                    })}
                    <td style={{
                      padding: '9px 14px', textAlign: 'right', fontWeight: 700,
                      color: target > 0 && rowTotal !== target
                        ? (rowTotal > target ? '#dc2626' : '#d97706')
                        : '#059669',
                    }}>
                      {`₹${rowTotal.toLocaleString('en-IN')}`}
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setFormData({
                              category:    item.category,
                              target:      item.target,
                              bankAmounts: { ...Object.fromEntries(BANKS.map(b => [b, ''])), ...ba },
                            });
                            setIsModalOpen(true);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                            border: '1.5px solid #c7d2fe', background: '#eef2ff', color: '#4338ca',
                            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                            transition: 'background 0.15s, color 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#4338ca'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.color = '#4338ca'; }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(item.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                            border: '1.5px solid #fecaca', background: '#fff1f2', color: '#dc2626',
                            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                            transition: 'background 0.15s, color 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#fff1f2'; e.currentTarget.style.color = '#dc2626'; }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* ── Totals footer ── */}
          {budgets.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f0fdf4', borderTop: '2px solid #86efac' }}>
                <td style={{ padding: '11px 14px', fontWeight: 700, fontSize: 13 }}>Total</td>
                <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#4f46e5' }}>
                  ₹{budgets.reduce((s, i) => s + (Number(i.target) || 0), 0).toLocaleString('en-IN')}
                </td>
                {BANKS.map(b => (
                  <td key={b} style={{
                    padding: '11px 10px', textAlign: 'right', fontWeight: 700,
                    color: bankColumnTotals[b] > 0 ? '#065f46' : '#d1d5db',
                  }}>
                    {bankColumnTotals[b] > 0 ? `₹${bankColumnTotals[b].toLocaleString('en-IN')}` : '—'}
                  </td>
                ))}
                <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#065f46' }}>
                  ₹{grandTotal.toLocaleString('en-IN')}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          + Add Budget Category
        </button>
        <button
          onClick={() => setShowDefaultsModal(true)}
          style={{
            height: 38, padding: '0 16px', borderRadius: 8,
            border: '1.5px solid #6366f1', background: '#ede9fe',
            color: '#4f46e5', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#4f46e5'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#ede9fe'; e.currentTarget.style.color = '#4f46e5'; }}
        >
          ⚙️ Set Up Budget
        </button>
      </div>

      </> /* end budget tab */}

      {/* ── Add / Edit Modal ── */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: '#ffffff', borderRadius: 18,
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
            width: '100%', maxWidth: 480,
            maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>

            {/* Header */}
            <div style={{
              padding: '20px 24px 16px', borderBottom: '1.5px solid #e5e7eb',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
                  {editingItem ? '✏️ Edit Budget Item' : '➕ Add Budget Item'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
                  {editingItem ? `Editing: ${editingItem.category}` : 'Fill in the category and allocation details'}
                </p>
              </div>
              <button
                type="button" onClick={closeModal}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: '1.5px solid #e5e7eb', background: '#f3f4f6',
                  color: '#374151', fontSize: 16, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#374151'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151'; }}
              >✕</button>
            </div>

            {/* Scrollable body */}
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* Category */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                    Category Name
                  </label>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9ca3af' }}>Must match the Expense category exactly</p>
                  <input
                    placeholder="e.g. Room Rent, Credit Card"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    required
                    style={{
                      width: '100%', height: 44, padding: '0 14px', boxSizing: 'border-box',
                      fontSize: 15, fontWeight: 500, color: '#111827',
                      border: '1.5px solid #d1d5db', borderRadius: 10, outline: 'none',
                      background: '#f9fafb',
                    }}
                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                  />
                </div>

                {/* Target — calculator input */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                    Monthly Target Amount
                  </label>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9ca3af' }}>
                    Type a number or expression: <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>50000+6000</code>&nbsp;
                    <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>72000/2</code>&nbsp;
                    <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>5000*12</code>
                  </p>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 15, color: '#6b7280', pointerEvents: 'none', fontWeight: 600,
                    }}>₹</span>
                    <input
                      type="text"
                      placeholder="e.g. 50000 or 30000+6000"
                      value={formData.target}
                      onChange={e => setFormData({ ...formData, target: e.target.value })}
                      required
                      style={{
                        width: '100%', height: 44, padding: '0 14px 0 30px', boxSizing: 'border-box',
                        fontSize: 15, fontWeight: 600, color: '#111827',
                        border: '1.5px solid #d1d5db', borderRadius: 10, outline: 'none',
                        background: '#f9fafb',
                      }}
                      onFocus={e => e.target.style.borderColor = '#6366f1'}
                      onBlur={e => {
                        e.target.style.borderColor = '#d1d5db';
                        // Evaluate expression on blur
                        try {
                          const raw = formData.target.toString().trim();
                          if (/^[\d\s\+\-\*\/\.\(\)]+$/.test(raw)) {
                            // eslint-disable-next-line no-eval
                            const result = Math.round(eval(raw));
                            if (!isNaN(result) && isFinite(result) && result >= 0) {
                              setFormData(prev => ({ ...prev, target: String(result) }));
                            }
                          }
                        } catch {}
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          try {
                            const raw = formData.target.toString().trim();
                            if (/^[\d\s\+\-\*\/\.\(\)]+$/.test(raw)) {
                              // eslint-disable-next-line no-eval
                              const result = Math.round(eval(raw));
                              if (!isNaN(result) && isFinite(result) && result >= 0) {
                                setFormData(prev => ({ ...prev, target: String(result) }));
                              }
                            }
                          } catch {}
                        }
                      }}
                    />
                    {/* Live preview of expression result */}
                    {/[\+\-\*\/]/.test(String(formData.target)) && (() => {
                      try {
                        const raw = String(formData.target).trim();
                        if (/^[\d\s\+\-\*\/\.\(\)]+$/.test(raw)) {
                          // eslint-disable-next-line no-eval
                          const result = Math.round(eval(raw));
                          if (!isNaN(result) && isFinite(result) && result >= 0) {
                            return (
                              <div style={{
                                marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                              }}>
                                <span style={{ fontSize: 12, color: '#6b7280' }}>= </span>
                                <span style={{
                                  fontSize: 14, fontWeight: 700, color: '#4f46e5',
                                  background: '#eef2ff', padding: '2px 10px', borderRadius: 6,
                                }}>
                                  ₹{result.toLocaleString('en-IN')}
                                </span>
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>press Enter or click away to apply</span>
                              </div>
                            );
                          }
                        }
                      } catch {}
                      return (
                        <div style={{ marginTop: 6 }}>
                          <span style={{ fontSize: 12, color: '#dc2626' }}>⚠ Invalid expression</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Bank Allocation */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Bank Allocation</label>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: '#065f46',
                      background: '#d1fae5', padding: '3px 10px', borderRadius: 99,
                    }}>
                      Total: ₹{BANKS.reduce((s, b) => s + (Number(formData.bankAmounts[b]) || 0), 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {BANKS.map(b => (
                      <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          width: 140, fontSize: 12, fontWeight: 700, flexShrink: 0,
                          padding: '6px 10px', borderRadius: 8, textAlign: 'center',
                          background: BANK_COLORS[b].bg, color: BANK_COLORS[b].text,
                          border: `1.5px solid ${BANK_COLORS[b].border}`,
                        }}>{b}</span>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <span style={{
                            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                            fontSize: 14, color: '#6b7280', pointerEvents: 'none', fontWeight: 600,
                          }}>₹</span>
                          <input
                            type="number" min="0" placeholder="0"
                            value={formData.bankAmounts[b]}
                            onChange={e => setFormData({
                              ...formData,
                              bankAmounts: { ...formData.bankAmounts, [b]: e.target.value },
                            })}
                            style={{
                              width: '100%', height: 40, paddingLeft: 28, paddingRight: 12,
                              boxSizing: 'border-box', fontSize: 14, fontWeight: 600, color: '#111827',
                              textAlign: 'right',
                              background: Number(formData.bankAmounts[b]) > 0 ? BANK_COLORS[b].bg : '#f9fafb',
                              border: `1.5px solid ${Number(formData.bankAmounts[b]) > 0 ? BANK_COLORS[b].border : '#e5e7eb'}`,
                              borderRadius: 8, outline: 'none',
                            }}
                            onFocus={e => e.target.style.borderColor = '#6366f1'}
                            onBlur={e => e.target.style.borderColor = Number(e.target.value) > 0 ? BANK_COLORS[b].border : '#e5e7eb'}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Footer buttons */}
              <div style={{
                padding: '16px 24px', borderTop: '1.5px solid #e5e7eb',
                display: 'flex', gap: 10, flexShrink: 0,
              }}>
                <button
                  type="button" onClick={closeModal}
                  style={{
                    flex: 1, height: 44, borderRadius: 10,
                    border: '1.5px solid #e5e7eb', background: '#f9fafb',
                    color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f9fafb'}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 2, height: 44, borderRadius: 10, border: 'none',
                    background: '#4f46e5', color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#4338ca'}
                  onMouseLeave={e => e.currentTarget.style.background = '#4f46e5'}
                >
                  {editingItem ? '💾 Update Budget' : '💾 Save Budget Plan'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <ConfirmDelete onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      )}

      {/* ══════════════════════════════════════════════════════
          Defaults Modal  — explicit colours, no CSS var risk
      ══════════════════════════════════════════════════════ */}
      {showDefaultsModal && (
        <div style={{
          position:       'fixed',
          inset:          0,
          zIndex:         1200,
          background:     'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        '16px',
        }}>
          <div style={{
            background:    POPUP.surface,
            borderRadius:  '18px',
            boxShadow:     '0 24px 64px rgba(0,0,0,0.30)',
            width:         '100%',
            maxWidth:      '780px',
            maxHeight:     '90vh',
            display:       'flex',
            flexDirection: 'column',
            overflow:      'hidden',
          }}>

            {/* ── Modal Header ── */}
            <div style={{
              padding:      '20px 24px 16px',
              borderBottom: `1.5px solid ${POPUP.border}`,
              background:   POPUP.surface,
              position:     'relative',
              flexShrink:   0,
            }}>
              <button
                type="button"
                onClick={() => setShowDefaultsModal(false)}
                title="Close"
                style={{
                  position: 'absolute', top: '14px', right: '16px',
                  width: '34px', height: '34px', borderRadius: '50%',
                  border: `1.5px solid ${POPUP.border}`,
                  background: '#f3f4f6', color: '#374151',
                  fontSize: '16px', fontWeight: 700, lineHeight: 1,
                  cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s', flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#374151'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151'; }}
              >
                ✕
              </button>

              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: POPUP.textPrimary, paddingRight: 44 }}>
                Set Up Budget — {month}/{year}
              </h3>

              <p style={{ margin: '6px 0 0', fontSize: 12, color: POPUP.textMuted }}>
                {isSyncing ? (
                  `⏳ Syncing from last month's expenses…`
                ) : syncedCategories.size > 0 ? (
                  <>
                    <span style={{ color: '#059669', fontWeight: 600 }}>
                      ✅ {syncedCategories.size} categories auto-filled from {pm}/{py} expenses.
                    </span>
                    {blankCount > 0 && (
                      <span style={{ color: '#b45309', fontWeight: 600 }}>
                        {' '}Fill in the {blankCount} remaining field{blankCount > 1 ? 's' : ''}.
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    No expense data found for {pm}/{py}.
                    {blankCount > 0
                      ? ` Enter the ${blankCount} highlighted amount${blankCount > 1 ? 's' : ''}.`
                      : ' All amounts ready!'}
                  </>
                )}
              </p>
            </div>

            {/* ── Scrollable rows ── */}
            <form
              onSubmit={handleSaveDefaults}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
            >
              <div style={{ overflowY: 'auto', overflowX: 'auto', padding: '10px 20px 6px', flex: 1 }}>

                {/* Column mini-headers */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 150px 90px repeat(6, 78px)',
                  gap: 5, padding: '4px 8px', marginBottom: 4,
                }}>
                  <span />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af' }}>CATEGORY</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textAlign: 'right' }}>TARGET</span>
                  {BANKS.map(b => (
                    <span key={b} style={{
                      fontSize: 9, fontWeight: 700, textAlign: 'center',
                      color: BANK_COLORS[b].text, background: BANK_COLORS[b].bg,
                      padding: '2px 3px', borderRadius: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{b}</span>
                  ))}
                </div>

                {defaultDrafts.map((draft, i) => {
                  const isBlank    = draft.target.trim() === '';
                  const isSynced   = syncedCategories.has(draft.category);
                  const isExcluded = SYNC_EXCLUDED.includes(draft.category.toLowerCase().trim());

                  return (
                    <div
                      key={draft.category}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '20px 150px 90px repeat(6, 78px)',
                        alignItems: 'center',
                        gap: 5,
                        padding: '6px 8px',
                        borderRadius: '9px',
                        marginBottom: '4px',
                        background:   isBlank ? POPUP.rowBlank : POPUP.rowDefault,
                        border:       `1.5px solid ${isBlank ? POPUP.borderBlank : isSynced ? POPUP.borderSync : POPUP.border}`,
                      }}
                    >
                      {/* Index */}
                      <span style={{ textAlign: 'right', fontSize: 10, color: '#9ca3af', fontWeight: 700 }}>
                        {i + 1}
                      </span>

                      {/* Category + badges */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 600, color: POPUP.textPrimary,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {draft.category}
                        </span>
                        {isSynced && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, flexShrink: 0,
                            padding: '1px 5px', borderRadius: 99,
                            color: POPUP.badgeSync.text, background: POPUP.badgeSync.bg,
                          }}>SYNCED</span>
                        )}
                        {!isSynced && isExcluded && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, flexShrink: 0,
                            padding: '1px 5px', borderRadius: 99,
                            color: POPUP.badgeFixed.text, background: POPUP.badgeFixed.bg,
                          }}>FIXED</span>
                        )}
                      </div>

                      {/* Target input */}
                      <div style={{ position: 'relative' }}>
                        <span style={{
                          position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                          fontSize: 11, color: '#6b7280', pointerEvents: 'none',
                        }}>₹</span>
                        <input
                          type="number" min="0" step="1" required
                          placeholder={isBlank ? '?' : ''}
                          value={draft.target}
                          onChange={e => updateDraft(i, 'target', e.target.value)}
                          style={{
                            width: '100%', paddingLeft: 18, paddingRight: 4, height: 30,
                            fontSize: 12, fontWeight: 600, color: '#111827', background: '#ffffff',
                            border: `1.5px solid ${isBlank ? '#f59e0b' : '#d1d5db'}`,
                            borderRadius: 6, outline: 'none', boxSizing: 'border-box',
                          }}
                          onFocus={e  => e.target.style.borderColor = '#6366f1'}
                          onBlur={e   => e.target.style.borderColor = e.target.value.trim() === '' ? '#f59e0b' : '#d1d5db'}
                        />
                      </div>

                      {/* Bank allocation inputs */}
                      {BANKS.map(b => (
                        <input
                          key={b}
                          type="number" min="0" step="1"
                          placeholder="0"
                          value={draft.bankAmounts[b] === 0 ? '' : draft.bankAmounts[b]}
                          onChange={e => updateDraft(i, b, e.target.value === '' ? 0 : Number(e.target.value))}
                          style={{
                            width: '100%', padding: '0 6px', height: 30,
                            fontSize: 11, fontWeight: 600, color: '#111827', textAlign: 'right',
                            background: Number(draft.bankAmounts[b]) > 0 ? BANK_COLORS[b].bg : '#ffffff',
                            border: `1.5px solid ${Number(draft.bankAmounts[b]) > 0 ? BANK_COLORS[b].border : '#e5e7eb'}`,
                            borderRadius: 6, outline: 'none', boxSizing: 'border-box',
                          }}
                          onFocus={e  => e.target.style.borderColor = '#6366f1'}
                          onBlur={e   => e.target.style.borderColor = Number(e.target.value) > 0 ? BANK_COLORS[b].border : '#e5e7eb'}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* ── Footer ── */}
              <div style={{
                padding: '14px 20px', borderTop: `1.5px solid ${POPUP.border}`,
                display: 'flex', gap: 10, flexShrink: 0, background: POPUP.surface,
              }}>
                <button
                  type="button"
                  onClick={() => setShowDefaultsModal(false)}
                  style={{
                    flex: 1, height: 42, borderRadius: 10,
                    border: `1.5px solid ${POPUP.border}`,
                    background: '#f9fafb', color: '#374151',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Skip for now
                </button>
                <button
                  type="submit"
                  disabled={isSavingDefaults || isSyncing}
                  style={{
                    flex: 2, height: 42, borderRadius: 10, border: 'none',
                    background: (isSavingDefaults || isSyncing) ? '#a5b4fc' : '#4f46e5',
                    color: '#ffffff', fontSize: 13, fontWeight: 700,
                    cursor: (isSavingDefaults || isSyncing) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSavingDefaults ? 'Saving…' : isSyncing ? 'Loading…' : 'Save All Categories'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}