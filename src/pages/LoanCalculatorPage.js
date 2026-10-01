import { useState, useEffect, Fragment } from 'react';
import { fmt, fmtDate, today } from '../utils/helpers';
import { loanService, loanPaymentService, goldTrackerService, goldQtyLogService } from '../utils/dbService';
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

const BLANK_GOLD = { goldName: '', date: today(), location: '', count: '', goldSovereign: '', partSection: '', loanStatus: 'not_pledged', linkedLoanId: '', loanAmount: '', loanHolderName: '' };

// ─── Gold Tracker ────────────────────────────────────────────
const LOAN_STATUS_OPTS = [
  { key: 'not_pledged', label: 'Not Pledged', color: '#22c55e' },
  { key: 'pledged',     label: 'Pledged',     color: '#f43f5e' },
];

const QTY_OPS = [
  { key: 'add',      label: '+ Add',      sym: '+' },
  { key: 'subtract', label: '− Subtract', sym: '−' },
  { key: 'multiply', label: '× Multiply', sym: '×' },
  { key: 'divide',   label: '÷ Divide',   sym: '÷' },
];

// Same interest-first amortization used on the Loans page — keeps Gold Tracker's
// "Current Balance" in sync with what's actually still owed on a linked gold loan.
function calcLoanOutstanding(loan, payments) {
  const annualRate = parseFloat(loan.rate) || 0;
  const monthlyRate = annualRate / 12 / 100;
  const loanDate = loan.startDate ? new Date(loan.startDate) : new Date(loan.createdAt?.toDate?.() || Date.now());
  const sorted = [...payments].sort((a, b) => new Date(a.date) - new Date(b.date));
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.44;

  let balance = parseFloat(loan.amount) || 0;
  let prevDate = loanDate;
  for (const p of sorted) {
    const payDate = new Date(p.date);
    const monthsElapsed = Math.max(0, (payDate - prevDate) / msPerMonth);
    const interestAccrued = annualRate > 0 ? balance * monthlyRate * monthsElapsed : 0;
    const interestPaid = Math.min(interestAccrued, p.amount);
    const principalPaid = Math.max(0, p.amount - interestPaid);
    balance = Math.max(0, balance - principalPaid);
    prevDate = payDate;
  }
  return balance;
}

// Quick per-row quantity adjuster — Add / Subtract / Multiply / Divide against Total Weight
function QtyAdjustModal({ item, linkedLoan, onSave, onClose }) {
  const [op, setOp] = useState('add');
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try { setHistory(await goldQtyLogService.getAll(item.id)); }
    catch { toast.error('Failed to load history'); }
    finally { setLoadingHistory(false); }
  };

  const current = parseFloat(item.goldSovereign) || 0;
  const v = parseFloat(val);
  const hasVal = val !== '' && !isNaN(v);
  let newQty = current;
  if (hasVal) {
    if (op === 'add') newQty = current + v;
    else if (op === 'subtract') newQty = current - v;
    else if (op === 'multiply') newQty = current * v;
    else if (op === 'divide') newQty = v !== 0 ? current / v : current;
  }
  newQty = Math.max(0, newQty);
  const opSym = op === 'add' ? '+' : op === 'subtract' ? '−' : op === 'multiply' ? '×' : '÷';

  const submit = async () => {
    if (!hasVal) { toast.error('Enter a value'); return; }
    if (op === 'divide' && v === 0) { toast.error('Cannot divide by zero'); return; }
    setSaving(true);
    try {
      await onSave({ ...item, goldSovereign: newQty });
      await goldQtyLogService.create({ goldItemId: item.id, op, opSym, value: v, balanceBefore: current, balanceAfter: newQty });
    } finally { setSaving(false); }
  };

  const isPledged = item.loanStatus === 'pledged';

  return (
    <div>
      {/* Full record details */}
      <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
        <div className="fw-800 fs-14 mb-2">{item.goldName || item.partSection || 'Gold Item'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
          <div className="fs-11 text-muted">Date: <span className="fw-700" style={{ color: 'var(--text)' }}>{item.date ? new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span></div>
          <div className="fs-11 text-muted">Loan Location / Place: <span className="fw-700" style={{ color: 'var(--text)' }}>{item.location || '—'}</span></div>
          <div className="fs-11 text-muted">Part/Section: <span className="fw-700" style={{ color: 'var(--text)' }}>{item.partSection || '—'}</span></div>
          <div className="fs-11 text-muted">Total Weight (Sovereign): <span className="fw-700" style={{ color: 'var(--text)' }}>{current.toFixed(2)}</span></div>
          <div className="fs-11 text-muted">Loan Status: <span className="fw-700" style={{ color: isPledged ? 'var(--red)' : 'var(--green)' }}>{isPledged ? 'Pledged' : 'Not Pledged'}</span></div>
          {isPledged && <div className="fs-11 text-muted">Loan Holder: <span className="fw-700" style={{ color: 'var(--text)' }}>{item.loanHolderName || '—'}</span></div>}
          {isPledged && <div className="fs-11 text-muted">Loan Amount: <span className="fw-700" style={{ color: 'var(--text)' }}>{fmt(parseFloat(item.loanAmount) || 0)}</span></div>}
          {isPledged && <div className="fs-11 text-muted">Current Balance: <span className="fw-700" style={{ color: 'var(--blue)' }}>{fmt(linkedLoan ? linkedLoan.outstandingBalance : (parseFloat(item.loanAmount) || 0))}{linkedLoan ? ' (synced)' : ''}</span></div>}
        </div>
      </div>

      {/* Operation picker */}
      <div className="fg">
        <label className="fl">Operation</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 4 }}>
          {QTY_OPS.map(o => (
            <button key={o.key} type="button" onClick={() => setOp(o.key)}
              style={{ padding: '10px 4px', borderRadius: 8, border: `2px solid ${op === o.key ? 'var(--blue)' : 'var(--border2)'}`, background: op === o.key ? 'rgba(77,158,255,.1)' : 'var(--bg3)', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: 16, color: op === o.key ? 'var(--blue)' : 'var(--t2)' }}>{o.sym}</div>
              <div className="fs-10" style={{ color: op === o.key ? 'var(--blue)' : 'var(--t3)' }}>{o.label.split(' ')[1]}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="fg">
        <label className="fl">Value</label>
        <input className="fi" type="number" value={val} onChange={e => setVal(e.target.value)} placeholder="e.g. 2" min="0" step="0.01" autoFocus />
      </div>
      <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
        <div className="fs-11 text-muted">Current: {current.toFixed(2)} {opSym} {hasVal ? v : '—'} = New Total</div>
        <div className="fw-900 fs-18" style={{ color: 'var(--blue)' }}>{newQty.toFixed(2)}</div>
      </div>

      {/* Adjustment history */}
      <div className="fg">
        <label className="fl">Adjustment History ({history.length})</label>
        {loadingHistory
          ? <div className="fs-12 text-muted mt-1">Loading…</div>
          : history.length === 0
            ? <div className="fs-12 text-muted mt-1">No adjustments logged yet</div>
            : (
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border2)', borderRadius: 8, marginTop: 4 }}>
                {history.map(h => {
                  const d = h.createdAt?.toDate ? h.createdAt.toDate() : h.createdAt ? new Date(h.createdAt) : null;
                  return (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--border2)', fontSize: 12 }}>
                      <div className="text-muted">{d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                      <div className="fw-700">{(h.balanceBefore ?? 0).toFixed(2)} {h.opSym} {h.value} → {(h.balanceAfter ?? 0).toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>
            )
        }
      </div>

      <div className="modal-foot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? <span className="spin" /> : null} Update Qty</button>
      </div>
    </div>
  );
}

function emptyGoldRow() {
  return { _key: Math.random().toString(36).slice(2), ...BLANK_GOLD };
}

// One set of fields for a single gold row — shared by the edit form and each row of the batch-add form.
// hideNameLocationDate: used in batch-add mode where Gold Name / Loan Location / Date are entered once, up top, shared by every row.
function GoldRowFields({ r, onChange, goldLoans, showCount, hideNameLocationDate, hideLoanLinkFields }) {
  const isPledged = r.loanStatus === 'pledged';
  const linkedLoan = r.linkedLoanId ? goldLoans.find(l => l.id === r.linkedLoanId) : null;

  const pickLoan = e => {
    const loanId = e.target.value;
    const loan = goldLoans.find(l => l.id === loanId);
    onChange({
      linkedLoanId: loanId,
      loanAmount: loan ? loan.amount : r.loanAmount,
      loanHolderName: loan && !r.loanHolderName ? loan.name : r.loanHolderName,
    });
  };

  return (
    <>
      {!hideNameLocationDate && (
        <div className="frow">
          <div className="fg">
            <label className="fl">Date</label>
            <DateStepper name="date" value={r.date} onChange={e => onChange({ date: e.target.value })} />
          </div>
          <div className="fg">
            <label className="fl">Loan Location / Place</label>
            <input className="fi" value={r.location} onChange={e => onChange({ location: e.target.value })} placeholder="e.g. Home Locker" />
          </div>
        </div>
      )}

      <div className="frow">
        {showCount && (
          <div className="fg">
            <label className="fl">Count (pieces)</label>
            <input className="fi" type="number" value={r.count} onChange={e => onChange({ count: e.target.value })} placeholder="e.g. 2" min="0" step="1" />
          </div>
        )}
        <div className="fg">
          <label className="fl">Total Weight (Sovereign)</label>
          <input className="fi" type="number" value={r.goldSovereign} onChange={e => onChange({ goldSovereign: e.target.value })} placeholder="e.g. 8" min="0" step="0.01" />
        </div>
      </div>

      <div className="fg">
        <label className="fl">Part/Section</label>
        <input className="fi" value={r.partSection} onChange={e => onChange({ partSection: e.target.value })} placeholder="e.g. Chain, Bangle Set" />
      </div>

      <div className="fg">
        <label className="fl">Loan Status</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {LOAN_STATUS_OPTS.map(opt => (
            <button key={opt.key} type="button" onClick={() => onChange({ loanStatus: opt.key, ...(opt.key === 'not_pledged' ? { linkedLoanId: '', loanAmount: '' } : {}) })}
              style={{ flex: 1, padding: '10px 8px', borderRadius: 10, border: `2px solid ${r.loanStatus === opt.key ? opt.color : 'var(--border2)'}`, background: r.loanStatus === opt.key ? opt.color + '15' : 'var(--bg3)', cursor: 'pointer', textAlign: 'center' }}>
              <div className="fw-700 fs-12" style={{ color: r.loanStatus === opt.key ? opt.color : 'var(--t2)' }}>{opt.label}</div>
            </button>
          ))}
        </div>
      </div>

      {isPledged && !hideLoanLinkFields && (
        <>
          <div className="fg">
            <label className="fl">Link to Gold Loan (Loans page) — optional</label>
            <select className="fs" value={r.linkedLoanId} onChange={pickLoan}>
              <option value="">— Not linked —</option>
              {goldLoans.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({fmt(l.outstandingBalance)} outstanding)</option>
              ))}
            </select>
            {goldLoans.length === 0 && <div className="fs-11 text-muted mt-1">No open Gold Loan found on the Loans page — add one there to link it here</div>}
            {linkedLoan && <div className="fs-11 mt-1" style={{ color: 'var(--blue)' }}>Loan Amount: {fmt(linkedLoan.amount)} • current balance owed: {fmt(linkedLoan.outstandingBalance)}</div>}
          </div>

          <div className="fg">
            <label className="fl">Loan Holder Name</label>
            <input className="fi" value={r.loanHolderName} onChange={e => onChange({ loanHolderName: e.target.value })} placeholder="e.g. Muthoot Finance" />
          </div>
        </>
      )}
      {isPledged && hideLoanLinkFields && (
        <div className="fs-11 text-muted">Using the common Link to Gold Loan / Loan Holder Name set above</div>
      )}
    </>
  );
}

function GoldForm({ item, goldLoans, initialCommon, onSave, onSaveMultiple, onClose }) {
  const [saving, setSaving] = useState(false);
  const isAddToBatch = !!initialCommon; // opened via a parent row's "+ Add" — Date/Location/Holder/Loan already known

  // ── Edit mode: single existing record, unchanged shape ──
  const [f, setF] = useState({ ...BLANK_GOLD, ...(item || {}) });

  // ── Add mode: Loan Location / Date / Link-to-Loan / Loan Holder entered once, shared by every row in the batch.
  // Skipped entirely when adding to an existing parent group — those values are already known (passed via initialCommon).
  const [common, setCommon] = useState({ location: '', date: today(), linkedLoanId: '', loanHolderName: '', ...(initialCommon || {}) });
  const [rows, setRows] = useState([emptyGoldRow()]);
  const updateRow = (key, patch) => setRows(prev => prev.map(r => r._key === key ? { ...r, ...patch } : r));
  const addRow = () => setRows(prev => [...prev, emptyGoldRow()]);
  const removeRow = key => setRows(prev => prev.length > 1 ? prev.filter(r => r._key !== key) : prev);

  const anyPledged = rows.some(r => r.loanStatus === 'pledged');
  const commonLinkedLoan = common.linkedLoanId ? goldLoans.find(l => l.id === common.linkedLoanId) : null;
  const pickCommonLoan = e => {
    const loanId = e.target.value;
    const loan = goldLoans.find(l => l.id === loanId);
    setCommon(p => ({ ...p, linkedLoanId: loanId, loanHolderName: loan && !p.loanHolderName ? loan.name : p.loanHolderName }));
  };

  const validRow = r => {
    if (!r.goldSovereign) return 'Fill Weight for every item';
    return null;
  };

  const submit = async () => {
    if (item) {
      if (!f.goldSovereign) { toast.error('Fill Weight'); return; }
      if (f.loanStatus === 'pledged' && !f.loanHolderName) { toast.error('Fill Loan Holder Name'); return; }
      setSaving(true);
      try { await onSave(f); } finally { setSaving(false); }
      return;
    }
    for (const r of rows) {
      const err = validRow(r);
      if (err) { toast.error(err); return; }
    }
    if (!isAddToBatch && anyPledged && !common.loanHolderName) { toast.error('Fill Loan Holder Name'); return; }
    setSaving(true);
    try {
      await onSaveMultiple(rows.map(r => {
        const merged = { ...r, location: common.location, date: common.date };
        if (merged.loanStatus === 'pledged') {
          merged.linkedLoanId = common.linkedLoanId;
          merged.loanAmount = commonLinkedLoan ? commonLinkedLoan.amount : merged.loanAmount;
          merged.loanHolderName = common.loanHolderName;
        }
        return merged;
      }));
    } finally { setSaving(false); }
  };

  if (item) {
    return (
      <div>
        <GoldRowFields r={f} onChange={patch => setF(p => ({ ...p, ...patch }))} goldLoans={goldLoans} showCount />
        <div className="fs-11 text-muted mt-1 mb-3">Use the ⚖️ button on the row to add/subtract/×/÷ the qty later</div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? <span className="spin" /> : null} Update Item</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Common fields — Loan Location / Date / Link-to-Loan / Loan Holder for the whole batch.
          Skipped when adding to an existing parent group — those are already fixed for that batch. */}
      {!isAddToBatch && (
        <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <div className="fs-11 text-muted mb-2">Common for this Add — shared by every item below</div>
          <div className="frow">
            <div className="fg">
              <label className="fl">Date</label>
              <DateStepper name="date" value={common.date} onChange={e => setCommon(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="fg">
              <label className="fl">Loan Location / Place</label>
              <input className="fi" value={common.location} onChange={e => setCommon(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Home Locker" autoFocus />
            </div>
          </div>

          {anyPledged && (
            <>
              <div className="fg">
                <label className="fl">Link to Gold Loan (Loans page) — optional</label>
                <select className="fs" value={common.linkedLoanId} onChange={pickCommonLoan}>
                  <option value="">— Not linked —</option>
                  {goldLoans.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({fmt(l.outstandingBalance)} outstanding)</option>
                  ))}
                </select>
                {goldLoans.length === 0 && <div className="fs-11 text-muted mt-1">No open Gold Loan found on the Loans page — add one there to link it here</div>}
                {commonLinkedLoan && <div className="fs-11 mt-1" style={{ color: 'var(--blue)' }}>Loan Amount: {fmt(commonLinkedLoan.amount)} • current balance owed: {fmt(commonLinkedLoan.outstandingBalance)}</div>}
              </div>
              <div className="fg">
                <label className="fl">Loan Holder Name</label>
                <input className="fi" value={common.loanHolderName} onChange={e => setCommon(p => ({ ...p, loanHolderName: e.target.value }))} placeholder="e.g. Muthoot Finance" />
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="fw-800 fs-13">Product Count: <span style={{ color: 'var(--blue)' }}>{rows.length}</span></div>
        <button className="btn btn-secondary btn-sm" type="button" onClick={addRow}>➕ Add Another Item</button>
      </div>

      {rows.map((r, idx) => (
        <div key={r._key} style={{ border: '1px solid var(--border2)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div className="flex items-center justify-between mb-2">
            <div className="fw-700 fs-12" style={{ color: 'var(--t2)' }}>Item #{idx + 1}</div>
            {rows.length > 1 && <button className="btn-icon" type="button" onClick={() => removeRow(r._key)}>🗑️</button>}
          </div>
          <GoldRowFields r={r} onChange={patch => updateRow(r._key, patch)} goldLoans={goldLoans} showCount hideNameLocationDate hideLoanLinkFields />
        </div>
      ))}

      <button className="btn btn-secondary" type="button" onClick={addRow} style={{ width: '100%', marginBottom: 14 }}>➕ Add Another Item</button>

      <div className="modal-foot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? <span className="spin" /> : null} Add {rows.length > 1 ? `${rows.length} Items` : 'Item'}</button>
      </div>
    </div>
  );
}

function GoldTracker() {
  const [items, setItems]     = useState([]);
  const [goldLoans, setGoldLoans] = useState([]); // active gold_loan entries from the Loans page, with live outstanding balance
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [edit, setEdit]       = useState(null);
  const [addCommon, setAddCommon] = useState(null); // pre-filled common fields when adding more items to an existing parent group
  const [delId, setDelId]     = useState(null);
  const [qtyItem, setQtyItem] = useState(null); // row-wise +/-/×/÷ qty adjuster
  const [showBalanceBreakdown, setShowBalanceBreakdown] = useState(false); // '+' on Current Balance card
  const [showProductTable, setShowProductTable] = useState(false); // show/hide searchable product summary
  const [showByPlace, setShowByPlace] = useState(false); // show/hide weight-by-location summary
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('goldName'); // 'goldName' | 'goldSovereign' | 'loanStatus'
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'
  const [expandedGroups, setExpandedGroups] = useState(new Set()); // parent rows expanded to show child items
  const toggleGroup = key => setExpandedGroups(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const [selectedGroups, setSelectedGroups] = useState(new Set()); // parent-row checkboxes, for bulk delete
  const toggleSelect = key => setSelectedGroups(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [goldItems, allLoans] = await Promise.all([goldTrackerService.getAll(), loanService.getAll()]);
      setItems(goldItems);

      const openGoldLoans = allLoans.filter(l => l.loanType === 'gold_loan' && l.status !== 'closed');
      const withBalance = await Promise.all(openGoldLoans.map(async l => {
        const payments = await loanPaymentService.getAll(l.id);
        return { ...l, outstandingBalance: calcLoanOutstanding(l, payments) };
      }));
      setGoldLoans(withBalance);
    } catch { toast.error('Failed to load gold items'); }
    finally { setLoading(false); }
  };

  const save = async (data) => {
    try {
      await goldTrackerService.update(edit.id, data);
      toast.success('Item updated!');
      setModal(false); setEdit(null); load();
    } catch { toast.error('Failed to save'); }
  };

  const saveMultiple = async (rows) => {
    try {
      await Promise.all(rows.map(r => {
        const { _key, ...data } = r;
        return goldTrackerService.create(data);
      }));
      toast.success(rows.length > 1 ? `${rows.length} items added!` : 'Item added!');
      setModal(false); setEdit(null); load();
    } catch { toast.error('Failed to save'); }
  };

  const saveQty = async (data) => {
    try { await goldTrackerService.update(data.id, data); toast.success('Quantity updated!'); setQtyItem(null); load(); }
    catch { toast.error('Failed'); }
  };

  const del = async () => {
    try { await goldTrackerService.delete(delId); toast.success('Deleted'); setDelId(null); load(); }
    catch { toast.error('Failed'); }
  };

  // Resolve an item's live current balance: linked loan's synced outstanding balance, else manually entered loan amount
  const currentBalanceOf = i => {
    if (i.loanStatus !== 'pledged') return 0;
    const linked = i.linkedLoanId ? goldLoans.find(l => l.id === i.linkedLoanId) : null;
    return linked ? linked.outstandingBalance : (parseFloat(i.loanAmount) || 0);
  };

  const totalSovereign = items.reduce((s, i) => s + (parseFloat(i.goldSovereign) || 0), 0);
  const pledgedItems   = items.filter(i => i.loanStatus === 'pledged');

  // Group items added together in the same batch (same Date + Loan Location + Loan Holder + Loan Amount)
  // into one parent row, with the individual items as expandable child rows.
  const groupMap = new Map();
  for (const i of items) {
    const key = `${i.date}|${i.location || ''}|${i.loanHolderName || ''}|${i.loanAmount || ''}`;
    if (!groupMap.has(key)) groupMap.set(key, { key, date: i.date, location: i.location, loanHolderName: i.loanHolderName, loanAmount: i.loanAmount, items: [] });
    groupMap.get(key).items.push(i);
  }
  const groups = Array.from(groupMap.values())
    .map(g => {
      const groupPledged = g.items.filter(x => x.loanStatus === 'pledged');
      const allPledged = g.items.length > 0 && groupPledged.length === g.items.length;
      const nonePledged = groupPledged.length === 0;
      const groupStatus = allPledged ? 'pledged' : nonePledged ? 'not_pledged' : 'mixed';
      const repLinked = groupPledged.length && groupPledged[0].linkedLoanId ? goldLoans.find(l => l.id === groupPledged[0].linkedLoanId) : null;
      return {
        ...g,
        totalCount: g.items.reduce((s, x) => s + (parseFloat(x.count) || 0), 0),
        totalWeight: g.items.reduce((s, x) => s + (parseFloat(x.goldSovereign) || 0), 0),
        groupStatus,
        repLinked,
        groupBalance: groupPledged.length ? (repLinked ? repLinked.outstandingBalance : (parseFloat(g.loanAmount) || 0)) : 0,
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // "Current Balance" stat = sum of each parent row's Actual Loan Amount (not per-item, since
  // several items can share one loan — summing per item would double-count it).
  const totalLoan = groups.reduce((s, g) => s + (g.groupStatus !== 'not_pledged' ? (parseFloat(g.loanAmount) || 0) : 0), 0);

  // By-place summary: every item grouped purely by "location" (the place
  // it's physically kept — e.g. "Indian Bank", "TMB"), regardless of which
  // batch/date it was added in. Shows total weight per place, item count,
  // and the sum of any loan amounts against pledged items there.
  const placeMap = new Map();
  for (const i of items) {
    const place = i.location || 'Unspecified';
    if (!placeMap.has(place)) placeMap.set(place, { place, items: [] });
    placeMap.get(place).items.push(i);
  }
  const byPlace = Array.from(placeMap.values())
    .map(p => ({
      ...p,
      totalWeight: p.items.reduce((s, x) => s + (parseFloat(x.goldSovereign) || 0), 0),
      totalLoanAmount: p.items.reduce((s, x) => s + (x.loanStatus === 'pledged' ? (parseFloat(x.loanAmount) || 0) : 0), 0),
    }))
    .sort((a, b) => b.totalWeight - a.totalWeight);
  const [selectedPlaceItems, setSelectedPlaceItems] = useState(new Set());
  const togglePlaceItem = id => setSelectedPlaceItems(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const togglePlaceAll = (placeItems) => {
    const ids = placeItems.map(i => i.id);
    const allIn = ids.every(id => selectedPlaceItems.has(id));
    setSelectedPlaceItems(prev => {
      const next = new Set(prev);
      ids.forEach(id => allIn ? next.delete(id) : next.add(id));
      return next;
    });
  };
  const bulkDeletePlaceItems = async () => {
    try {
      await Promise.all([...selectedPlaceItems].map(id => goldTrackerService.delete(id)));
      toast.success(`${selectedPlaceItems.size} item(s) deleted`);
      setSelectedPlaceItems(new Set()); load();
    } catch { toast.error('Failed to delete selected'); }
  };

  const bulkDelete = async () => {
    const idsToDelete = groups.filter(g => selectedGroups.has(g.key)).flatMap(g => g.items.map(i => i.id));
    try {
      await Promise.all(idsToDelete.map(id => goldTrackerService.delete(id)));
      toast.success(`${idsToDelete.length} item(s) deleted across ${selectedGroups.size} loan group(s)`);
      setSelectedGroups(new Set()); setBulkDeleteConfirm(false); load();
    } catch { toast.error('Failed to delete selected'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="fw-900 fs-16">💎 Gold Tracker</div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setShowProductTable(v => !v)}>{showProductTable ? '🙈 Hide' : '👁️ Show'} Product Table</button>
          <button className="btn btn-secondary" onClick={() => setShowByPlace(v => !v)}>{showByPlace ? '🙈 Hide' : '📍 Show'} By Place</button>
          <button className="btn btn-primary" onClick={() => { setEdit(null); setAddCommon(null); setModal(true); }}>+ Add Item</button>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { key: 'items',   label: 'Total Items',      val: items.length,          c: 'var(--blue)',   icon: '💎' },
            { key: 'weight',  label: 'Total Weight (Sovereign)', val: totalSovereign.toFixed(2), c: 'var(--yellow)', icon: '⚖️' },
            { key: 'pledged', label: 'Pledged Items',    val: pledgedItems.length,   c: 'var(--red)',    icon: '🔒' },
            { key: 'balance', label: 'Current Balance',  val: fmt(totalLoan),        c: 'var(--orange)', icon: '💰' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${s.c}` }}>
              <div className="flex items-center justify-between">
                <div className="fs-11 text-muted">{s.icon} {s.label}</div>
                {s.key === 'balance' && pledgedItems.length > 0 && (
                  <button className="btn-icon" title="Show product breakdown" onClick={() => setShowBalanceBreakdown(v => !v)} style={{ fontSize: 11, padding: '1px 6px', lineHeight: 1 }}>
                    {showBalanceBreakdown ? '−' : '➕'}
                  </button>
                )}
              </div>
              <div className="fw-800 fs-14 mt-1" style={{ color: s.c }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {showBalanceBreakdown && pledgedItems.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div className="fw-800 fs-13 mb-2">Pledged Products — Current Balance Breakdown</div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {pledgedItems.map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border2)', fontSize: 13 }}>
                <div>{i.goldName || i.partSection || '—'} <span className="fs-11 text-muted">({(parseFloat(i.goldSovereign) || 0).toFixed(2)} wt)</span></div>
                <div className="fw-700">{fmt(currentBalanceOf(i))}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTop: '2px solid var(--border)' }}>
            <div className="fw-800 fs-13">Sum of Total Weight (Sovereign)</div>
            <div className="fw-900 fs-14" style={{ color: 'var(--blue)' }}>{pledgedItems.reduce((s, i) => s + (parseFloat(i.goldSovereign) || 0), 0).toFixed(2)}</div>
          </div>
        </div>
      )}

      {showProductTable && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div className="flex items-center justify-between mb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="fw-800 fs-13">Product Summary</div>
            <input className="fi" style={{ maxWidth: 220 }} placeholder="🔍 Search by product name" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  {[
                    { key: 'goldName', label: 'Product Name' },
                    { key: 'goldSovereign', label: 'Weight' },
                    { key: 'loanStatus', label: 'Pledged' },
                  ].map(col => (
                    <th key={col.key} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => {
                      if (sortKey === col.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                      else { setSortKey(col.key); setSortDir('asc'); }
                    }}>
                      {col.label} {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items
                  .filter(i => ((i.goldName || i.partSection || '')).toLowerCase().includes(searchTerm.toLowerCase()))
                  .slice()
                  .sort((a, b) => {
                    let av, bv;
                    if (sortKey === 'goldSovereign') { av = parseFloat(a.goldSovereign) || 0; bv = parseFloat(b.goldSovereign) || 0; }
                    else { av = (a[sortKey] || '').toString().toLowerCase(); bv = (b[sortKey] || '').toString().toLowerCase(); }
                    if (av < bv) return sortDir === 'asc' ? -1 : 1;
                    if (av > bv) return sortDir === 'asc' ? 1 : -1;
                    return 0;
                  })
                  .map(i => (
                    <tr key={i.id}>
                      <td className="fw-700">{i.goldName || i.partSection || '—'}</td>
                      <td>{(parseFloat(i.goldSovereign) || 0).toFixed(2)}</td>
                      <td>
                        <span style={{ background: (i.loanStatus === 'pledged' ? '#f43f5e' : '#22c55e') + '20', color: i.loanStatus === 'pledged' ? '#f43f5e' : '#22c55e', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20 }}>
                          {i.loanStatus === 'pledged' ? 'Pledged' : 'Not Pledged'}
                        </span>
                      </td>
                    </tr>
                  ))
                }
                {items.filter(i => ((i.goldName || i.partSection || '')).toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                  <tr><td colSpan={3} className="text-muted" style={{ textAlign: 'center', padding: 16 }}>No products match your search</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showByPlace && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div className="flex items-center justify-between mb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="fw-800 fs-13">📍 Weight By Place</div>
            {selectedPlaceItems.size > 0 && (
              <button className="btn btn-danger btn-sm" onClick={bulkDeletePlaceItems}>🗑️ Delete {selectedPlaceItems.size} Selected</button>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Description</th>
                  <th>Total Weight</th>
                  <th>Place</th>
                  <th>Loan Amount</th>
                </tr>
              </thead>
              <tbody>
                {byPlace.map(p => (
                  <Fragment key={p.place}>
                    {p.items.map((i, idx) => (
                      <tr key={i.id}>
                        <td><input type="checkbox" checked={selectedPlaceItems.has(i.id)} onChange={() => togglePlaceItem(i.id)} /></td>
                        <td className="fw-700">{i.goldName || i.partSection || '—'}</td>
                        <td>{(parseFloat(i.goldSovereign) || 0).toFixed(2)}</td>
                        <td>{idx === 0 ? <span className="fw-700">{p.place}</span> : ''}</td>
                        <td>{i.loanStatus === 'pledged' ? fmt(parseFloat(i.loanAmount) || 0) : '—'}</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--bg3)' }}>
                      <td><input type="checkbox" checked={p.items.every(i => selectedPlaceItems.has(i.id))} onChange={() => togglePlaceAll(p.items)} title="Select all in this place" /></td>
                      <td className="fw-800 fs-12 text-muted">Subtotal — {p.place}</td>
                      <td className="fw-900" style={{ color: 'var(--yellow, #eab308)' }}>{p.totalWeight.toFixed(2)}</td>
                      <td></td>
                      <td className="fw-800">{p.totalLoanAmount > 0 ? fmt(p.totalLoanAmount) : ''}</td>
                    </tr>
                  </Fragment>
                ))}
                {byPlace.length === 0 && (
                  <tr><td colSpan={5} className="text-muted" style={{ textAlign: 'center', padding: 16 }}>No items yet</td></tr>
                )}
              </tbody>
              {byPlace.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td></td>
                    <td className="fw-900">Grand Total</td>
                    <td className="fw-900" style={{ color: 'var(--yellow, #eab308)' }}>{totalSovereign.toFixed(2)}</td>
                    <td></td>
                    <td className="fw-900">{fmt(byPlace.reduce((s, p) => s + p.totalLoanAmount, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {loading
        ? <div className="spin-center"><div className="spin spin-lg" /></div>
        : items.length === 0
          ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>💎</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>No gold items yet</div>
              <div className="text-muted fs-14 mb-5">Track gold sovereigns, storage location, and loan/pledge status</div>
              <button className="btn btn-primary" style={{ fontSize: 15, padding: '10px 28px' }} onClick={() => setModal(true)}>+ Add First Item</button>
            </div>
          )
          : (
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <div className="flex items-center justify-between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                <div className="fw-800 fs-13">Gold Loan Summary ({groups.length})</div>
                <div className="flex items-center gap-2">
                  {selectedGroups.size > 0 && (
                    <button className="btn btn-sm" style={{ background: '#f43f5e', color: '#fff', border: 'none' }} onClick={() => setBulkDeleteConfirm(true)}>
                      🗑️ Delete Selected ({selectedGroups.size})
                    </button>
                  )}
                  <button className="btn-icon" title="Add Item(s)" onClick={() => { setEdit(null); setAddCommon(null); setModal(true); }}>➕</button>
                </div>
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th></th>
                    <th></th>
                    <th>Gold Owner / Loaner Name</th>
                    <th style={{ textAlign: 'right' }}>Total Gold Weight</th>
                    <th style={{ textAlign: 'right' }}>Total Count</th>
                    <th style={{ textAlign: 'right' }}>Current Loan Amount</th>
                    <th style={{ textAlign: 'right' }}>Actual Loan Amount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => {
                    const isExpanded = expandedGroups.has(g.key);
                    const isSelected = selectedGroups.has(g.key);
                    return (
                      <Fragment key={g.key}>
                        <tr>
                          <td><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(g.key)} /></td>
                          <td><button className="btn-icon" title={isExpanded ? 'Hide items' : 'Show items'} onClick={() => toggleGroup(g.key)}>{isExpanded ? '▼' : '▶'}</button></td>
                          <td className="fs-12 text-muted">{g.loanHolderName || '—'}</td>
                          <td style={{ textAlign: 'right' }} className="fw-700">{g.totalWeight.toFixed(2)} g</td>
                          <td style={{ textAlign: 'right' }} className="fw-700">{g.totalCount || '—'}</td>
                          <td style={{ textAlign: 'right', color: g.repLinked ? 'var(--blue)' : undefined }} className="fw-700">
                            {g.groupStatus !== 'not_pledged' && (g.repLinked || g.loanAmount) ? fmt(g.groupBalance) : '—'}
                            {g.repLinked && <div className="fs-10 text-muted" style={{ fontWeight: 400 }}>synced • {g.repLinked.name}</div>}
                          </td>
                          <td style={{ textAlign: 'right' }} className="fw-700">{g.groupStatus !== 'not_pledged' && g.loanAmount ? fmt(parseFloat(g.loanAmount) || 0) : '—'}</td>
                          <td>
                            <button className="btn btn-secondary btn-sm" title="Add another product to this batch" onClick={() => {
                              setEdit(null);
                              setAddCommon({
                                location: g.location,
                                date: g.date,
                                loanHolderName: g.loanHolderName || '',
                                linkedLoanId: g.repLinked ? g.repLinked.id : '',
                              });
                              setModal(true);
                            }}>➕ Add</button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0, background: 'var(--bg3)' }}>
                              <table className="tbl" style={{ width: '100%' }}>
                                <thead>
                                  <tr>
                                    <th>Gold Product Name</th>
                                    <th style={{ textAlign: 'right' }}>Gold Product Weight</th>
                                    <th style={{ textAlign: 'right' }}>Gold Product Count</th>
                                    <th></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.items.map(i => (
                                    <tr key={i.id}>
                                      <td className="fw-700">{i.goldName || i.partSection || '—'}</td>
                                      <td style={{ textAlign: 'right' }} className="fw-700">{(parseFloat(i.goldSovereign) || 0).toFixed(2)} g</td>
                                      <td style={{ textAlign: 'right' }} className="fs-12 text-muted">{i.count || '—'}</td>
                                      <td>
                                        <div className="flex gap-2">
                                          <button className="btn-icon" title="Adjust Qty" onClick={() => setQtyItem(i)}>➕</button>
                                          <button className="btn btn-secondary btn-sm" onClick={() => { setEdit(i); setModal(true); }}>✏️</button>
                                          <button className="btn-icon" onClick={() => setDelId(i.id)}>🗑️</button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
      }

      {modal && (
        <Modal title={edit ? '✏️ Edit Gold Item' : addCommon ? '➕ Add to Batch' : '💎 New Gold Item'} onClose={() => { setModal(false); setEdit(null); setAddCommon(null); }}>
          <GoldForm item={edit} goldLoans={goldLoans} initialCommon={addCommon} onSave={save} onSaveMultiple={saveMultiple} onClose={() => { setModal(false); setEdit(null); setAddCommon(null); }} />
        </Modal>
      )}
      {qtyItem && (
        <Modal title={`⚖️ Adjust Quantity — ${qtyItem.goldName || qtyItem.partSection || 'Item'}`} onClose={() => setQtyItem(null)}>
          <QtyAdjustModal item={qtyItem} linkedLoan={qtyItem.linkedLoanId ? goldLoans.find(l => l.id === qtyItem.linkedLoanId) : null} onSave={saveQty} onClose={() => setQtyItem(null)} />
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
      {bulkDeleteConfirm && <ConfirmDelete onConfirm={bulkDelete} onCancel={() => setBulkDeleteConfirm(false)} />}
    </div>
  );
}

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
  const [pageTab, setPageTab] = useState('calculator'); // 'calculator' | 'gold'

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

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 2, marginBottom: 20, overflowX: 'auto' }}>
        {[
          { key: 'calculator', label: '🧮 Loan Calculator' },
          { key: 'gold',       label: '💎 Gold Tracker' },
        ].map(t => (
          <button key={t.key} onClick={() => setPageTab(t.key)}
            style={{ padding: '8px 18px', borderRadius: '8px 8px 0 0', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', background: pageTab === t.key ? 'var(--bg3)' : 'transparent', color: pageTab === t.key ? 'var(--text)' : 'var(--t3)', borderBottom: pageTab === t.key ? '2px solid var(--blue)' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Gold Tracker Tab */}
      {pageTab === 'gold' && <GoldTracker />}

      {/* Loan Calculator Tab */}
      {pageTab === 'calculator' && (
      <>
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
      </>
      )}
    </div>
  );
}