import { useState, useEffect } from 'react';
import { fmt, fmtDate, today } from '../utils/helpers';
import { loanService, loanPaymentService } from '../utils/dbService';
import { ConfirmDelete, Modal } from '../components/UI';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function calcEMI(principal, ratePercent, months) {
  if (!principal || !ratePercent || !months) return 0;
  const r = ratePercent / 12 / 100;
  if (r === 0) return principal / months;
  return principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
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

  // Calculate running balance with interest split for each payment
  const calcSchedule = () => {
    const annualRate = parseFloat(loan.rate) || 0;
    const monthlyRate = annualRate / 12 / 100;
    const loanDate = loan.startDate ? new Date(loan.startDate) : new Date(loan.createdAt?.toDate?.() || Date.now());
    const sorted = [...payments].sort((a, b) => new Date(a.date) - new Date(b.date));

    let balance = parseFloat(loan.amount);
    let prevDate = loanDate;
    const rows = [];

    for (const p of sorted) {
      const payDate = new Date(p.date);
      // Calculate days since last payment for daily interest
      const days = Math.max(0, Math.round((payDate - prevDate) / (1000 * 60 * 60 * 24)));
      const interestAccrued = annualRate > 0 ? balance * (annualRate / 100) * (days / 365) : 0;
      const principalPaid = Math.max(0, p.amount - interestAccrued);
      const newBalance = Math.max(0, balance - principalPaid);

      rows.push({
        ...p,
        days,
        interestPaid: interestAccrued,
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

  return (
    <div>
      {/* Loan Summary */}
      <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Original Loan', val: fmt(loan.amount), c: 'var(--text)' },
            { label: 'Balance Remaining', val: fmt(finalBalance), c: cleared ? 'var(--green)' : 'var(--red)' },
            { label: 'Total Paid', val: fmt(totalPaid), c: 'var(--green)' },
            { label: 'Interest Paid', val: fmt(totalInterestPaid), c: 'var(--orange)' },
            { label: 'Principal Paid', val: fmt(totalPrincipalPaid), c: 'var(--blue)' },
            { label: 'Rate', val: `${loan.rate}% p.a.`, c: 'var(--purple)' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px' }}>
              <div className="fs-11 text-muted">{s.label}</div>
              <div className="fw-800 fs-13" style={{ color: s.c }}>{s.val}</div>
            </div>
          ))}
        </div>
        {/* Progress bar */}
        <div style={{ background: 'var(--bg4)', borderRadius: 8, height: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${paidPct}%`, background: cleared ? 'var(--green)' : 'var(--blue)', borderRadius: 8, transition: 'width .5s' }} />
        </div>
        <div className="flex justify-between mt-1">
          <span className="fs-11 text-muted">{paidPct}% principal repaid</span>
          {cleared && <span className="fs-11 fw-700" style={{ color: 'var(--green)' }}>✅ Loan Cleared!</span>}
        </div>
      </div>

      {/* Add Payment */}
      {!cleared && (
        <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div className="fs-13 fw-700 mb-2">+ Record Payment</div>
          {/* Preview interest split */}
          {form.amount && parseFloat(form.amount) > 0 && (() => {
            const annualRate = parseFloat(loan.rate) || 0;
            const loanDate = loan.startDate ? new Date(loan.startDate) : new Date();
            const lastPayDate = payments.length > 0
              ? new Date(Math.max(...payments.map(p => new Date(p.date))))
              : loanDate;
            const payDate = form.date ? new Date(form.date) : new Date();
            const days = Math.max(0, Math.round((payDate - lastPayDate) / (1000 * 60 * 60 * 24)));
            const interest = finalBalance * (annualRate / 100) * (days / 365);
            const principal = Math.max(0, parseFloat(form.amount) - interest);
            const newBal = Math.max(0, finalBalance - principal);
            return (
              <div style={{ background: 'rgba(77,158,255,.08)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>
                <div className="fw-700 mb-1" style={{ color: 'var(--blue)' }}>📊 Payment Breakdown Preview</div>
                <div className="flex justify-between mb-1"><span className="text-muted">Interest ({days} days @ {annualRate}%)</span><span className="fw-700 amt-r">{fmt(interest)}</span></div>
                <div className="flex justify-between mb-1"><span className="text-muted">Principal Reduction</span><span className="fw-700 amt-g">{fmt(principal)}</span></div>
                <div className="flex justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}><span className="fw-700">New Balance</span><span className="fw-800 fs-13" style={{ color: newBal <= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(newBal)}</span></div>
              </div>
            );
          })()}
          <div className="frow">
            <div className="fg"><label className="fl">Date</label><input className="fi" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
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
                      <th style={{ textAlign: 'right' }}>Interest</th>
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
  const [result, setResult] = useState(null);
  const [loans, setLoans] = useState([]);
  const [loanPayments, setLoanPayments] = useState({});
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState(null);
  const [payModal, setPayModal] = useState(null); // selected loan for payment

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
    if (!principal || !rate || !months) { toast.error('Fill all fields'); return; }
    const emi = calcEMI(principal, rate, months);
    const totalPayment = emi * months;
    const totalInterest = totalPayment - principal;
    const breakdown = [];
    let balance = principal;
    const r = rate / 12 / 100;
    for (let m = 1; m <= Math.min(months, 12); m++) {
      const interest = balance * r;
      const principal_part = emi - interest;
      balance -= principal_part;
      breakdown.push({ m: `M${m}`, principal: Math.round(principal_part), interest: Math.round(interest) });
    }
    setResult({ emi, totalPayment, totalInterest, months, breakdown });
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

  const ch = e => setCalc(p => ({ ...p, [e.target.name]: e.target.value }));

  // Totals across all saved loans
  const totalLoanAmount   = loans.reduce((s, l) => s + (l.amount || 0), 0);
  const totalInterestAll  = loans.reduce((s, l) => s + (l.totalInterest || 0), 0);
  const totalPaymentAll   = loans.reduce((s, l) => s + (l.totalPayment || 0), 0);
  const totalPaidAll      = loans.reduce((s, l) => s + (loanPayments[l.id] || 0), 0);
  const totalOutstanding  = loans.reduce((s, l) => s + Math.max(0, l.amount - (loanPayments[l.id] || 0)), 0);

  return (
    <div>
      <div className="page-head">
        <div><div className="page-title">🧮 Loan Calculator</div><div className="page-sub">Calculate EMI & track payments</div></div>
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
            <div className="fg"><label className="fl">Loan Start Date</label><input className="fi" type="date" name="startDate" value={calc.startDate} onChange={ch} /></div>
          </div>
          <div className="fg"><label className="fl">Annual Interest Rate (%)</label><input className="fi" type="number" name="rate" value={calc.rate} onChange={ch} placeholder="e.g. 12" step="0.1" min="0" /></div>
          <div className="fg">
            <label className="fl">Loan Tenure</label>
            <div className="flex gap-2">
              <input className="fi" type="number" name="tenure" value={calc.tenure} onChange={ch} placeholder="e.g. 24" min="1" style={{ flex: 1 }} />
              <select className="fs" name="tenureType" value={calc.tenureType} onChange={ch} style={{ width: 100 }}>
                <option value="months">Months</option>
                <option value="years">Years</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: 8 }} onClick={calculate}>🧮 Calculate EMI</button>
        </div>

        {/* Result */}
        {result && (
          <div className="card">
            <div className="card-title">📋 EMI Summary</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                { label: 'Monthly EMI', val: fmt(result.emi), c: 'var(--blue)', icon: '📅' },
                { label: 'Total Interest', val: fmt(result.totalInterest), c: 'var(--red)', icon: '💸' },
                { label: 'Total Payment', val: fmt(result.totalPayment), c: 'var(--orange)', icon: '💰' },
                { label: 'Duration', val: `${result.months} months`, c: 'var(--purple)', icon: '📆' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, borderLeft: `3px solid ${s.c}` }}>
                  <span className="fs-12 text-muted">{s.icon} {s.label}</span>
                  <span style={{ fontWeight: 800, color: s.c, fontSize: 14 }}>{s.val}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary w-full" style={{ justifyContent: 'center', marginTop: 14 }} onClick={saveToLoans} disabled={saving}>
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

      {/* Saved Loans */}
      {loans.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">💾 My Loans — click to track payments</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {loans.map(l => {
              const paid = loanPayments[l.id] || 0;
              const outstanding = Math.max(0, l.amount - paid);
              const paidPct = l.amount > 0 ? Math.min(100, (paid / l.amount) * 100).toFixed(1) : 0;
              const cleared = outstanding <= 0;
              return (
                <div key={l.id} style={{ background: 'var(--bg3)', borderRadius: 12, padding: 14, border: `1px solid ${cleared ? 'rgba(34,197,94,.3)' : 'var(--border)'}` }}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
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
                    <div className="flex gap-2 items-center">
                      {cleared
                        ? <span style={{ background: 'rgba(34,197,94,.15)', color: 'var(--green)', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20 }}>✅ Cleared</span>
                        : <button className="btn btn-primary btn-sm" onClick={() => setPayModal(l)}>💳 Pay</button>
                      }
                      <button className="btn-icon" onClick={() => setDelId(l.id)}>🗑️</button>
                    </div>
                  </div>
                  <div className="flex justify-between fs-12 mb-2" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <span>Loan: <span className="fw-700">{fmt(l.amount)}</span></span>
                    <span>Paid: <span className="fw-700 amt-g">{fmt(paid)}</span></span>
                    <span>Balance: <span className={`fw-700 ${cleared ? 'amt-g' : 'amt-r'}`}>{fmt(outstanding)}</span></span>
                  </div>
                  <div style={{ background: 'var(--bg4)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${paidPct}%`, background: cleared ? 'var(--green)' : 'var(--blue)', borderRadius: 8, transition: 'width .5s' }} />
                  </div>
                  <div className="fs-11 text-muted mt-1">{paidPct}% repaid</div>
                </div>
              );
            })}
          </div>
        </div>
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