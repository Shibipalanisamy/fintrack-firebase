import { db, auth } from './firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';

const uid = () => auth.currentUser?.uid;
const toDate = (d) => d?.toDate?.() || new Date(d);

// ─── INCOME ───────────────────────────────────────────────
export const incomeService = {
  async getAll(filters = {}) {
    const q = query(collection(db, 'income'), where('userId', '==', uid()), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data(), date: toDate(d.data().date) }));
    if (filters.month && filters.year) docs = docs.filter(d => new Date(d.date).getMonth() + 1 === +filters.month && new Date(d.date).getFullYear() === +filters.year);
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
    if (filters.month && filters.year) docs = docs.filter(d => new Date(d.date).getMonth() + 1 === +filters.month && new Date(d.date).getFullYear() === +filters.year);
    else if (filters.year) docs = docs.filter(d => new Date(d.date).getFullYear() === +filters.year);
    if (filters.category) docs = docs.filter(d => d.category === filters.category);
    if (filters.search) { const s = filters.search.toLowerCase(); docs = docs.filter(d => d.itemName?.toLowerCase().includes(s) || d.notes?.toLowerCase().includes(s)); }
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
export const dividendService = {
  async getAll() {
    const q = query(collection(db, 'dividends'), where('userId', '==', uid()), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data(), date: toDate(d.data().date) }));
  },
  async create(data) { return addDoc(collection(db, 'dividends'), { ...data, userId: uid(), date: Timestamp.fromDate(new Date(data.date)), createdAt: Timestamp.now() }); },
  async update(id, data) { return updateDoc(doc(db, 'dividends', id), { ...data, date: Timestamp.fromDate(new Date(data.date)) }); },
  async delete(id) { return deleteDoc(doc(db, 'dividends', id)); }
};

// ─── BROKER MASTER ────────────────────────────────────────
const DEFAULT_BROKERS = [
  { name: 'Angel One', icon: '🔶', color: '#f97316' },
  { name: 'Mstock', icon: '🟦', color: '#3b82f6' },
  { name: 'Aionion', icon: '🟣', color: '#8b5cf6' },
];

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