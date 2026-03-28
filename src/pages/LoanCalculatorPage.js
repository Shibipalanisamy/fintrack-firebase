import { useState, useEffect } from 'react';
import { fmt, fmtDate, today } from '../utils/helpers';
import { loanService, loanPaymentService } from '../utils/dbService';
import { ConfirmDelete, Modal, DateStepper } from '../components/UI';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function calcEMI(principal, ratePercent, months) {
  if (!principal || !ratePercent || !months) return 0;
  const r = ratePercent / 12 / 100;
  if (r === 0) return principal / months;
  return principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
}

// Simple Interest (Flat Rate)
function calcFlatEMI(principal, ratePercent, months) {
  if (!principal || !months) return { emi: 0, totalInterest: 0 };
  const monthlyInterest = principal * ratePercent / (12 * 100);
  const totalInterest = monthlyInterest * months;
  const emi = (principal / months) + monthlyInterest;
  return { emi, totalInterest };
}

// ─── Payment History Modal ─────────────────────────────────
function PaymentModal({ loan, onClose }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: today(), amount: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState(null);

  useEffect(() => { loadPayments(); }, []);

  const loadPayments = async () => {
    setLoading(true);
    try { setPayments(await loanPaymentService.getAll(loan.id)); }
    catch { toast.error('Failed to load payments'); }
    finally { setLoading(false); }
  };

  // Calculate running balance — interest first, then principal
  const calcSchedule = () => {
    const annualRate = parseFloat(loan.rate) || 0;
    const monthlyRate = annualRate / 12 / 100;
    const loanDate = loan.startDate
      ? new Date(loan.startDate)
      : new Date(loan.createdAt?.toDate?.() || Date.now());
    const sorted = [...payments].sort((a, b) => new Date(a.date) - new Date(b.date));

    let balance = parseFloat(loan.amount);
    let prevDate = loanDate;
    const rows = [];

    for (const p of sorted) {
      const payDate = new Date(p.date);

      // Calculate months elapsed since last payment (prorated)
      const msPerMonth = 1000 * 60 * 60 * 24 * 30.44;
      const monthsElapsed = Math.max(0, (payDate - prevDate) / msPerMonth);

      // Monthly interest = Principal × Rate/12
      // Prorated if partial month
      const interestAccrued = annualRate > 0
        ? balance * monthlyRate * monthsElapsed
        : 0;

      // Payment first clears interest, remainder reduces principal
      const interestPaid = Math.min(interestAccrued, p.amount);
      const principalPaid = Math.max(0, p.amount - interestPaid);
      const newBalance = Math.max(0, balance - principalPaid);

      rows.push({
        ...p,
        monthsElapsed: monthsElapsed.toFixed(2),
        interestPaid,
        principalPaid,
        balanceBefore: balance,
        balanceAfter: newBalance,
      });

      balance = newBalance;
      prevDate = payDate;
    }
    return { rows, finalBalance: balance };
  };

  const { rows: schedule, finalBalance } = calcSchedule();
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalInterestPaid = schedule.reduce((s, r) => s + r.interestPaid, 0);
  const totalPrincipalPaid = schedule.reduce((s, r) => s + r.principalPaid, 0);
  const paidPct = loan.amount > 0 ? Math.min(100, (totalPrincipalPaid / loan.amount) * 100).toFixed(1) : 0;
  const cleared = finalBalance <= 0;

  // Interest Yet to Pay = remaining balance × monthly rate × remaining months
  const annualRateNum = parseFloat(loan.rate) || 0;
  const monthlyRate = annualRateNum / 12 / 100;
  const totalMonths = loan.tenureType === 'years'
    ? parseFloat(loan.tenure) * 12
    : parseFloat(loan.tenure) || 0;
  const loanStartDate = loan.startDate ? new Date(loan.startDate) : new Date();
  const now = new Date();
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.44;
  const monthsElapsedTotal = Math.max(0, (now - loanStartDate) / msPerMonth);
  const remainingMonths = Math.max(0, totalMonths - monthsElapsedTotal);
  const interestYetToPay = finalBalance * monthlyRate * remainingMonths;

  // Current accrued interest: interest built up from last payment (or loan start) to today
  // Formula: Balance × (annualRate/100) × (daysElapsed/365)
  const lastPayDate = payments.length > 0
    ? new Date(Math.max(...payments.map(p => new Date(p.date).getTime())))
    : loanStartDate;
  const daysSinceLastPay = Math.max(0, Math.floor((now - lastPayDate) / (1000 * 60 * 60 * 24)));
  const currentAccruedInterest = annualRateNum > 0 && finalBalance > 0
    ? finalBalance * (annualRateNum / 100) * (daysSinceLastPay / 365)
    : 0;
  const dailyInterestRate = finalBalance * (annualRateNum / 100) / 365;

  const addPayment = async () => {
    if (!form.amount) { toast.error('Enter payment amount'); return; }
    const amt = parseFloat(form.amount);
    if (amt <= 0) { toast.error('Amount must be greater than 0'); return; }
    setSaving(true);
    try {
      await loanPaymentService.create({ loanId: loan.id, date: form.date, amount: amt, note: form.note });
      toast.success('Payment recorded!');
      setForm({ date: today(), amount: '', note: '' });
      loadPayments();
    } catch { toast.error('Failed'); }
    finally { setSaving(false); }
  };

  const delPayment = async () => {
    try { await loanPaymentService.delete(delId); toast.success('Deleted'); setDelId(null); loadPayments(); }
    catch { toast.error('Failed'); }
  };

  const closeLoan = async () => {
    if (!window.confirm(`Close this loan? This will mark it as fully settled and move it to Closed Loans history.`)) return;
    try {
      await loanService.close(loan.id, {
        totalPaid, totalInterestPaid, totalPrincipalPaid, finalBalance,
        closedNote: `Closed on ${new Date().toLocaleDateString('en-IN')}`
      });
      toast.success('✅ Loan closed and moved to history!');
      onClose();
    } catch { toast.error('Failed to close loan'); }
  };

  return (
    <div>
      {/* Loan Summary */}
      <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Original Loan',       val: fmt(loan.amount),          c: 'var(--text)' },
            { label: 'Balance Remaining',   val: fmt(finalBalance),         c: cleared ? 'var(--green)' : 'var(--red)' },
            { label: 'Total Paid',          val: fmt(totalPaid),            c: 'var(--green)' },
            { label: 'Interest Paid So Far',val: fmt(totalInterestPaid),    c: 'var(--orange)' },
            { label: 'Principal Paid',      val: fmt(totalPrincipalPaid),   c: 'var(--blue)' },
            { label: 'Rate',                val: `${loan.rate}% p.a.`,      c: 'var(--purple)' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px' }}>
              <div className="fs-11 text-muted">{s.label}</div>
              <div className="fw-800 fs-13" style={{ color: s.c }}>{s.val}</div>
            </div>
          ))}
        </div>
        {/* 🔥 Current Accrued Interest Banner */}
        {!cleared && currentAccruedInterest > 0 && (
          <div style={{ background:'rgba(244,63,94,.08)', border:'1.5px solid rgba(244,63,94,.3)', borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
            <div className="flex justify-between items-center" style={{ flexWrap:'wrap', gap:8 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                  <span style={{ fontSize:18 }}>🔥</span>
                  <span className="fw-800 fs-13" style={{ color:'var(--red)' }}>Interest Accrued Right Now</span>
                </div>
                <div className="fs-11 text-muted">
                  ₹{fmt(finalBalance)} × {annualRateNum}% ÷ 365 × {daysSinceLastPay} days
                </div>
                <div className="fs-11 text-muted mt-1">
                  From: <strong>{lastPayDate.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</strong>
                  {payments.length > 0 ? ' (last payment)' : ' (loan start)'}
                  {' → '}<strong>Today</strong>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:24, fontWeight:900, color:'var(--red)', letterSpacing:'-0.5px' }}>
                  {fmt(currentAccruedInterest)}
                </div>
                <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>
                  ≈ {fmt(dailyInterestRate)} / day
                </div>
              </div>
            </div>
            {/* Day progress bar */}
            <div style={{ marginTop:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--t3)', marginBottom:3 }}>
                <span>{lastPayDate.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span>
                <span style={{ color:'var(--red)', fontWeight:700 }}>{daysSinceLastPay} days elapsed</span>
                <span>Today</span>
              </div>
              <div style={{ height:6, background:'var(--bg4)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${Math.min(100,(daysSinceLastPay/Math.max(1,totalMonths*30.44))*100)}%`, background:'var(--red)', borderRadius:4, transition:'width .5s' }} />
              </div>
            </div>
          </div>
        )}

        {/* Interest Yet to Pay banner */}
        {!cleared && interestYetToPay > 0 && (
          <div style={{ background: 'rgba(251,146,60,.1)', border: '1px solid rgba(251,146,60,.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
            <div className="flex justify-between items-center">
              <div>
                <div className="fw-700 fs-12" style={{ color: 'var(--orange)' }}>⏳ Interest Yet to Pay</div>
                <div className="fs-11 text-muted">Based on {remainingMonths.toFixed(1)} months remaining @ {loan.rate}%/yr</div>
              </div>
              <div className="fw-900 fs-15" style={{ color: 'var(--orange)' }}>{fmt(interestYetToPay)}</div>
            </div>
          </div>
        )}
        {/* Progress bar */}
        <div style={{ background: 'var(--bg4)', borderRadius: 8, height: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${paidPct}%`, background: cleared ? 'var(--green)' : 'var(--blue)', borderRadius: 8, transition: 'width .5s' }} />
        </div>
        <div className="flex justify-between mt-1">
          <span className="fs-11 text-muted">{paidPct}% principal repaid</span>
          {cleared && <span className="fs-11 fw-700" style={{ color: 'var(--green)' }}>✅ Loan Cleared!</span>}
        </div>
        {/* Close Loan button */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-sm w-full" style={{ justifyContent: 'center', background: 'rgba(244,63,94,.1)', color: 'var(--red)', border: '1px solid rgba(244,63,94,.3)', fontWeight: 700 }} onClick={closeLoan}>
            🔒 Close This Loan & Move to History
          </button>
          <div className="fs-11 text-muted mt-1" style={{ textAlign: 'center' }}>Marks as settled — moves to Closed Loans tab for record keeping</div>
        </div>
      </div>

      {/* Add Payment */}
      {!cleared && (
        <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div className="fs-13 fw-700 mb-2">+ Record Payment</div>
          {/* Preview interest split */}
          {form.amount && parseFloat(form.amount) > 0 && (() => {
            const annualRate = parseFloat(loan.rate) || 0;
            const monthlyRate = annualRate / 12 / 100;
            const loanDate = loan.startDate ? new Date(loan.startDate) : new Date();
            const lastPayDate = payments.length > 0
              ? new Date(Math.max(...payments.map(p => new Date(p.date))))
              : loanDate;
            const payDate = form.date ? new Date(form.date) : new Date();
            const msPerMonth = 1000 * 60 * 60 * 24 * 30.44;
            const monthsElapsed = Math.max(0, (payDate - lastPayDate) / msPerMonth);
            // Monthly Interest = P × R/12 (prorated)
            const interest = finalBalance * monthlyRate * monthsElapsed;
            const interestPaid = Math.min(interest, parseFloat(form.amount));
            const principal = Math.max(0, parseFloat(form.amount) - interestPaid);
            const newBal = Math.max(0, finalBalance - principal);
            return (
              <div style={{ background: 'rgba(77,158,255,.08)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                <div className="fw-700 mb-2" style={{ color: 'var(--blue)' }}>📊 Payment Breakdown Preview</div>
                <div className="flex justify-between mb-1">
                  <span className="text-muted">Monthly Interest (P × {annualRate}%/12 × {monthsElapsed.toFixed(2)} mo)</span>
                  <span className="fw-700 amt-r">{fmt(interest)}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-muted">Interest portion of payment</span>
                  <span className="fw-700 amt-r">− {fmt(interestPaid)}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-muted">Principal Reduction</span>
                  <span className="fw-700 amt-g">− {fmt(principal)}</span>
                </div>
                <div className="flex justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                  <span className="fw-700">New Balance</span>
                  <span className="fw-800 fs-13" style={{ color: newBal <= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(newBal)}</span>
                </div>
              </div>
            );
          })()}
          <div className="frow">
            <div className="fg"><label className="fl">Date</label><DateStepper name="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div className="fg"><label className="fl">Amount Paid (Rs)</label><input className="fi" type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="e.g. 10,000" min="0" autoFocus /></div>
          </div>
          <div className="fg"><label className="fl">Note (optional)</label><input className="fi" type="text" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="e.g. EMI, Bulk payment..." /></div>
          <button className="btn btn-primary btn-sm" onClick={addPayment} disabled={saving} style={{ marginTop: 6 }}>
            {saving ? <span className="spin" /> : null} Add Payment
          </button>
        </div>
      )}

      {/* Payment Schedule with interest/principal split */}
      {loading ? <div className="spin-center"><div className="spin" /></div>
        : schedule.length === 0
          ? <div className="text-muted fs-13" style={{ textAlign: 'center', padding: 16 }}>No payments recorded yet</div>
          : (
            <div>
              <div className="fs-13 fw-700 mb-2">📋 Payment History</div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Paid</th>
                      <th style={{ textAlign: 'right' }}>Interest (P×R/12)</th>
                      <th style={{ textAlign: 'right' }}>Principal</th>
                      <th style={{ textAlign: 'right' }}>Balance</th>
                      <th>Note</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map(p => (
                      <tr key={p.id}>
                        <td className="font-mono fs-12 text-muted">{fmtDate(p.date)}</td>
                        <td style={{ textAlign: 'right' }}><span className="amt fw-700">{fmt(p.amount)}</span></td>
                        <td style={{ textAlign: 'right' }}><span className="font-mono fs-12 amt-r">{fmt(p.interestPaid)}</span></td>
                        <td style={{ textAlign: 'right' }}><span className="font-mono fs-12 amt-g">{fmt(p.principalPaid)}</span></td>
                        <td style={{ textAlign: 'right' }}><span className="font-mono fs-12 fw-700" style={{ color: p.balanceAfter <= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(p.balanceAfter)}</span></td>
                        <td className="text-muted fs-12">{p.note || '—'}</td>
                        <td><button className="btn-icon" onClick={() => setDelId(p.id)}>🗑️</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="text-muted fs-12" style={{ padding: '8px 14px' }}>TOTAL</td>
                      <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="amt fw-800">{fmt(totalPaid)}</span></td>
                      <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="fw-800 amt-r">{fmt(totalInterestPaid)}</span></td>
                      <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="fw-800 amt-g">{fmt(totalPrincipalPaid)}</span></td>
                      <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="fw-800 fs-13" style={{ color: cleared ? 'var(--green)' : 'var(--red)' }}>{fmt(finalBalance)}</span></td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
      }
      {delId && <ConfirmDelete onConfirm={delPayment} onCancel={() => setDelId(null)} />}
    </div>
  );
}

// ─── Main Loan Calculator Page ─────────────────────────────
export default function LoanCalculatorPage() {
  const LOAN_TYPES = [
    { key: 'personal_loan', label: 'Personal Loan', icon: '💳' },
    { key: 'gold_loan', label: 'Gold Loan', icon: '🥇' },
    { key: 'home_loan', label: 'Home Loan', icon: '🏠' },
    { key: 'vehicle_loan', label: 'Vehicle Loan', icon: '🚗' },
    { key: 'education_loan', label: 'Education Loan', icon: '🎓' },
    { key: 'business_loan', label: 'Business Loan', icon: '💼' },
    { key: 'credit_card', label: 'Credit Card', icon: '💳' },
    { key: 'chittu', label: 'Chittu / Chit Fund', icon: '📋' },
    { key: 'other', label: 'Other Loan', icon: '📄' },
  ];

  const [calc, setCalc] = useState({ amount: '', rate: '', tenure: '', tenureType: 'months', loanType: 'personal_loan', loanName: '', startDate: today() });
  const [calcMethod, setCalcMethod] = useState('reducing'); // 'reducing' | 'flat'
  const [procFee, setProcFee] = useState({ pct: '1', gstPct: '18' });
  const [result, setResult] = useState(null);
  const [loans, setLoans] = useState([]);
  const [loanPayments, setLoanPayments] = useState({});
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [editLoan, setEditLoan] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [loansTab, setLoansTab] = useState('active'); // 'active' | 'closed'

  useEffect(() => { loadLoans(); }, []);

  const loadLoans = async () => {
    try {
      const ls = await loanService.getAll();
      setLoans(ls);
      // Load payments for each loan to show outstanding
      const pm = {};
      for (const l of ls) {
        const pays = await loanPaymentService.getAll(l.id);
        pm[l.id] = pays.reduce((s, p) => s + p.amount, 0);
      }
      setLoanPayments(pm);
    } catch { }
  };

  const calculate = () => {
    const principal = parseFloat(calc.amount);
    const rate = parseFloat(calc.rate);
    const months = calc.tenureType === 'years' ? parseFloat(calc.tenure) * 12 : parseFloat(calc.tenure);
    if (!principal || !months) { toast.error('Fill all fields'); return; }
    if (rate === 0 && calcMethod === 'reducing') { toast.error('Enter interest rate'); return; }

    let emi, totalInterest, totalPayment, breakdown = [];

    if (calcMethod === 'flat') {
      // Simple / Flat Rate Interest
      // Monthly Interest = P × R / (12 × 100)
      // EMI = P/N + Monthly Interest
      const monthlyInterest = principal * (rate || 0) / (12 * 100);
      totalInterest = monthlyInterest * months;
      emi = (principal / months) + monthlyInterest;
      totalPayment = principal + totalInterest;
      let balance = principal;
      for (let m = 1; m <= Math.min(months, 12); m++) {
        const principalPart = principal / months;
        balance -= principalPart;
        breakdown.push({ m: `M${m}`, principal: Math.round(principalPart), interest: Math.round(monthlyInterest) });
      }
    } else {
      // Reducing Balance (standard EMI)
      const r = rate / 12 / 100;
      emi = r === 0 ? principal / months : principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
      totalPayment = emi * months;
      totalInterest = totalPayment - principal;
      let balance = principal;
      for (let m = 1; m <= Math.min(months, 12); m++) {
        const interest = balance * r;
        const principalPart = emi - interest;
        balance -= principalPart;
        breakdown.push({ m: `M${m}`, principal: Math.round(principalPart), interest: Math.round(interest) });
      }
    }

    // Processing charges
    const feePct = parseFloat(procFee.pct) || 0;
    const gstPct = parseFloat(procFee.gstPct) || 18;
    const processingFee = (principal * feePct) / 100;
    const gstOnFee = (processingFee * gstPct) / 100;
    const totalProcessing = processingFee + gstOnFee;
    const effectiveDisbursed = principal - totalProcessing;
    const effectiveCost = totalPayment + totalProcessing;

    setResult({ emi, totalPayment, totalInterest, months, breakdown, processingFee, gstOnFee, totalProcessing, effectiveDisbursed, effectiveCost, method: calcMethod, rate: rate || 0 });
  };

  const saveToLoans = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const loanTypeMeta = LOAN_TYPES.find(t => t.key === calc.loanType);
      await loanService.create({
        name: calc.loanName || `${loanTypeMeta?.label || 'Loan'} - ${calc.amount}`,
        loanType: calc.loanType,
        loanTypeLabel: loanTypeMeta?.label || 'Loan',
        loanTypeIcon: loanTypeMeta?.icon || '💳',
        amount: parseFloat(calc.amount),
        rate: parseFloat(calc.rate),
        tenure: parseFloat(calc.tenure),
        tenureType: calc.tenureType,
        startDate: calc.startDate,
        emi: result.emi,
        totalInterest: result.totalInterest,
        totalPayment: result.totalPayment
      });
      toast.success('Loan saved!');
      loadLoans();
    } catch { toast.error('Failed'); }
    finally { setSaving(false); }
  };

  const del = async () => {
    try { await loanService.delete(delId); toast.success('Deleted'); setDelId(null); loadLoans(); }
    catch { toast.error('Failed'); }
  };

  const saveEditLoan = async (data) => {
    try {
      await loanService.update(editLoan.id, {
        name: data.name,
        loanType: data.loanType,
        loanTypeLabel: LOAN_TYPES.find(t => t.key === data.loanType)?.label || data.loanType,
        loanTypeIcon: LOAN_TYPES.find(t => t.key === data.loanType)?.icon || '💳',
        amount: parseFloat(data.amount),
        rate: parseFloat(data.rate),
        tenure: parseFloat(data.tenure),
        tenureType: data.tenureType,
        startDate: data.startDate,
      });
      toast.success('Loan updated!');
      setEditLoan(null);
      loadLoans();
    } catch { toast.error('Failed to update'); }
  };

  const ch = e => setCalc(p => ({ ...p, [e.target.name]: e.target.value }));

  // Totals across all saved loans
  const activeLoans = loans.filter(l => l.status !== 'closed');
  const closedLoans = loans.filter(l => l.status === 'closed');
  const totalLoanAmount   = activeLoans.reduce((s, l) => s + (l.amount || 0), 0);
  const totalInterestAll  = activeLoans.reduce((s, l) => s + (l.totalInterest || 0), 0);
  const totalPaymentAll   = activeLoans.reduce((s, l) => s + (l.totalPayment || 0), 0);
  const totalPaidAll      = activeLoans.reduce((s, l) => s + (loanPayments[l.id] || 0), 0);
  const totalOutstanding  = activeLoans.reduce((s, l) => s + Math.max(0, l.amount - (loanPayments[l.id] || 0)), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">🧮 Loan Calculator</div>
          <div className="page-sub">Calculate EMI &amp; track payments</div>
        </div>
      </div>

      {/* ── Top Summary Stats ── */}
      {loans.length > 0 && (
        <div className="stats" style={{ marginBottom: 20 }}>
          {[
            { icon: '💰', label: 'Total Loan Amount',   val: fmt(totalLoanAmount),  c: 'var(--blue)' },
            { icon: '💸', label: 'Total Interest',       val: fmt(totalInterestAll), c: 'var(--red)' },
            { icon: '📦', label: 'Total Payment',        val: fmt(totalPaymentAll),  c: 'var(--orange)' },
            { icon: '✅', label: 'Total Paid',           val: fmt(totalPaidAll),     c: 'var(--green)' },
            { icon: '⏳', label: 'Outstanding Balance',  val: fmt(totalOutstanding), c: totalOutstanding > 0 ? 'var(--red)' : 'var(--green)' },
          ].map((s, i) => (
            <div key={i} className="stat" style={{ '--c': s.c }}>
              <div className="stat-icon">{s.icon}</div>
              <div className="stat-val" style={{ color: s.c }}>{s.val}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* Calculator */}
        <div className="card">
          <div className="card-title">📊 EMI Calculator</div>

          {/* Calculation Method toggle */}
          <div className="fg">
            <label className="fl">Calculation Method</label>
            <div className="flex gap-2" style={{ marginTop: 4 }}>
              {[
                { key: 'reducing', label: '📉 Reducing Balance', sub: 'Standard EMI (compound)' },
                { key: 'flat',     label: '📊 Flat Rate',         sub: 'Simple Interest' },
              ].map(m => (
                <button key={m.key} type="button" onClick={() => { setCalcMethod(m.key); setResult(null); }}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: `2px solid ${calcMethod === m.key ? 'var(--blue)' : 'var(--border2)'}`, background: calcMethod === m.key ? 'rgba(77,158,255,.1)' : 'var(--bg3)', cursor: 'pointer', textAlign: 'center' }}>
                  <div className="fw-700 fs-12" style={{ color: calcMethod === m.key ? 'var(--blue)' : 'var(--t2)' }}>{m.label}</div>
                  <div className="fs-11 text-muted">{m.sub}</div>
                </button>
              ))}
            </div>
            {calcMethod === 'flat' && (
              <div style={{ background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 8, padding: '7px 12px', marginTop: 8, fontSize: 12 }}>
                💡 <strong>Flat Rate:</strong> Interest = P × R × T / 100 &nbsp;·&nbsp; Same interest every month regardless of balance
              </div>
            )}
            {calcMethod === 'reducing' && (
              <div style={{ background: 'rgba(77,158,255,.06)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 8, padding: '7px 12px', marginTop: 8, fontSize: 12 }}>
                💡 <strong>Reducing Balance:</strong> Interest recalculated on outstanding each month · Lower effective cost
              </div>
            )}
          </div>

          {/* Loan Type */}
          <div className="fg">
            <label className="fl">Loan Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4 }}>
              {LOAN_TYPES.map(t => (
                <button key={t.key} type="button"
                  onClick={() => setCalc(p => ({ ...p, loanType: t.key }))}
                  style={{ padding: '7px 6px', borderRadius: 8, border: `2px solid ${calc.loanType === t.key ? 'var(--blue)' : 'var(--border2)'}`, background: calc.loanType === t.key ? 'rgba(77,158,255,.12)' : 'var(--bg3)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: calc.loanType === t.key ? 'var(--blue)' : 'var(--t3)', textAlign: 'center' }}>
                  <div style={{ fontSize: 16 }}>{t.icon}</div>
                  <div style={{ marginTop: 2 }}>{t.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="fg"><label className="fl">Loan Name / Description</label><input className="fi" type="text" name="loanName" value={calc.loanName} onChange={ch} placeholder="e.g. SBI Gold Loan, HDFC Personal..." /></div>
          <div className="frow">
            <div className="fg"><label className="fl">Loan Amount (Rs)</label><input className="fi" type="number" name="amount" value={calc.amount} onChange={ch} placeholder="e.g. 1,00,000" min="0" /></div>
            <div className="fg"><label className="fl">Loan Start Date</label><DateStepper name="startDate" value={calc.startDate} onChange={ch} /></div>
          </div>
          <div className="fg"><label className="fl">Annual Interest Rate (%)</label><input className="fi" type="number" name="rate" value={calc.rate} onChange={ch} placeholder="e.g. 9" step="0.1" min="0" /></div>
          <div className="fg">
            <label className="fl">Loan Tenure</label>
            <div className="flex gap-2">
              <input className="fi" type="number" name="tenure" value={calc.tenure} onChange={ch} placeholder="e.g. 6" min="1" style={{ flex: 1 }} />
              <select className="fs" name="tenureType" value={calc.tenureType} onChange={ch} style={{ width: 100 }}>
                <option value="months">Months</option>
                <option value="years">Years</option>
              </select>
            </div>
          </div>

          {/* Processing Charges */}
          <div style={{ background: 'rgba(251,146,60,.06)', border: '1px solid rgba(251,146,60,.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div className="fw-700 fs-13 mb-2" style={{ color: 'var(--orange)' }}>🏦 Processing Charges</div>
            <div className="frow" style={{ marginBottom: 0 }}>
              <div className="fg">
                <label className="fl">Processing Fee %</label>
                <div className="flex items-center gap-1">
                  <input className="fi" type="number" value={procFee.pct} onChange={e => setProcFee(p => ({ ...p, pct: e.target.value }))} step="0.1" min="0" placeholder="e.g. 1" style={{ fontWeight: 700 }} />
                  <span className="text-muted fs-13">%</span>
                </div>
                <div className="fs-11 text-muted mt-1">Typically 0.5% – 1.5% of loan</div>
              </div>
              <div className="fg">
                <label className="fl">GST on Fee %</label>
                <div className="flex items-center gap-1">
                  <input className="fi" type="number" value={procFee.gstPct} onChange={e => setProcFee(p => ({ ...p, gstPct: e.target.value }))} step="0.1" min="0" placeholder="18" style={{ fontWeight: 700 }} />
                  <span className="text-muted fs-13">%</span>
                </div>
                <div className="fs-11 text-muted mt-1">Standard GST = 18%</div>
              </div>
            </div>
            {/* Live preview of processing fee */}
            {calc.amount && parseFloat(calc.amount) > 0 && (
              <div style={{ marginTop: 10, background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                {(() => {
                  const p = parseFloat(calc.amount) || 0;
                  const fee = p * (parseFloat(procFee.pct) || 0) / 100;
                  const gst = fee * (parseFloat(procFee.gstPct) || 18) / 100;
                  return (<>
                    <div className="flex justify-between mb-1"><span className="text-muted">Processing Fee ({procFee.pct}%)</span><span className="fw-700">{fmt(fee)}</span></div>
                    <div className="flex justify-between mb-1"><span className="text-muted">GST ({procFee.gstPct}%) on fee</span><span className="fw-700">+ {fmt(gst)}</span></div>
                    <div className="flex justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                      <span className="fw-700">Total Charges</span>
                      <span className="fw-800" style={{ color: 'var(--orange)' }}>{fmt(fee + gst)}</span>
                    </div>
                    <div className="flex justify-between mt-1"><span className="text-muted">You receive (net)</span><span className="fw-700 amt-g">{fmt(p - fee - gst)}</span></div>
                  </>);
                })()}
              </div>
            )}
          </div>

          <button className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: 8 }} onClick={calculate}>🧮 Calculate</button>
        </div>

        {/* Result */}
        {result && (
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <div className="card-title" style={{ marginBottom: 0 }}>📋 EMI Summary</div>
              <span style={{ background: result.method === 'flat' ? 'rgba(251,191,36,.15)' : 'rgba(77,158,255,.15)', color: result.method === 'flat' ? '#d97706' : 'var(--blue)', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20 }}>
                {result.method === 'flat' ? 'Flat Rate' : 'Reducing Balance'}
              </span>
            </div>

            {/* Formula explanation */}
            {result.method === 'flat' && (
              <div style={{ background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
                <div className="fw-700 mb-1">📐 Simple Interest Formula</div>
                <div className="text-muted">Interest = P × R × T / 100</div>
                <div className="text-muted">= {fmt(parseFloat(calc.amount))} × {result.rate}% × {result.months}/12 / 100</div>
                <div className="fw-700 mt-1" style={{ color: 'var(--orange)' }}>= {fmt(result.totalInterest)}</div>
              </div>
            )}

            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Monthly EMI', val: fmt(result.emi), c: 'var(--blue)', icon: '📅' },
                { label: `Total Interest (${result.method === 'flat' ? 'Flat' : 'Reducing'})`, val: fmt(result.totalInterest), c: 'var(--red)', icon: '💸' },
                { label: 'Total Payment (Principal + Interest)', val: fmt(result.totalPayment), c: 'var(--orange)', icon: '💰' },
                { label: 'Duration', val: `${result.months} months`, c: 'var(--purple)', icon: '📆' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, borderLeft: `3px solid ${s.c}` }}>
                  <span className="fs-12 text-muted">{s.icon} {s.label}</span>
                  <span style={{ fontWeight: 800, color: s.c, fontSize: 14 }}>{s.val}</span>
                </div>
              ))}
            </div>

            {/* Processing charges in result */}
            {result.totalProcessing > 0 && (
              <div style={{ background: 'rgba(251,146,60,.08)', border: '1px solid rgba(251,146,60,.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                <div className="fw-700 fs-13 mb-2" style={{ color: 'var(--orange)' }}>🏦 Processing Charges Breakdown</div>
                <div className="flex justify-between fs-12 mb-1"><span className="text-muted">Processing Fee ({procFee.pct}%)</span><span className="fw-700">{fmt(result.processingFee)}</span></div>
                <div className="flex justify-between fs-12 mb-1"><span className="text-muted">GST ({procFee.gstPct}%) on fee</span><span className="fw-700">{fmt(result.gstOnFee)}</span></div>
                <div className="flex justify-between fs-12 mb-1" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}><span className="fw-700">Total Charges</span><span className="fw-800 amt-r">{fmt(result.totalProcessing)}</span></div>
                <div className="flex justify-between fs-12 mb-1"><span className="text-muted">Net Amount Received</span><span className="fw-700 amt-g">{fmt(result.effectiveDisbursed)}</span></div>
                <div className="flex justify-between fs-13" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}><span className="fw-700">💰 Total Effective Cost</span><span className="fw-900" style={{ color: 'var(--red)' }}>{fmt(result.effectiveCost)}</span></div>
              </div>
            )}

            {/* Comparison if flat rate */}
            {result.method === 'flat' && result.rate > 0 && (
              <div style={{ background: 'rgba(77,158,255,.06)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                <div className="fw-700 fs-12 mb-2">📊 vs Reducing Balance (for reference)</div>
                {(() => {
                  const p = parseFloat(calc.amount), r = result.rate, m = result.months;
                  const rEMI = calcEMI(p, r, m);
                  const rTotal = rEMI * m;
                  const rInterest = rTotal - p;
                  return (<>
                    <div className="flex justify-between fs-12 mb-1"><span className="text-muted">Reducing EMI</span><span className="fw-700">{fmt(rEMI)}</span></div>
                    <div className="flex justify-between fs-12 mb-1"><span className="text-muted">Reducing Interest</span><span className="fw-700 amt-g">{fmt(rInterest)}</span></div>
                    <div className="flex justify-between fs-12"><span className="text-muted">You pay extra (flat vs reducing)</span><span className="fw-700 amt-r">+{fmt(result.totalInterest - rInterest)}</span></div>
                  </>);
                })()}
              </div>
            )}

            <button className="btn btn-secondary w-full" style={{ justifyContent: 'center' }} onClick={saveToLoans} disabled={saving}>
              {saving ? <span className="spin" /> : null} 💾 Save Loan
            </button>
          </div>
        )}
      </div>

      {/* Chart */}
      {result && result.breakdown.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">📊 Monthly Breakdown (First 12 months)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={result.breakdown}>
              <XAxis dataKey="m" tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, fontSize: 12 }} />
              <Bar dataKey="principal" fill="var(--green)" name="Principal" radius={[3,3,0,0]} maxBarSize={18} />
              <Bar dataKey="interest" fill="var(--red)" name="Interest" radius={[3,3,0,0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* My Loans — tabbed */}
      {loans.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          {/* Tab header */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16, gap: 2 }}>
            {[
              { key: 'active', label: `🟢 Active Loans`, count: activeLoans.length },
              { key: 'closed', label: `🔒 Closed Loans`, count: closedLoans.length },
            ].map(t => (
              <button key={t.key} onClick={() => setLoansTab(t.key)}
                style={{ padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: loansTab === t.key ? 'var(--bg3)' : 'transparent', color: loansTab === t.key ? 'var(--text)' : 'var(--t3)', borderBottom: loansTab === t.key ? '2px solid var(--blue)' : '2px solid transparent' }}>
                {t.label}
                <span style={{ marginLeft: 6, background: t.count > 0 ? (loansTab === t.key ? 'var(--blue)' : 'var(--bg3)') : 'transparent', color: loansTab === t.key ? '#fff' : 'var(--t3)', borderRadius: 20, padding: '1px 7px', fontSize: 11 }}>{t.count}</span>
              </button>
            ))}
          </div>

          {/* Active loans */}
          {loansTab === 'active' && (
            <div style={{ display: 'grid', gap: 12 }}>
              {activeLoans.length === 0
                ? <div className="empty"><div className="empty-icon">💳</div><div className="empty-title">No active loans</div></div>
                : activeLoans.map(l => {
                  const paid = loanPayments[l.id] || 0;
                  const outstanding = Math.max(0, l.amount - paid);
                  const paidPct = l.amount > 0 ? Math.min(100, (paid / l.amount) * 100).toFixed(1) : 0;
                  const cleared = outstanding <= 0;
                  // Interest yet to pay estimate
                  const mRate = (parseFloat(l.rate) || 0) / 12 / 100;
                  const totalMo = l.tenureType === 'years' ? parseFloat(l.tenure) * 12 : parseFloat(l.tenure) || 0;
                  const loanStart = l.startDate ? new Date(l.startDate) : new Date();
                  const moElapsed = Math.max(0, (new Date() - loanStart) / (1000 * 60 * 60 * 24 * 30.44));
                  const remMo = Math.max(0, totalMo - moElapsed);
                  const intYetToPay = outstanding * mRate * remMo;
                  return (
                    <div key={l.id} style={{ background: 'var(--bg3)', borderRadius: 12, padding: 14, border: `1px solid ${cleared ? 'rgba(34,197,94,.3)' : 'var(--border)'}`, borderLeft: `4px solid ${cleared ? 'var(--green)' : 'var(--orange)'}` }}>
                      <div className="flex justify-between items-start mb-2">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 16 }}>{l.loanTypeIcon || '💳'}</span>
                            <span className="fw-700 fs-14">{l.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
                            <span style={{ background: 'var(--bg4)', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: 'var(--t2)' }}>{l.loanTypeLabel || 'Loan'}</span>
                            <span className="text-muted fs-12">{l.rate}% • {l.tenure} {l.tenureType} • EMI: {fmt(l.emi)}</span>
                            {l.startDate && <span className="text-muted fs-12">📅 {l.startDate}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 items-center" style={{ flexShrink: 0 }}>
                          {cleared
                            ? <span style={{ background: 'rgba(34,197,94,.15)', color: 'var(--green)', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20 }}>✅ Cleared</span>
                            : <button className="btn btn-primary btn-sm" onClick={() => setPayModal(l)}>💳 Pay</button>
                          }
                          <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => { setEditLoan(l); setEditForm({ ...l, amount: String(l.amount), rate: String(l.rate), tenure: String(l.tenure) }); }}>✏️</button>
                          <button className="btn-icon" onClick={() => setDelId(l.id)}>🗑️</button>
                        </div>
                      </div>
                      <div className="flex justify-between fs-12 mb-1" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <span>Loan: <span className="fw-700">{fmt(l.amount)}</span></span>
                        <span>Paid: <span className="fw-700 amt-g">{fmt(paid)}</span></span>
                        <span>Balance: <span className={`fw-700 ${cleared ? 'amt-g' : 'amt-r'}`}>{fmt(outstanding)}</span></span>
                      </div>
                      {/* 🔥 Current Accrued Interest on card */}
                      {!cleared && (() => {
                        const aRate   = parseFloat(l.rate) || 0;
                        const startD  = l.startDate ? new Date(l.startDate) : new Date(l.createdAt?.toDate?.() || Date.now());
                        const daysEl  = Math.max(0, Math.floor((new Date() - startD) / (1000 * 60 * 60 * 24)));
                        const accrued = outstanding * (aRate / 100) * (daysEl / 365);
                        const perDay  = outstanding * (aRate / 100) / 365;
                        if (accrued <= 0) return null;
                        return (
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(244,63,94,.07)', border:'1px solid rgba(244,63,94,.2)', borderRadius:8, padding:'7px 12px', marginBottom:8 }}>
                            <div>
                              <div style={{ fontSize:12, fontWeight:700, color:'var(--red)' }}>🔥 Interest accrued</div>
                              <div className="fs-11 text-muted">{daysEl} days @ {aRate}% p.a.</div>
                            </div>
                            <div style={{ textAlign:'right' }}>
                              <div style={{ fontSize:14, fontWeight:900, color:'var(--red)' }}>{fmt(accrued)}</div>
                              <div className="fs-10 text-muted">₹{fmt(perDay)}/day</div>
                            </div>
                          </div>
                        );
                      })()}
                      {/* Interest yet to pay */}
                      {!cleared && intYetToPay > 0 && (
                        <div className="fs-12 mb-2" style={{ color: 'var(--orange)', fontWeight: 600 }}>
                          ⏳ Interest yet to pay: <span className="fw-800">{fmt(intYetToPay)}</span>
                          <span className="text-muted fw-400 fs-11"> ({remMo.toFixed(1)} months remaining)</span>
                        </div>
                      )}
                      <div style={{ background: 'var(--bg4)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${paidPct}%`, background: cleared ? 'var(--green)' : 'var(--blue)', borderRadius: 8, transition: 'width .5s' }} />
                      </div>
                      <div className="fs-11 text-muted mt-1">{paidPct}% repaid</div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* Closed loans */}
          {loansTab === 'closed' && (
            <div>
              {closedLoans.length === 0
                ? <div className="empty"><div className="empty-icon">🔒</div><div className="empty-title">No closed loans yet</div><div className="empty-sub">Use "Close This Loan" inside the payment history to archive a loan</div></div>
                : (
                  <>
                    {/* Summary stats for closed loans */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
                      {[
                        { icon: '🔒', label: 'Loans Closed', val: closedLoans.length, c: 'var(--blue)' },
                        { icon: '💰', label: 'Total Borrowed', val: fmt(closedLoans.reduce((s, l) => s + (l.amount || 0), 0)), c: 'var(--text)' },
                        { icon: '✅', label: 'Total Repaid', val: fmt(closedLoans.reduce((s, l) => s + (l.closedSummary?.totalPaid || 0), 0)), c: 'var(--green)' },
                        { icon: '💸', label: 'Total Interest Paid', val: fmt(closedLoans.reduce((s, l) => s + (l.closedSummary?.totalInterestPaid || 0), 0)), c: 'var(--orange)' },
                      ].map((s, i) => (
                        <div key={i} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: 20 }}>{s.icon}</div>
                          <div className="fw-800 fs-13 mt-1" style={{ color: s.c }}>{s.val}</div>
                          <div className="fs-11 text-muted">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      {closedLoans.map(l => {
                        const cs = l.closedSummary || {};
                        const closedDate = l.closedAt?.toDate ? l.closedAt.toDate() : l.closedAt ? new Date(l.closedAt) : null;
                        return (
                          <div key={l.id} style={{ background: 'var(--bg3)', borderRadius: 12, padding: 14, border: '1px solid rgba(34,197,94,.2)', borderLeft: '4px solid var(--green)', opacity: 0.9 }}>
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span style={{ fontSize: 15 }}>{l.loanTypeIcon || '💳'}</span>
                                  <span className="fw-700 fs-14">{l.name}</span>
                                  <span style={{ background: 'rgba(34,197,94,.15)', color: 'var(--green)', fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 20 }}>🔒 CLOSED</span>
                                </div>
                                <div className="text-muted fs-12">{l.loanTypeLabel} • {l.rate}% • {l.tenure} {l.tenureType}</div>
                                {closedDate && <div className="fs-11 text-muted mt-1">Closed: {closedDate.toLocaleDateString('en-IN')}</div>}
                              </div>
                              <button className="btn-icon" onClick={() => setDelId(l.id)}>🗑️</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 6, marginTop: 10 }}>
                              {[
                                { label: 'Loan Amount',     val: fmt(l.amount),                          c: 'var(--text)' },
                                { label: 'Total Repaid',    val: fmt(cs.totalPaid || 0),                 c: 'var(--green)' },
                                { label: 'Interest Paid',   val: fmt(cs.totalInterestPaid || 0),         c: 'var(--orange)' },
                                { label: 'Principal Paid',  val: fmt(cs.totalPrincipalPaid || 0),        c: 'var(--blue)' },
                                { label: 'Final Balance',   val: fmt(cs.finalBalance || 0),              c: (cs.finalBalance || 0) <= 0 ? 'var(--green)' : 'var(--red)' },
                              ].map((s, i) => (
                                <div key={i} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '6px 10px' }}>
                                  <div className="fs-10 text-muted">{s.label}</div>
                                  <div className="fw-700 fs-12" style={{ color: s.c }}>{s.val}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )
              }
            </div>
          )}
        </div>
      )}

      {/* Edit Loan Modal */}
      {editLoan && (
        <Modal title="✏️ Edit Loan" onClose={() => setEditLoan(null)}>
          <div>
            <div className="fg">
              <label className="fl">Loan Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 4 }}>
                {LOAN_TYPES.map(t => (
                  <button key={t.key} type="button" onClick={() => setEditForm(p => ({ ...p, loanType: t.key }))}
                    style={{ padding: '6px 4px', borderRadius: 8, border: `2px solid ${editForm.loanType === t.key ? 'var(--blue)' : 'var(--border2)'}`, background: editForm.loanType === t.key ? 'rgba(77,158,255,.12)' : 'var(--bg3)', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: editForm.loanType === t.key ? 'var(--blue)' : 'var(--t3)', textAlign: 'center' }}>
                    <div style={{ fontSize: 14 }}>{t.icon}</div>
                    <div style={{ marginTop: 1 }}>{t.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="fg"><label className="fl">Loan Name</label><input className="fi" name="name" value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="frow">
              <div className="fg"><label className="fl">Amount (Rs)</label><input className="fi" type="number" name="amount" value={editForm.amount || ''} onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))} min="0" /></div>
              <div className="fg"><label className="fl">Rate (% p.a.)</label><input className="fi" type="number" name="rate" value={editForm.rate || ''} onChange={e => setEditForm(p => ({ ...p, rate: e.target.value }))} step="0.1" min="0" /></div>
            </div>
            <div className="frow">
              <div className="fg"><label className="fl">Tenure</label><input className="fi" type="number" name="tenure" value={editForm.tenure || ''} onChange={e => setEditForm(p => ({ ...p, tenure: e.target.value }))} min="1" /></div>
              <div className="fg"><label className="fl">Tenure Type</label>
                <select className="fs" value={editForm.tenureType || 'months'} onChange={e => setEditForm(p => ({ ...p, tenureType: e.target.value }))}>
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </select>
              </div>
            </div>
            <div className="fg"><label className="fl">Start Date</label><DateStepper name="startDate" value={editForm.startDate || ''} onChange={e => setEditForm(p => ({ ...p, startDate: e.target.value }))} /></div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditLoan(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => saveEditLoan(editForm)}>💾 Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {payModal && (
        <Modal title={`💳 Payment History — ${payModal.name}`} onClose={() => { setPayModal(null); loadLoans(); }}>
          <PaymentModal loan={payModal} onClose={() => { setPayModal(null); loadLoans(); }} />
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}