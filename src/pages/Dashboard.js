import { useState, useEffect } from 'react';
import { incomeService, expenseService, investmentService, netWorthService, loanService, goalsService } from '../utils/dbService';
import { fmt, MONTHS, PALETTE } from '../utils/helpers';
import { format, differenceInDays } from 'date-fns';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { db } from '../utils/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

function getInsuranceDueAlerts(policies) {
  const today = new Date();
  const alerts = [];
  policies.forEach(p => {
    if (!p.isActive) return;
    const due = new Date(p.dueDate);
    const days = differenceInDays(due, today);
    if (days < 0) {
      alerts.push({ id: p.id, name: p.name, days, type: 'overdue', amount: p.premiumAmount });
    } else if (days === 0) {
      alerts.push({ id: p.id, name: p.name, days, type: 'today', amount: p.premiumAmount });
    } else if (days <= 5) {
      alerts.push({ id: p.id, name: p.name, days, type: 'urgent', amount: p.premiumAmount });
    } else if (days <= 15) {
      alerts.push({ id: p.id, name: p.name, days, type: 'soon', amount: p.premiumAmount });
    } else if (days <= 30) {
      alerts.push({ id: p.id, name: p.name, days, type: 'upcoming', amount: p.premiumAmount });
    }
  });
  return alerts.sort((a, b) => a.days - b.days);
}

const ALERT_STYLES = {
  overdue:  { bg: 'rgba(244,63,94,.12)',  border: 'rgba(244,63,94,.4)',  color: '#f43f5e', icon: '🚨', label: 'OVERDUE' },
  today:    { bg: 'rgba(244,63,94,.15)',  border: 'rgba(244,63,94,.5)',  color: '#f43f5e', icon: '🔴', label: 'DUE TODAY' },
  urgent:   { bg: 'rgba(251,146,60,.12)', border: 'rgba(251,146,60,.4)', color: '#fb923c', icon: '⚠️', label: 'URGENT' },
  soon:     { bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.35)',color: '#fbbf24', icon: '🔔', label: 'SOON' },
  upcoming: { bg: 'rgba(148,163,184,.1)', border: 'rgba(148,163,184,.3)', color: '#94a3b8', icon: '📅', label: 'UPCOMING' },
};

function InsuranceAlertBanner({ alerts, onDismiss }) {
  const [dismissed, setDismissed] = useState(new Set());
  const visible = alerts.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ fontSize: 16 }}>🛡️</span>
        <span className="fw-700 fs-14">Insurance Due Alerts</span>
        <Link to="/insurance" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', fontSize: 11 }}>View All</Link>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {visible.map(a => {
          const st = ALERT_STYLES[a.type];
          return (
            <div key={a.id} style={{ background: st.bg, border: `1px solid ${st.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{st.icon}</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="fw-700 fs-13">{a.name}</div>
                <div className="fs-12" style={{ color: st.color }}>
                  {a.type === 'overdue' ? `${Math.abs(a.days)} day${Math.abs(a.days) !== 1 ? 's' : ''} overdue` :
                   a.type === 'today' ? 'Due today!' :
                   `Due in ${a.days} day${a.days !== 1 ? 's' : ''}`}
                </div>
              </div>
              {a.amount && <div style={{ textAlign: 'right' }}><div className="fs-11 text-muted">Amount</div><div className="fw-800 fs-13" style={{ color: st.color }}>{fmt(a.amount)}</div></div>}
              <span style={{ background: st.color, color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 20 }}>{st.label}</span>
              <button onClick={() => setDismissed(s => new Set([...s, a.id]))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--t3)', padding: '0 4px', flexShrink: 0 }}>✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const now = new Date();
  const [stats, setStats] = useState({ income: 0, expenses: 0, portfolio: 0, savings: 0, pnl: 0, netWorth: 0, totalLoans: 0 });
  const [daily, setDaily] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [catPie, setCatPie] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [insuranceAlerts, setInsuranceAlerts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const m = now.getMonth() + 1, y = now.getFullYear();
      const uid = () => user?.uid;
      const [incomes, expenses, invs, nw, loans] = await Promise.all([
        incomeService.getAll({ month: m, year: y }),
        expenseService.getAll({ month: m, year: y }),
        investmentService.getAll(),
        netWorthService.get(),
        loanService.getAll()
      ]);
      const inc = incomes.reduce((s, i) => s + +i.amount, 0);
      const exp = expenses.reduce((s, e) => s + +e.amount, 0);
      const portVal = invs.reduce((s, i) => s + i.currentValue, 0);
      const portPnL = invs.reduce((s, i) => s + i.profitLoss, 0);
      const assets = Object.values(nw.assets || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      const liabilities = Object.values(nw.liabilities || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      const totalLoans = loans.reduce((s, l) => s + (l.amount || 0), 0);
      setStats({ income: inc, expenses: exp, portfolio: portVal, savings: inc - exp, pnl: portPnL, netWorth: assets - liabilities, totalLoans });
      setInvestments(invs.slice(0, 5));

      const days = new Date(y, m, 0).getDate();
      const dmap = {};
      expenses.forEach(e => { const d = new Date(e.date).getDate(); dmap[d] = (dmap[d] || 0) + +e.amount; });
      setDaily(Array.from({ length: days }, (_, i) => ({ d: i + 1, amt: dmap[i + 1] || 0 })));

      const [allInc, allExp] = await Promise.all([incomeService.getAll({ year: y }), expenseService.getAll({ year: y })]);
      const imap = {}, emap = {};
      allInc.forEach(i => { const mo = new Date(i.date).getMonth(); imap[mo] = (imap[mo] || 0) + +i.amount; });
      allExp.forEach(e => { const mo = new Date(e.date).getMonth(); emap[mo] = (emap[mo] || 0) + +e.amount; });
      setMonthly(MONTHS.map((n, i) => ({ n, inc: imap[i] || 0, exp: emap[i] || 0 })));

      const catMap = {};
      expenses.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + +e.amount; });
      setCatPie(Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name, value], i) => ({ name, value, color: PALETTE[i] })));

      // Load insurance
      try {
        const insQ = query(collection(db, 'insurance'), where('userId', '==', user?.uid));
        const insSnap = await getDocs(insQ);
        const policies = insSnap.docs.map(d => ({
          id: d.id, ...d.data(),
          dueDate: d.data().dueDate?.toDate?.() || new Date(d.data().dueDate),
        }));
        setInsuranceAlerts(getInsuranceDueAlerts(policies));
      } catch { /* insurance optional */ }

      // Load goals
      try { setGoals(await goalsService.getAll()); } catch { /* optional */ }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const hr = now.getHours();
  const greet = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
  const [hidden, setHidden] = useState({ portfolio: true, netWorth: true });
  const toggleHide = key => setHidden(p => ({ ...p, [key]: !p[key] }));
  const mask = () => '₹ ••••••';

  if (loading) return <div className="spin-center"><div className="spin spin-lg" /></div>;

  return (
    <div>
      <div className="mb-5">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Good {greet}, {user?.displayName?.split(' ')[0] || 'there'}! 👋</h2>
        <div className="text-muted fs-13" style={{ marginTop: 4 }}>{format(now, 'EEEE, MMMM d, yyyy')}</div>
      </div>

      {/* Insurance Alerts */}
      {insuranceAlerts.length > 0 && <InsuranceAlertBanner alerts={insuranceAlerts} />}

      {/* Main Stats */}
      <div className="stats">
        {[
          { icon: '💵', label: 'Monthly Income', val: fmt(stats.income), c: 'var(--green)' },
          { icon: '💸', label: 'Monthly Expenses', val: fmt(stats.expenses), c: 'var(--red)' },
          { icon: '🏦', label: 'Balance', val: fmt(stats.savings), c: stats.savings >= 0 ? 'var(--green)' : 'var(--red)' },
          { icon: '📈', label: 'Portfolio Value', val: hidden.portfolio ? mask() : fmt(stats.portfolio), c: 'var(--blue)', sub: hidden.portfolio ? '••••••' : `P&L: ${stats.pnl >= 0 ? '+' : ''}${fmt(stats.pnl)}`, hideKey: 'portfolio' },
          { icon: '💎', label: 'Net Worth', val: hidden.netWorth ? mask() : fmt(stats.netWorth), c: stats.netWorth >= 0 ? 'var(--purple)' : 'var(--red)', hideKey: 'netWorth' },
          { icon: '🏧', label: 'Total Loans', val: fmt(stats.totalLoans), c: 'var(--orange)' },
        ].map((s, i) => (
          <div key={i} className="stat" style={{ '--c': s.c, position: 'relative' }}>
            {s.hideKey && (
              <button onClick={() => toggleHide(s.hideKey)} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--t3)', padding: 2 }}>
                {hidden[s.hideKey] ? '👁️' : '🙈'}
              </button>
            )}
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-val" style={{ color: s.c, letterSpacing: hidden[s.hideKey] ? 2 : 0 }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
            {s.sub && <div className="stat-sub">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="charts">
        <div className="card">
          <div className="card-title">📅 Daily Spending — {format(now, 'MMMM')}</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={daily}><XAxis dataKey="d" tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} interval={4} /><YAxis hide /><Tooltip formatter={v => fmt(v)} cursor={{ fill: 'rgba(77,158,255,.08)' }} /><Bar dataKey="amt" fill="var(--green)" radius={[3,3,0,0]} maxBarSize={22} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-title">📊 Income vs Expenses — {now.getFullYear()}</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={monthly}><XAxis dataKey="n" tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} /><YAxis hide /><Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, fontSize: 12 }} /><Bar dataKey="inc" fill="var(--green)" name="Income" radius={[3,3,0,0]} maxBarSize={14} /><Bar dataKey="exp" fill="var(--red)" name="Expenses" radius={[3,3,0,0]} maxBarSize={14} /><Legend wrapperStyle={{ fontSize: 11 }} /></BarChart>
          </ResponsiveContainer>
        </div>
        {catPie.length > 0 && (
          <div className="card">
            <div className="card-title">🗂️ Expense Categories</div>
            <div className="flex" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <ResponsiveContainer width={150} height={150}><PieChart><Pie data={catPie} cx="50%" cy="50%" innerRadius={42} outerRadius={70} dataKey="value" paddingAngle={2}>{catPie.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip formatter={v => fmt(v)} /></PieChart></ResponsiveContainer>
              <div style={{ flex: 1, minWidth: 110 }}>{catPie.slice(0, 6).map((d, i) => (<div key={i} className="flex justify-between items-center mb-2"><div className="flex items-center gap-2 fs-12"><span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} /><span className="text-muted">{d.name}</span></div><span className="font-mono fs-12 fw-bold">{fmt(d.value)}</span></div>))}</div>
            </div>
          </div>
        )}
        <div className="card">
          <div className="card-title">📉 Financial Trend</div>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={monthly}><XAxis dataKey="n" tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} /><YAxis hide /><Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, fontSize: 12 }} /><Line type="monotone" dataKey="inc" stroke="var(--green)" strokeWidth={2} dot={{ r: 3 }} name="Income" /><Line type="monotone" dataKey="exp" stroke="var(--red)" strokeWidth={2} dot={{ r: 3 }} name="Expenses" /><Legend wrapperStyle={{ fontSize: 11 }} /></LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stock Portfolio Summary */}
      {investments.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="flex justify-between items-center mb-3">
            <div className="card-title" style={{ marginBottom: 0 }}>📈 Top Stocks</div>
            <Link to="/portfolio" className="btn btn-secondary btn-sm">View All</Link>
          </div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Stock</th><th>Symbol</th><th style={{ textAlign: 'right' }}>Invested</th><th style={{ textAlign: 'right' }}>Value</th><th style={{ textAlign: 'right' }}>P&L</th><th style={{ textAlign: 'right' }}>Alloc%</th></tr></thead>
            <tbody>{investments.map((i, idx) => (<tr key={i.id}><td className="fw-600">{i.stockName}</td><td><span className="badge">{i.symbol || '—'}</span></td><td style={{ textAlign: 'right' }}><span className="amt">{fmt(i.totalInvested)}</span></td><td style={{ textAlign: 'right' }}><span className="amt">{fmt(i.currentValue)}</span></td><td style={{ textAlign: 'right' }}><span className={`amt ${i.profitLoss >= 0 ? 'amt-g' : 'amt-r'}`}>{i.profitLoss >= 0 ? '+' : ''}{fmt(i.profitLoss)}</span></td><td style={{ textAlign: 'right' }}><span style={{ background: PALETTE[idx % PALETTE.length] + '22', color: PALETTE[idx % PALETTE.length], padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{i.allocation}%</span></td></tr>))}</tbody>
          </table></div>
        </div>
      )}

      {/* Financial Goals Widget */}
      {goals.length > 0 && (() => {
        const GOAL_COLORS_MAP = { blue:'#4d9eff', green:'#22c55e', purple:'#a78bfa', orange:'#fb923c', pink:'#f472b6', teal:'#2dd4bf', yellow:'#fbbf24', red:'#f43f5e' };
        const activeGoals = goals.filter(g => {
          const t = parseFloat(g.targetAmount) || 0;
          const c = parseFloat(g.currentAmount) || 0;
          return t > 0 && c < t;
        }).sort((a, b) => ({ high:0, medium:1, low:2 }[a.priority] ?? 1) - ({ high:0, medium:1, low:2 }[b.priority] ?? 1)).slice(0, 4);
        if (activeGoals.length === 0) return null;
        return (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="flex justify-between items-center mb-3">
              <div className="card-title" style={{ marginBottom: 0 }}>🎯 Financial Goals</div>
              <Link to="/goals" className="btn btn-secondary btn-sm">View All</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 12 }}>
              {activeGoals.map(g => {
                const target = parseFloat(g.targetAmount) || 0;
                const current = parseFloat(g.currentAmount) || 0;
                const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                const remaining = Math.max(0, target - current);
                const colorHex = GOAL_COLORS_MAP[g.color] || '#4d9eff';
                const due = g.targetDate ? new Date(g.targetDate) : null;
                const daysLeft = due ? Math.round((due - new Date()) / (1000 * 60 * 60 * 24)) : null;
                const monthlyNeeded = daysLeft > 0 ? remaining / (daysLeft / 30.44) : null;
                return (
                  <div key={g.id} style={{ background: 'var(--bg3)', borderRadius: 12, padding: '12px 14px', borderLeft: `4px solid ${colorHex}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ fontSize: 22 }}>{g.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="fw-700 fs-13" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                        {daysLeft !== null && <div className="fs-11 text-muted">{daysLeft < 0 ? 'Overdue' : `${daysLeft}d left`}</div>}
                      </div>
                      <span className="fw-800 fs-12" style={{ color: colorHex }}>{pct.toFixed(0)}%</span>
                    </div>
                    <div style={{ background: 'var(--bg4)', borderRadius: 6, height: 6, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: colorHex, borderRadius: 6 }} />
                    </div>
                    <div className="flex justify-between fs-11">
                      <span className="text-muted">{fmt(current)} / {fmt(target)}</span>
                      {monthlyNeeded > 0 && <span style={{ color: colorHex, fontWeight: 700 }}>{fmt(monthlyNeeded)}/mo needed</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}