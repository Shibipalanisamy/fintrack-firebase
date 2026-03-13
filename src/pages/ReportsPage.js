import { useState, useEffect } from 'react';
import { incomeService, expenseService } from '../utils/dbService';
import { fmt, MONTHS, PALETTE } from '../utils/helpers';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import toast from 'react-hot-toast';

export default function ReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthly, setMonthly] = useState([]);
  const [catData, setCatData] = useState([]);
  const [loading, setLoading] = useState(true);
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  useEffect(() => { load(); }, [year]);

  const load = async () => {
    setLoading(true);
    try {
      const [incomes, expenses] = await Promise.all([incomeService.getAll({ year }), expenseService.getAll({ year })]);
      const imap = {}, emap = {};
      incomes.forEach(i => { const m = new Date(i.date).getMonth(); imap[m] = (imap[m] || 0) + +i.amount; });
      expenses.forEach(e => { const m = new Date(e.date).getMonth(); emap[m] = (emap[m] || 0) + +e.amount; });
      setMonthly(MONTHS.map((n, i) => ({ n, inc: imap[i] || 0, exp: emap[i] || 0, savings: (imap[i] || 0) - (emap[i] || 0) })));
      const catMap = {};
      expenses.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + +e.amount; });
      setCatData(Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: PALETTE[i] })));
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const totalInc = monthly.reduce((s, m) => s + m.inc, 0);
  const totalExp = monthly.reduce((s, m) => s + m.exp, 0);
  const totalSav = totalInc - totalExp;
  const savingsRate = totalInc > 0 ? ((totalSav / totalInc) * 100).toFixed(1) : 0;

  if (loading) return <div className="spin-center"><div className="spin spin-lg" /></div>;

  return (
    <div>
      <div className="page-head">
        <div><div className="page-title">📉 Reports</div><div className="page-sub">Annual financial summary</div></div>
        <select className="fs" value={year} onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="stats">
        {[
          { icon: '💵', label: 'Total Income', val: fmt(totalInc), c: 'var(--green)' },
          { icon: '💸', label: 'Total Expenses', val: fmt(totalExp), c: 'var(--red)' },
          { icon: '🏦', label: 'Net Savings', val: fmt(totalSav), c: totalSav >= 0 ? 'var(--green)' : 'var(--red)' },
          { icon: '📊', label: 'Savings Rate', val: `${savingsRate}%`, c: 'var(--blue)' },
        ].map((s, i) => (
          <div key={i} className="stat" style={{ '--c': s.c }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-val" style={{ color: s.c }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="charts">
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">📊 Monthly Summary — {year}</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly}><XAxis dataKey="n" tick={{ fontSize: 11, fill: 'var(--t3)' }} tickLine={false} axisLine={false} /><YAxis hide /><Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, fontSize: 12 }} formatter={v => fmt(v)} /><Bar dataKey="inc" fill="var(--green)" name="Income" radius={[3,3,0,0]} maxBarSize={16} /><Bar dataKey="exp" fill="var(--red)" name="Expenses" radius={[3,3,0,0]} maxBarSize={16} /><Bar dataKey="savings" fill="var(--blue)" name="Savings" radius={[3,3,0,0]} maxBarSize={16} /><Legend wrapperStyle={{ fontSize: 12 }} /></BarChart>
          </ResponsiveContainer>
        </div>
        {catData.length > 0 && (
          <div className="card">
            <div className="card-title">🗂️ Expense Breakdown</div>
            <div className="flex" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <ResponsiveContainer width={160} height={160}><PieChart><Pie data={catData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>{catData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip formatter={v => fmt(v)} /></PieChart></ResponsiveContainer>
              <div style={{ flex: 1, minWidth: 120 }}>{catData.slice(0, 8).map((d, i) => (<div key={i} className="flex justify-between items-center mb-2"><div className="flex items-center gap-2 fs-12"><span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} /><span className="text-muted">{d.name}</span></div><span className="font-mono fs-12 fw-bold">{fmt(d.value)}</span></div>))}</div>
            </div>
          </div>
        )}
        <div className="card">
          <div className="card-title">📋 Monthly Breakdown</div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Month</th><th style={{ textAlign: 'right' }}>Income</th><th style={{ textAlign: 'right' }}>Expenses</th><th style={{ textAlign: 'right' }}>Savings</th></tr></thead>
            <tbody>{monthly.filter(m => m.inc > 0 || m.exp > 0).map((m, i) => (<tr key={i}><td className="fw-600">{m.n}</td><td style={{ textAlign: 'right' }}><span className="amt amt-g">{fmt(m.inc)}</span></td><td style={{ textAlign: 'right' }}><span className="amt amt-r">{fmt(m.exp)}</span></td><td style={{ textAlign: 'right' }}><span className={`amt ${m.savings >= 0 ? 'amt-g' : 'amt-r'}`}>{fmt(m.savings)}</span></td></tr>))}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
