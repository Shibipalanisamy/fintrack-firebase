import { db, auth } from './firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, getDocs, Timestamp, setDoc, getDoc } from 'firebase/firestore';

const uid = () => auth.currentUser?.uid;
const toDate = (d) => {
  if (!d) return new Date();
  if (d?.toDate) return d.toDate(); // Firestore Timestamp
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

// ─── PIN SERVICE (cross-device sync) ──────────────────────
// Stores PIN in Firestore userSettings/{uid} + caches in localStorage
const PIN_CACHE_KEY = 'fintrack_page_pins_v2';
export const pinService = {
  // Read from localStorage cache instantly
  getCached(page) {
    try { return JSON.parse(localStorage.getItem(PIN_CACHE_KEY) || '{}')[page] || ''; } catch { return ''; }
  },
  // Write to localStorage cache
  setCached(page, pin) {
    try { const d = JSON.parse(localStorage.getItem(PIN_CACHE_KEY) || '{}'); d[page] = pin; localStorage.setItem(PIN_CACHE_KEY, JSON.stringify(d)); } catch {}
  },
  // Fetch PIN from Firestore and update cache
  async get(page) {
    try {
      const snap = await getDoc(doc(db, 'userSettings', uid()));
      if (snap.exists()) {
        const pins = snap.data().pins || {};
        // Sync all pins to local cache
        localStorage.setItem(PIN_CACHE_KEY, JSON.stringify(pins));
        return pins[page] || '';
      }
    } catch {}
    return this.getCached(page);
  },
  // Save PIN to both Firestore and localStorage
  async set(page, pin) {
    try {
      const ref = doc(db, 'userSettings', uid());
      const snap = await getDoc(ref);
      const existing = snap.exists() ? (snap.data().pins || {}) : {};
      const updated = { ...existing, [page]: pin };
      await setDoc(ref, { pins: updated, updatedAt: Timestamp.now() }, { merge: true });
      localStorage.setItem(PIN_CACHE_KEY, JSON.stringify(updated));
    } catch {
      // Fallback: save locally only
      this.setCached(page, pin);
    }
  },
  // Remove PIN from Firestore and cache
  async remove(page) {
    try {
      const ref = doc(db, 'userSettings', uid());
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const existing = snap.data().pins || {};
        delete existing[page];
        await setDoc(ref, { pins: existing, updatedAt: Timestamp.now() }, { merge: true });
        localStorage.setItem(PIN_CACHE_KEY, JSON.stringify(existing));
      }
    } catch {
      this.setCached(page, '');
    }
  }
};

// ─── INCOME ───────────────────────────────────────────────
export const incomeService = {
  async getAll(filters = {}) {
    const q = query(collection(db, 'income'), where('userId', '==', uid()), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data(), date: toDate(d.data().date) }));
    if (filters.dateFrom && filters.dateTo) {
      const from = new Date(filters.dateFrom); const to = new Date(filters.dateTo); to.setHours(23,59,59,999);
      docs = docs.filter(d => new Date(d.date) >= from && new Date(d.date) <= to);
    } else if (filters.month && filters.year) docs = docs.filter(d => new Date(d.date).getMonth() + 1 === +filters.month && new Date(d.date).getFullYear() === +filters.year);
    else if (filters.year) docs = docs.filter(d => new Date(d.date).getFullYear() === +filters.year);
    if (filters.search) { const s = filters.search.toLowerCase(); docs = docs.filter(d => d.notes?.toLowerCase().includes(s) || d.category?.toLowerCase().includes(s)); }
    return docs;
  },
  async create(data) { return addDoc(collection(db, 'income'), { ...data, userId: uid(), date: Timestamp.fromDate(new Date(data.date)), createdAt: Timestamp.now() }); },
  async update(id, data) { return updateDoc(doc(db, 'income', id), { ...data, date: Timestamp.fromDate(new Date(data.date)) }); },
  async delete(id) { return deleteDoc(doc(db, 'income', id)); }
};

// ─── EXPENSES ─────────────────────────────────────────────
export const expenseService = {
  async getAll(filters = {}) {
    const q = query(collection(db, 'expenses'), where('userId', '==', uid()), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data(), date: toDate(d.data().date) }));
    if (filters.dateFrom && filters.dateTo) {
      const from = new Date(filters.dateFrom); const to = new Date(filters.dateTo); to.setHours(23,59,59,999);
      docs = docs.filter(d => new Date(d.date) >= from && new Date(d.date) <= to);
    } else if (filters.month && filters.year) docs = docs.filter(d => new Date(d.date).getMonth() + 1 === +filters.month && new Date(d.date).getFullYear() === +filters.year);
    else if (filters.year) docs = docs.filter(d => new Date(d.date).getFullYear() === +filters.year);
    if (filters.category) docs = docs.filter(d => d.category === filters.category);
    if (filters.search) { const s = filters.search.toLowerCase(); docs = docs.filter(d => d.itemName?.toLowerCase().includes(s) || d.notes?.toLowerCase().includes(s) || d.category?.toLowerCase().includes(s)); }
    return docs;
  },
  async create(data) { return addDoc(collection(db, 'expenses'), { ...data, userId: uid(), date: Timestamp.fromDate(new Date(data.date)), createdAt: Timestamp.now() }); },
  async update(id, data) { return updateDoc(doc(db, 'expenses', id), { ...data, date: Timestamp.fromDate(new Date(data.date)) }); },
  async delete(id) { return deleteDoc(doc(db, 'expenses', id)); }
};

// ─── INVESTMENTS / STOCKS ──────────────────────────────────
export const investmentService = {
  async getAll() {
    const q = query(collection(db, 'investments'), where('userId', '==', uid()), orderBy('purchaseDate', 'desc'));
    const snap = await getDocs(q);
    const items = snap.docs.map(d => {
      const data = d.data();
      const invested = data.purchasePrice * data.quantity;
      const current = (data.currentPrice || data.purchasePrice) * data.quantity;
      return { id: d.id, ...data, purchaseDate: toDate(data.purchaseDate), totalInvested: invested, currentValue: current, profitLoss: current - invested, profitLossPct: ((current - invested) / invested * 100).toFixed(2) };
    });
    const totalPortfolio = items.reduce((s, i) => s + i.currentValue, 0);
    return items.map(i => ({ ...i, allocation: totalPortfolio > 0 ? ((i.currentValue / totalPortfolio) * 100).toFixed(1) : '0' }));
  },
  async create(data) { return addDoc(collection(db, 'investments'), { ...data, userId: uid(), purchaseDate: Timestamp.fromDate(new Date(data.purchaseDate)), createdAt: Timestamp.now() }); },
  async update(id, data) {
    const { id: _id, totalInvested, currentValue, profitLoss, profitLossPct, allocation, ...cleanData } = data;
    return updateDoc(doc(db, 'investments', id), {
      ...cleanData,
      purchaseDate: Timestamp.fromDate(new Date(cleanData.purchaseDate)),
      currentPrice: parseFloat(cleanData.currentPrice) || parseFloat(cleanData.purchasePrice) || 0,
      quantity: parseFloat(cleanData.quantity) || 0,
      purchasePrice: parseFloat(cleanData.purchasePrice) || 0,
    });
  },
  async delete(id) { return deleteDoc(doc(db, 'investments', id)); }
};

// ─── NET WORTH (Assets & Liabilities) ─────────────────────
export const netWorthService = {
  async get() {
    const q = query(collection(db, 'networth'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    if (snap.empty) return { id: null, assets: [], liabilities: [] };
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  },
  async save(data) {
    const q = query(collection(db, 'networth'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    if (snap.empty) await addDoc(collection(db, 'networth'), { ...data, userId: uid() });
    else await updateDoc(doc(db, 'networth', snap.docs[0].id), data);
  }
};

// ─── LOANS ────────────────────────────────────────────────
export const loanService = {
  async getAll() {
    const q = query(collection(db, 'loans'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async create(data) { return addDoc(collection(db, 'loans'), { ...data, userId: uid(), createdAt: Timestamp.now() }); },
  async update(id, data) { return updateDoc(doc(db, 'loans', id), data); },
  async close(id, summary) { return updateDoc(doc(db, 'loans', id), { status: 'closed', closedAt: Timestamp.now(), closedSummary: summary }); },
  async delete(id) { return deleteDoc(doc(db, 'loans', id)); }
};

// ─── CATEGORIES ───────────────────────────────────────────
const DEFAULT_INCOME_CATS = ['Salary','Freelance','Business','Dividends','Interest','Rental Income','Other'];
const DEFAULT_EXPENSE_CATS = [
  'House Rent / Advance','Gas Booking or Advance','Document Maintenance Safety',
  'Home Appliances','Snacks','Unwanted Expenses','Grocery','Our Dress',
  'Bus Booking','Baby Toys','Baby Dress','Water Can and Advance','Bike Petrol',
  'Cab','Internet / Modem','Flour','Vegetables for Office','Milk','Oil',
  'Wife Basic Needs','Bike Service','Fruits','Hotel Food','Meat or Egg',
  'Juice','Basic Needs','Train Booking','MTC Bus Fees','Home Town Bus Fee',
  'Soap and Detergent','Electronic Items','Beauty Products','Doctor Consultation Fees',
  'Medical Treatment','Chicken Cutting','Xerox / Photo','Car Petrol',
  'Snacks for Others','Gokul Bike Petrol','Outside Food','Amazon Shopping',
  'Parking','Dry Fruits','Gifts','Mobile Recharge','Share Auto','Baby Needs',
  'Baby School Needs','Service','Rice','Stationery','Electricity Bill',
  'Tax Fees','OTT','Gold Investment','Stock Investment','RD Amount',
  'Business Investment','Bank Deposit','Home Town Fees','Chittu Amount',
  'Personal Loan','Credit Card Payment','Health Insurance','Mobile Accessories',
  'God / Devotional','Hospital Fees','Wife Investment Amount','Home Town Festival',
  'SIP Mutual Fund','Entertainment','Curd','Scan and Test','Gold Loan',
  'Tea and Snack Office','Book Reading','Term Insurance','PPF','Ramya Budget',
  'Meal Card','For Agriculture','Amazon Pay','Condolence','Paneer'
];
const COLORS = ['#f97316','#22c55e','#93c5fd','#a78bfa','#fbbf24','#fb923c','#f43f5e','#d8b4fe','#38bdf8','#fb7185','#6ee7b7','#94a3b8','#10d98a','#3b9eed','#e879f9','#facc15','#a3e635','#34d399','#60a5fa','#f472b6'];

export const categoryService = {
  async getAll(type) {
    const q = query(collection(db, 'categories'), where('userId', '==', uid()), where('type', '==', type));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async seedDefaults(userId) {
    const snap = await getDocs(query(collection(db, 'categories'), where('userId', '==', userId), where('type', '==', 'income')));
    if (snap.empty) {
      for (let i = 0; i < DEFAULT_INCOME_CATS.length; i++) await addDoc(collection(db, 'categories'), { userId, name: DEFAULT_INCOME_CATS[i], type: 'income', isDefault: true, color: COLORS[i % COLORS.length] });
      for (let i = 0; i < DEFAULT_EXPENSE_CATS.length; i++) await addDoc(collection(db, 'categories'), { userId, name: DEFAULT_EXPENSE_CATS[i], type: 'expense', isDefault: true, color: COLORS[i % COLORS.length] });
    }
  },
  async create(data) { return addDoc(collection(db, 'categories'), { ...data, userId: uid() }); },
  async update(id, data) { return updateDoc(doc(db, 'categories', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'categories', id)); }
};

// ─── STOCK MASTER ─────────────────────────────────────────
const DEFAULT_STOCKS = [
  { symbol: 'TATACHEM', name: 'Tata Chemicals Ltd', sector: 'Chemicals' },
  { symbol: 'WIPRO', name: 'Wipro Ltd', sector: 'IT' },
  { symbol: 'BIOCON', name: 'Biocon Ltd', sector: 'Pharma' },
  { symbol: 'SBICARD', name: 'SBI Cards and Payment Services Ltd', sector: 'Finance' },
  { symbol: 'GOLDBEES', name: 'Nippon India ETF Gold BeES', sector: 'ETF' },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto Ltd', sector: 'Auto' },
  { symbol: 'MUTHOOTFIN', name: 'Muthoot Finance Ltd', sector: 'Finance' },
  { symbol: 'PHARMABEES', name: 'Nippon India ETF Pharma BeES', sector: 'ETF' },
  { symbol: 'DRREDDY', name: 'Dr. Reddy Laboratories Ltd', sector: 'Pharma' },
  { symbol: 'COSMOFIRST', name: 'Cosmo First Ltd', sector: 'Chemicals' },
  { symbol: 'IOC', name: 'Indian Oil Corporation Ltd', sector: 'Energy' },
  { symbol: 'IDFCFIRSTB', name: 'IDFC First Bank Ltd', sector: 'Banking' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', sector: 'Auto' },
  { symbol: 'ITCHOTELS', name: 'ITC Hotels Ltd', sector: 'Hospitality' },
  { symbol: 'HDFCLIFE', name: 'HDFC Life Insurance Company Ltd', sector: 'Insurance' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', sector: 'Telecom' },
  { symbol: 'ITC', name: 'ITC Ltd', sector: 'FMCG' },
  { symbol: 'KTKBANK', name: 'Karnataka Bank Ltd', sector: 'Banking' },
  { symbol: 'EXIDEIND', name: 'Exide Industries Ltd', sector: 'Auto Ancillary' },
  { symbol: 'SOUTHBANK', name: 'South Indian Bank Ltd', sector: 'Banking' },
  { symbol: 'GOLDIETF', name: 'Goldman Sachs Gold ETF', sector: 'ETF' },
  { symbol: 'ARE&M', name: 'Amara Raja Energy & Mobility Ltd', sector: 'Auto Ancillary' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Banking' },
  { symbol: 'HCLTECH', name: 'HCL Technologies Ltd', sector: 'IT' },
  { symbol: 'TATASTEEL', name: 'Tata Steel Ltd', sector: 'Metals' },
  { symbol: 'STOVEKRAFT', name: 'Stovekraft Ltd', sector: 'Consumer' },
  { symbol: 'BSOFT', name: 'BIRLASOFT Ltd', sector: 'IT' },
  { symbol: 'ZYDUSLIFE', name: 'Zydus Lifesciences Ltd', sector: 'Pharma' },
  { symbol: 'FEDFINA', name: 'Federal Bank Financial Services Ltd', sector: 'Finance' },
  { symbol: 'KESORAMIND', name: 'Kesoram Industries Ltd', sector: 'Cement' },
  { symbol: 'SPANDANA', name: 'Spandana Sphoorty Financial Ltd', sector: 'Finance' },
  { symbol: 'ITBEES', name: 'Nippon India ETF Nifty IT', sector: 'ETF' },
  { symbol: 'BOM:543290', name: 'BSE Listed Stock 543290', sector: 'Other' },
  { symbol: 'TITAN', name: 'Titan Company Ltd', sector: 'Consumer' },
  { symbol: 'PETRONET', name: 'Petronet LNG Ltd', sector: 'Energy' },
  { symbol: 'BPCL', name: 'Bharat Petroleum Corporation Ltd', sector: 'Energy' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'Banking' },
];

export const stockMasterService = {
  async getAll() {
    const q = query(collection(db, 'stockmaster'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.symbol.localeCompare(b.symbol));
  },
  async seedDefaults(userId) {
    const snap = await getDocs(query(collection(db, 'stockmaster'), where('userId', '==', userId)));
    if (snap.empty) {
      for (const s of DEFAULT_STOCKS) {
        await addDoc(collection(db, 'stockmaster'), { ...s, userId, isDefault: true });
      }
    }
  },
  async create(data) { return addDoc(collection(db, 'stockmaster'), { ...data, userId: uid() }); },
  async update(id, data) { return updateDoc(doc(db, 'stockmaster', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'stockmaster', id)); }
};

// ─── LOAN PAYMENTS ────────────────────────────────────────
export const loanPaymentService = {
  async getAll(loanId) {
    const q = query(collection(db, 'loanpayments'), where('userId', '==', uid()), where('loanId', '==', loanId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date) - new Date(a.date));
  },
  async create(data) { return addDoc(collection(db, 'loanpayments'), { ...data, userId: uid(), createdAt: Timestamp.now() }); },
  async delete(id) { return deleteDoc(doc(db, 'loanpayments', id)); }
};

// ─── GOLD INVESTMENTS ─────────────────────────────────────
export const goldService = {
  async getAll() {
    const q = query(collection(db, 'goldinvestments'), where('userId', '==', uid()), orderBy('purchaseDate', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data(), purchaseDate: toDate(d.data().purchaseDate) }));
  },
  async create(data) { return addDoc(collection(db, 'goldinvestments'), { ...data, userId: uid(), purchaseDate: Timestamp.fromDate(new Date(data.purchaseDate)), createdAt: Timestamp.now() }); },
  async update(id, data) { return updateDoc(doc(db, 'goldinvestments', id), { ...data, purchaseDate: Timestamp.fromDate(new Date(data.purchaseDate)) }); },
  async delete(id) { return deleteDoc(doc(db, 'goldinvestments', id)); }
};

// ─── DIVIDENDS ────────────────────────────────────────────
const parseDateSafe = (d) => {
  if (!d) return new Date();
  // Handle YYYY-MM-DD string — avoid UTC midnight timezone shift by parsing as local
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  if (d?.toDate) return d.toDate(); // Firestore Timestamp
  return new Date(d);
};

export const dividendService = {
  async getAll() {
    // No orderBy — sort client-side to avoid requiring a composite Firestore index
    const q = query(collection(db, 'dividends'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data(), date: toDate(d.data().date) }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  },
  async create(data) { return addDoc(collection(db, 'dividends'), { ...data, userId: uid(), date: Timestamp.fromDate(parseDateSafe(data.date)), createdAt: Timestamp.now() }); },
  async update(id, data) { return updateDoc(doc(db, 'dividends', id), { ...data, date: Timestamp.fromDate(parseDateSafe(data.date)) }); },
  async delete(id) { return deleteDoc(doc(db, 'dividends', id)); }
};

// ─── BROKER MASTER ────────────────────────────────────────
const DEFAULT_BROKERS = [
  { name: 'Angel One', icon: '🔶', color: '#f97316' },
  { name: 'Mstock', icon: '🟦', color: '#3b82f6' },
  { name: 'Aionion', icon: '🟣', color: '#8b5cf6' },
];

// ─── RECURRING EXPENSES ───────────────────────────────────
export const recurringService = {
  async getAll() {
    const q = query(collection(db, 'recurring'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async create(data) { return addDoc(collection(db, 'recurring'), { ...data, userId: uid(), createdAt: Timestamp.now() }); },
  async update(id, data) { return updateDoc(doc(db, 'recurring', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'recurring', id)); }
};

// ─── FINANCIAL GOALS ─────────────────────────────────────
export const goalsService = {
  async getAll() {
    const q = query(collection(db, 'goals'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async create(data) { return addDoc(collection(db, 'goals'), { ...data, userId: uid(), createdAt: Timestamp.now() }); },
  async update(id, data) { return updateDoc(doc(db, 'goals', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'goals', id)); }
};

export const brokerService = {
  async getAll() {
    const q = query(collection(db, 'brokers'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async seedDefaults(userId) {
    const snap = await getDocs(query(collection(db, 'brokers'), where('userId', '==', userId)));
    if (snap.empty) {
      for (const b of DEFAULT_BROKERS) await addDoc(collection(db, 'brokers'), { ...b, userId, isDefault: true });
    }
  },
  async create(data) { return addDoc(collection(db, 'brokers'), { ...data, userId: uid() }); },
  async update(id, data) { return updateDoc(doc(db, 'brokers', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'brokers', id)); }
};



// ─── CARDS SERVICE ────────────────────────────────────────
export const cardsService = {
  async getAll() {
    const q = query(collection(db, 'cards'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async create(data) { return addDoc(collection(db, 'cards'), { ...data, userId: uid(), createdAt: Timestamp.now() }); },
  async update(id, data) { return updateDoc(doc(db, 'cards', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'cards', id)); }
};

// ─── ACCOUNTS SERVICE (double-entry) ──────────────────────
export const accountsService = {
  async getAll() {
    const q = query(collection(db, 'accounts'), where('userId', '==', uid()));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async create(data) { return addDoc(collection(db, 'accounts'), { ...data, userId: uid(), createdAt: Timestamp.now() }); },
  async update(id, data) { return updateDoc(doc(db, 'accounts', id), data); },
  async delete(id) { return deleteDoc(doc(db, 'accounts', id)); }
};

export const ledgerService = {
  async getAll() {
    const q = query(collection(db, 'ledger'), where('userId', '==', uid()), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data(), date: toDate(d.data().date) }));
  },
  async create(data) {
    return addDoc(collection(db, 'ledger'), { ...data, userId: uid(), date: Timestamp.fromDate(new Date(data.date)), createdAt: Timestamp.now() });
  },
  async update(id, data) { return updateDoc(doc(db, 'ledger', id), { ...data, date: Timestamp.fromDate(new Date(data.date)) }); },
  async delete(id) { return deleteDoc(doc(db, 'ledger', id)); }
};