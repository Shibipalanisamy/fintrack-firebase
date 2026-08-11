import { useState, useEffect } from 'react';
import { incomeService, expenseService, investmentService } from '../utils/dbService';
import { fmt, MONTHS, PALETTE } from '../utils/helpers';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid,
} from 'recharts';
import toast from 'react-hot-toast';

// ─── Palette helpers ──────────────────────────────────────
const INCOME_PALETTE = [
  '#22c55e', '#16a34a', '#4ade80', '#86efac',
  '#6ee7b7', '#34d399', '#059669', '#10b981',
];

// ─── Category breakdown table (shared by income & expense) ─
function CategoryBreakdown({ data, colorFn, amtClass, emptyLabel }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length)
    return <div className="text-muted fs-13" style={{ padding: '18px 0', textAlign: 'center' }}>{emptyLabel}</div>;

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Category</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
            <th style={{ textAlign: 'right' }}>Share</th>
            <th style={{ minWidth: 120 }}>Bar</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => {
            const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0;
            return (
              <tr key={i}>
                <td>
                  <div className="flex items-center gap-2">
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%',
                      background: colorFn(i), flexShrink: 0,
                    }} />
                    <span className="fs-13 fw-600">{d.name}</span>
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`amt ${amtClass}`}>{fmt(d.value)}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className="font-mono fs-12 text-muted">{pct}%</span>
                </td>
                <td>
                  <div style={{
                    height: 7, borderRadius: 4,
                    background: 'var(--border)',
                    overflow: 'hidden',
                    minWidth: 80,
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: colorFn(i),
                      borderRadius: 4,
                      transition: 'width .4s ease',
                    }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="fw-700 text-muted fs-12" style={{ padding: '10px 14px' }}>TOTAL</td>
            <td style={{ textAlign: 'right', padding: '10px 14px' }}>
              <span className={`fw-800 ${amtClass}`}>{fmt(total)}</span>
            </td>
            <td style={{ textAlign: 'right', padding: '10px 14px' }}>
              <span className="font-mono fs-12 fw-700">100%</span>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Donut + legend side by side ──────────────────────────
function DonutWithLegend({ data, colorFn }) {
  if (!data.length) return null;
  return (
    <div className="flex" style={{ alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
      <ResponsiveContainer width={150} height={150}>
        <PieChart>
          <Pie
            data={data} cx="50%" cy="50%"
            innerRadius={42} outerRadius={70}
            dataKey="value" paddingAngle={2}
          >
            {data.map((_, i) => <Cell key={i} fill={colorFn(i)} />)}
          </Pie>
          <Tooltip formatter={v => fmt(v)} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ flex: 1, minWidth: 120 }}>
        {data.slice(0, 8).map((d, i) => (
          <div key={i} className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2 fs-12">
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: colorFn(i), flexShrink: 0,
              }} />
              <span className="text-muted">{d.name}</span>
            </div>
            <span className="font-mono fs-12 fw-bold">{fmt(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── NEW: Yearly Category Detail Component ─────────────────
function YearlyCategoryDetail({ expenses, year }) {
  const [expandedCategory, setExpandedCategory] = useState(null);
  
  // Group expenses by category
  const categoryData = {};
  expenses.forEach(exp => {
    if (!categoryData[exp.category]) {
      categoryData[exp.category] = {
        total: 0,
        months: Array(12).fill(0),
        transactions: Array(12).fill(0).map(() => [])
      };
    }
    const monthIdx = new Date(exp.date).getMonth();
    categoryData[exp.category].total += +exp.amount;
    categoryData[exp.category].months[monthIdx] += +exp.amount;
    categoryData[exp.category].transactions[monthIdx].push(exp);
  });

  // Sort by total amount
  const sortedCategories = Object.entries(categoryData)
    .sort((a, b) => b[1].total - a[1].total);

  if (sortedCategories.length === 0) {
    return <div className="text-muted fs-13" style={{ padding: '18px 0', textAlign: 'center' }}>No expense data for this year.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sortedCategories.map(([category, data], idx) => {
        const avgMonthly = data.total / 12;
        const monthsWithExpenses = data.months.filter(m => m > 0).length;
        const isExpanded = expandedCategory === category;

        return (
          <div 
            key={category} 
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--border2)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {/* Category Header */}
            <div 
              style={{
                padding: '16px 20px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: isExpanded ? 'var(--bg2)' : 'transparent',
                transition: 'background 0.2s',
              }}
              onClick={() => setExpandedCategory(isExpanded ? null : category)}
            >
              <div style={{ flex: 1 }}>
                <div className="flex items-center gap-3 mb-2">
                  <span style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: PALETTE[idx % PALETTE.length],
                    flexShrink: 0,
                  }} />
                  <span className="fs-15 fw-700">{category}</span>
                  <span className="fs-11 text-muted" style={{
                    background: 'var(--border)',
                    padding: '2px 8px',
                    borderRadius: 12,
                  }}>
                    {monthsWithExpenses} months active
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <span className="fs-11 text-muted">Yearly Total</span>
                    <div className="amt amt-r fw-800 fs-16">{fmt(data.total)}</div>
                  </div>
                  <div>
                    <span className="fs-11 text-muted">Avg/Month</span>
                    <div className="amt fs-14 fw-600" style={{ color: 'var(--t2)' }}>{fmt(avgMonthly)}</div>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 18, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                ▼
              </div>
            </div>

            {/* Expanded Monthly Breakdown */}
            {isExpanded && (
              <div style={{ padding: '0 20px 20px 20px' }}>
                <div className="tbl-wrap" style={{ marginTop: 12 }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th style={{ textAlign: 'right' }}>% of Total</th>
                        <th style={{ textAlign: 'center' }}>Transactions</th>
                        <th style={{ minWidth: 100 }}>Bar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MONTHS.map((monthName, monthIdx) => {
                        const amount = data.months[monthIdx];
                        const pct = data.total > 0 ? ((amount / data.total) * 100).toFixed(1) : 0;
                        const txCount = data.transactions[monthIdx].length;
                        
                        if (amount === 0) return null;

                        return (
                          <tr key={monthIdx}>
                            <td>
                              <span className="fs-13 fw-600">{monthName}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="amt amt-r">{fmt(amount)}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="font-mono fs-12 text-muted">{pct}%</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="fs-12" style={{
                                background: 'var(--border)',
                                padding: '2px 10px',
                                borderRadius: 12,
                                fontWeight: 600,
                              }}>
                                {txCount}
                              </span>
                            </td>
                            <td>
                              <div style={{
                                height: 7,
                                borderRadius: 4,
                                background: 'var(--border)',
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  height: '100%',
                                  width: `${pct}%`,
                                  background: PALETTE[idx % PALETTE.length],
                                  borderRadius: 4,
                                  transition: 'width .4s ease',
                                }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── NEW: Overspending Analysis Component ─────────────────
function OverspendingAnalysis({ expenses, year }) {
  const [budgetLimits, setBudgetLimits] = useState({});
  const [showBudgetInput, setShowBudgetInput] = useState(false);

  // Calculate category monthly averages and detect spikes
  const categoryAnalysis = {};
  expenses.forEach(exp => {
    if (!categoryAnalysis[exp.category]) {
      categoryAnalysis[exp.category] = {
        months: Array(12).fill(0),
        total: 0,
      };
    }
    const monthIdx = new Date(exp.date).getMonth();
    categoryAnalysis[exp.category].months[monthIdx] += +exp.amount;
    categoryAnalysis[exp.category].total += +exp.amount;
  });

  // Analyze overspending
  const overspendingData = [];
  Object.entries(categoryAnalysis).forEach(([category, data]) => {
    const monthlyAmounts = data.months.filter(m => m > 0);
    if (monthlyAmounts.length === 0) return;

    const avg = monthlyAmounts.reduce((s, v) => s + v, 0) / monthlyAmounts.length;
    const budgetLimit = budgetLimits[category] || avg * 1.5; // Default: 150% of average

    // Find months exceeding budget
    const spikes = [];
    data.months.forEach((amount, monthIdx) => {
      if (amount > budgetLimit) {
        spikes.push({
          month: MONTHS[monthIdx],
          monthIdx,
          amount,
          excess: amount - budgetLimit,
          percentOver: ((amount / budgetLimit - 1) * 100).toFixed(0),
        });
      }
    });

    if (spikes.length > 0) {
      overspendingData.push({
        category,
        avg,
        budgetLimit,
        totalExcess: spikes.reduce((s, sp) => s + sp.excess, 0),
        spikes,
        yearlyTotal: data.total,
      });
    }
  });

  // Sort by total excess
  overspendingData.sort((a, b) => b.totalExcess - a.totalExcess);

  // Calculate trend for each category (increasing/decreasing)
  const getTrend = (category) => {
    const months = categoryAnalysis[category]?.months || [];
    const firstHalf = months.slice(0, 6).reduce((s, v) => s + v, 0) / 6;
    const secondHalf = months.slice(6, 12).reduce((s, v) => s + v, 0) / 6;
    const change = ((secondHalf - firstHalf) / (firstHalf || 1)) * 100;
    
    if (Math.abs(change) < 5) return { label: 'Stable', icon: '➡️', color: 'var(--t3)' };
    if (change > 0) return { label: `+${change.toFixed(0)}%`, icon: '📈', color: 'var(--red)' };
    return { label: `${change.toFixed(0)}%`, icon: '📉', color: 'var(--green)' };
  };

  return (
    <div>
      {/* Header with Budget Setting */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="fs-13 text-muted" style={{ marginBottom: 4 }}>
            Tracking {Object.keys(categoryAnalysis).length} categories for spending patterns
          </div>
          {overspendingData.length > 0 && (
            <div className="fs-12" style={{ color: 'var(--red)', fontWeight: 600 }}>
              ⚠️ {overspendingData.length} categories with overspending detected
            </div>
          )}
        </div>
        <button
          onClick={() => setShowBudgetInput(!showBudgetInput)}
          style={{
            padding: '8px 16px',
            background: 'var(--bg3)',
            border: '1px solid var(--border2)',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {showBudgetInput ? '✕ Close' : '⚙️ Set Budget Limits'}
        </button>
      </div>

      {/* Budget Input Section */}
      {showBudgetInput && (
        <div style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border2)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
        }}>
          <div className="fs-14 fw-700" style={{ marginBottom: 12 }}>Monthly Budget Limits by Category</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
            {Object.keys(categoryAnalysis).map(category => (
              <div key={category} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="fs-12 fw-600" style={{ flex: 1 }}>{category}</label>
                <input
                  type="number"
                  placeholder="Auto"
                  value={budgetLimits[category] || ''}
                  onChange={(e) => setBudgetLimits({ ...budgetLimits, [category]: +e.target.value })}
                  style={{
                    width: 100,
                    padding: '6px 10px',
                    fontSize: 12,
                    border: '1px solid var(--border2)',
                    borderRadius: 6,
                    background: 'var(--bg)',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overspending Alerts */}
      {overspendingData.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: 'center',
          background: 'var(--bg3)',
          borderRadius: 12,
          border: '1px solid var(--border2)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
          <div className="fw-700 fs-15" style={{ marginBottom: 4 }}>No Overspending Detected!</div>
          <div className="fs-12 text-muted">All categories are within budget limits</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {overspendingData.map((item, idx) => {
            const trend = getTrend(item.category);
            return (
              <div
                key={item.category}
                style={{
                  background: 'var(--bg3)',
                  border: '2px solid var(--red)',
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                {/* Category Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ fontSize: 20 }}>⚠️</span>
                      <span className="fs-16 fw-800">{item.category}</span>
                      <span style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        borderRadius: 12,
                        background: 'var(--red)',
                        color: 'white',
                        fontWeight: 700,
                      }}>
                        {item.spikes.length} months over budget
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      <div>
                        <span className="fs-11 text-muted">Budget Limit</span>
                        <div className="amt fs-13 fw-700">{fmt(item.budgetLimit)}</div>
                      </div>
                      <div>
                        <span className="fs-11 text-muted">Avg Monthly</span>
                        <div className="amt fs-13 fw-600">{fmt(item.avg)}</div>
                      </div>
                      <div>
                        <span className="fs-11 text-muted">Total Excess</span>
                        <div className="amt amt-r fs-14 fw-800">{fmt(item.totalExcess)}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="fs-11 text-muted">Trend</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: trend.color }}>
                      {trend.icon} {trend.label}
                    </div>
                  </div>
                </div>

                {/* Spike Timeline */}
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th style={{ textAlign: 'right' }}>Spent</th>
                        <th style={{ textAlign: 'right' }}>Over Budget</th>
                        <th style={{ textAlign: 'right' }}>% Over</th>
                        <th style={{ minWidth: 100 }}>Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.spikes.map((spike, si) => {
                        const severity = +spike.percentOver;
                        const severityLabel = severity > 100 ? '🔴 Critical' : severity > 50 ? '🟠 High' : '🟡 Moderate';
                        
                        return (
                          <tr key={si}>
                            <td>
                              <span className="fs-13 fw-600">{spike.month}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="amt amt-r fw-700">{fmt(spike.amount)}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="amt amt-r fw-600">{fmt(spike.excess)}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="font-mono fs-12 fw-700" style={{ color: 'var(--red)' }}>
                                +{spike.percentOver}%
                              </span>
                            </td>
                            <td>
                              <span className="fs-12 fw-600">{severityLabel}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mini chart showing the category's monthly spending */}
                <div style={{ marginTop: 16, height: 120 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={MONTHS.map((m, idx) => ({
                        month: m.slice(0, 3),
                        amount: categoryAnalysis[item.category].months[idx],
                        budget: item.budgetLimit,
                      }))}
                      margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--t3)' }} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 11 }}
                        formatter={v => fmt(v)}
                      />
                      <Line type="monotone" dataKey="budget" stroke="var(--t3)" strokeDasharray="5 5" strokeWidth={1.5} dot={false} name="Budget" />
                      <Line type="monotone" dataKey="amount" stroke="var(--red)" strokeWidth={2.5} dot={{ r: 3 }} name="Spent" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function ReportsPage() {
  const now = new Date();
  const [year, setYear]       = useState(now.getFullYear());
  const [monthly, setMonthly] = useState([]);
  const [expCatData, setExpCatData] = useState([]);
  const [incCatData, setIncCatData] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]); // Store all expenses for detailed views
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'expense' | 'yearly-detail' | 'analysis' | 'income' | 'compare'
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  useEffect(() => { load(); }, [year]);

  const load = async () => {
    setLoading(true);
    try {
      const [incomes, expenses, allInvestments] = await Promise.all([
        incomeService.getAll({ year }),
        expenseService.getAll({ year }),
        investmentService.getAll(),
      ]);

      setAllExpenses(expenses); // Store for detailed analysis

      // ── Investments filtered to selected year ──
      const investments = allInvestments.filter(i => {
        return new Date(i.purchaseDate).getFullYear() === year;
      });

      // ── Monthly maps ──
      const imap = {}, emap = {}, invmap = {};
      incomes.forEach(i => { const m = new Date(i.date).getMonth(); imap[m] = (imap[m] || 0) + +i.amount; });
      expenses.forEach(e => { const m = new Date(e.date).getMonth(); emap[m] = (emap[m] || 0) + +e.amount; });
      investments.forEach(inv => {
        const m = new Date(inv.purchaseDate).getMonth();
        const cost = ((+inv.quantity || 0) * (+inv.purchasePrice || 0)) + (+inv.brokerage || 0);
        invmap[m] = (invmap[m] || 0) + cost;
      });

      setMonthly(MONTHS.map((n, i) => ({
        n,
        inc:     imap[i]   || 0,
        exp:     emap[i]   || 0,
        inv:     invmap[i] || 0,
        savings: (imap[i] || 0) - (emap[i] || 0) - (invmap[i] || 0),
      })));

      // ── Expense category totals ──
      const expCatMap = {};
      expenses.forEach(e => {
        expCatMap[e.category] = (expCatMap[e.category] || 0) + +e.amount;
      });
      setExpCatData(
        Object.entries(expCatMap)
          .sort((a, b) => b[1] - a[1])
          .map(([name, value], i) => ({ name, value, color: PALETTE[i % PALETTE.length] }))
      );

      // ── Income category totals ──
      const incCatMap = {};
      incomes.forEach(i => {
        incCatMap[i.category] = (incCatMap[i.category] || 0) + +i.amount;
      });
      setIncCatData(
        Object.entries(incCatMap)
          .sort((a, b) => b[1] - a[1])
          .map(([name, value]) => ({ name, value }))
      );
    } catch (err) {
      toast.error('Failed to load report data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Derived data ─────────────────────────────────────────
  const totalInc = monthly.reduce((s, m) => s + m.inc, 0);
  const totalExp = monthly.reduce((s, m) => s + m.exp, 0);
  const totalInv = monthly.reduce((s, m) => s + m.inv, 0);
  const totalSav = monthly.reduce((s, m) => s + m.savings, 0);
  const netBalance = totalInc - totalExp;

  const expColorFn = i => PALETTE[i % PALETTE.length];
  const incColorFn = i => INCOME_PALETTE[i % INCOME_PALETTE.length];

  // For comparison tab
  const compareCatData = (() => {
    const allCats = new Set([
      ...expCatData.map(d => d.name),
      ...incCatData.map(d => d.name),
    ]);
    return Array.from(allCats).map(cat => ({
      name: cat,
      Expenses: expCatData.find(d => d.name === cat)?.value || 0,
      Income: incCatData.find(d => d.name === cat)?.value || 0,
    }))
      .sort((a, b) => (b.Income + b.Expenses) - (a.Income + a.Expenses))
      .slice(0, 12);
  })();

  if (loading) return <div className="page-loading">Loading reports...</div>;

  // ─── Tab buttons ──────────────────────────────────────────
  const tabs = [
    { id: 'overview', label: '📊 Overview', icon: '📊' },
    { id: 'expense', label: '💸 Expense Breakdown', icon: '💸' },
    { id: 'yearly-detail', label: '📅 Yearly Category Detail', icon: '📅' },
    { id: 'analysis', label: '🔍 Overspending Analysis', icon: '🔍' },
    { id: 'income', label: '💵 Income Breakdown', icon: '💵' },
    { id: 'compare', label: '⚖️ Compare', icon: '⚖️' },
  ];

  return (
    <div className="page">
      {/* ═════ Page Header ════════════════════════════════════ */}
      <div className="page-hdr">
        <h1 className="page-title">📊 Financial Reports — {year}</h1>
        <div className="page-sub">Comprehensive analysis of income, expenses & savings</div>
      </div>

      {/* ═════ Year Selector ══════════════════════════════════ */}
      <div className="flex justify-center mb-5">
        <div className="btn-grp">
          {years.map(y => (
            <button
              key={y}
              className={year === y ? 'active' : ''}
              onClick={() => setYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* ═════ Tab Navigation ═════════════════════════════════ */}
      <div className="flex justify-center mb-4" style={{ overflowX: 'auto' }}>
        <div className="btn-grp" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
              style={{ fontSize: 13, padding: '8px 16px' }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: OVERVIEW                                       */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="charts">
          {/* ── Summary KPIs ── */}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">💰 Financial Summary — {year}</div>
            <div className="kpi-row">
              {[
                { lbl: 'Total Income',      v: fmt(totalInc), c: 'amt-g', icon: '💵' },
                { lbl: 'Total Expenses',    v: fmt(totalExp), c: 'amt-r', icon: '💸' },
                { lbl: 'Total Investments', v: fmt(totalInv), c: '', icon: '📈', style: { color: '#a78bfa' } },
                { lbl: 'Net Savings',       v: fmt(totalSav), c: totalSav >= 0 ? 'amt-g' : 'amt-r', icon: totalSav >= 0 ? '✅' : '⚠️' },
              ].map((k, i) => (
                <div key={i} className="kpi">
                  <div className="kpi-icon">{k.icon}</div>
                  <div className={`kpi-amt ${k.c}`} style={k.style}>{k.v}</div>
                  <div className="kpi-lbl">{k.lbl}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Monthly Trend Chart ── */}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">📈 Monthly Cash Flow — {year}</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="n" tick={{ fontSize: 11, fill: 'var(--t3)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, fontSize: 12 }}
                  formatter={v => fmt(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="inc"     fill="var(--green)" name="Income"      radius={[4,4,0,0]} maxBarSize={40} />
                <Bar dataKey="exp"     fill="var(--red)"   name="Expenses"    radius={[4,4,0,0]} maxBarSize={40} />
                <Bar dataKey="inv"     fill="#a78bfa"      name="Investments" radius={[4,4,0,0]} maxBarSize={40} />
                <Bar dataKey="savings" fill="var(--blue)"  name="Savings"     radius={[4,4,0,0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Monthly table ── */}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">📅 Monthly Breakdown — {year}</div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th style={{ textAlign: 'right' }}>Income</th>
                    <th style={{ textAlign: 'right' }}>Expenses</th>
                    <th style={{ textAlign: 'right' }}>Investments</th>
                    <th style={{ textAlign: 'right' }}>Net Balance</th>
                    <th style={{ textAlign: 'right' }}>Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m, i) => (
                    <tr key={i}>
                      <td><span className="fs-13 fw-600">{m.n}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="amt amt-g">{m.inc > 0 ? fmt(m.inc) : <span className="text-muted">—</span>}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="amt amt-r">{m.exp > 0 ? fmt(m.exp) : <span className="text-muted">—</span>}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="amt" style={{ color: '#a78bfa' }}>
                          {m.inv > 0 ? fmt(m.inv) : <span className="text-muted">—</span>}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {/* Net Balance = Income − Expenses */}
                        <span className={`amt ${(m.inc - m.exp) >= 0 ? 'amt-g' : 'amt-r'}`}>
                          {fmt(m.inc - m.exp)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`amt ${m.savings >= 0 ? 'amt-g' : 'amt-r'}`}>{fmt(m.savings)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="fw-700 text-muted fs-12" style={{ padding: '8px 14px' }}>TOTAL</td>
                    <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="amt-g fw-800">{fmt(totalInc)}</span></td>
                    <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="amt-r fw-800">{fmt(totalExp)}</span></td>
                    <td style={{ textAlign: 'right', padding: '8px 14px' }}><span className="fw-800" style={{ color: '#a78bfa' }}>{fmt(totalInv)}</span></td>
                    <td style={{ textAlign: 'right', padding: '8px 14px' }}>
                      <span className={`fw-800 ${netBalance >= 0 ? 'amt-g' : 'amt-r'}`}>{fmt(netBalance)}</span>
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 14px' }}>
                      <span className={`fw-800 ${totalSav >= 0 ? 'amt-g' : 'amt-r'}`}>{fmt(totalSav)}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: EXPENSE BREAKDOWN                              */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'expense' && (
        <div className="charts">
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">🗂️ Expense Category Breakdown — {year}</div>
            <div className="page-sub" style={{ marginBottom: 16 }}>
              {expCatData.length} categories &nbsp;•&nbsp; Total:&nbsp;
              <span className="amt amt-r fw-700">{fmt(totalExp)}</span>
            </div>
            <DonutWithLegend data={expCatData} colorFn={expColorFn} />
            <CategoryBreakdown
              data={expCatData}
              colorFn={expColorFn}
              amtClass="amt-r"
              emptyLabel="No expense data for this year."
            />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: YEARLY CATEGORY DETAIL - NEW!                  */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'yearly-detail' && (
        <div className="charts">
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">📅 Yearly Category Detail — {year}</div>
            <div className="page-sub" style={{ marginBottom: 20 }}>
              View total yearly spending and monthly breakdown for each category
            </div>
            <YearlyCategoryDetail expenses={allExpenses} year={year} />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: OVERSPENDING ANALYSIS - NEW!                   */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'analysis' && (
        <div className="charts">
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">🔍 Overspending Analysis — {year}</div>
            <div className="page-sub" style={{ marginBottom: 20 }}>
              Track categories and timelines where spending exceeds budget limits
            </div>
            <OverspendingAnalysis expenses={allExpenses} year={year} />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: INCOME BREAKDOWN                               */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'income' && (
        <div className="charts">
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">💵 Income Category Breakdown — {year}</div>
            <div className="page-sub" style={{ marginBottom: 16 }}>
              {incCatData.length} categories &nbsp;•&nbsp; Total:&nbsp;
              <span className="amt amt-g fw-700">{fmt(totalInc)}</span>
            </div>
            <DonutWithLegend data={incCatData} colorFn={incColorFn} />
            <CategoryBreakdown
              data={incCatData}
              colorFn={incColorFn}
              amtClass="amt-g"
              emptyLabel="No income data for this year."
            />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: COMPARISON                                     */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'compare' && (
        <div className="charts">

          {/* ── Net Balance Summary card ── */}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">⚖️ Income vs Expense — {year}</div>

            {/* Progress bar comparison */}
            <div style={{ marginBottom: 20 }}>
              {(() => {
                const grand = totalInc + totalExp;
                const incPct = grand > 0 ? (totalInc / grand) * 100 : 50;
                const expPct = 100 - incPct;
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      <span style={{ color: 'var(--green)' }}>💵 Income {incPct.toFixed(1)}%</span>
                      <span style={{ color: 'var(--red)' }}>💸 Expense {expPct.toFixed(1)}%</span>
                    </div>
                    <div style={{ display: 'flex', height: 14, borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${incPct}%`, background: 'var(--green)', transition: 'width .5s ease' }} />
                      <div style={{ width: `${expPct}%`, background: 'var(--red)', transition: 'width .5s ease' }} />
                    </div>
                  </>
                );
              })()}
            </div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total Income',   val: fmt(totalInc), c: 'var(--green)', icon: '💵' },
                { label: 'Total Expenses', val: fmt(totalExp), c: 'var(--red)',   icon: '💸' },
                {
                  label: 'Net Balance',
                  val: fmt(netBalance),
                  c: netBalance >= 0 ? 'var(--green)' : 'var(--red)',
                  icon: netBalance >= 0 ? '✅' : '⚠️',
                  note: netBalance >= 0 ? 'You are in surplus' : 'You are in deficit',
                },
              ].map((k, i) => (
                <div key={i} style={{
                  background: 'var(--bg3)', borderRadius: 12,
                  padding: '14px 16px',
                  border: `1px solid var(--border2)`,
                }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{k.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: k.c, fontFamily: 'monospace' }}>{k.val}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>{k.label}</div>
                  {k.note && <div style={{ fontSize: 11, color: k.c, fontWeight: 700, marginTop: 4 }}>{k.note}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* ── Side-by-side category comparison bar chart ── */}
          {compareCatData.length > 0 && (
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-title">📊 Category-wise Comparison (top 12)</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={compareCatData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--t3)' }} width={130} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, fontSize: 12 }}
                    formatter={v => fmt(v)}
                  />
                  <Bar dataKey="Income"   fill="var(--green)" name="Income"   radius={[0,4,4,0]} maxBarSize={12} />
                  <Bar dataKey="Expenses" fill="var(--red)"   name="Expenses" radius={[0,4,4,0]} maxBarSize={12} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Side-by-side category tables ── */}
          <div className="card">
            <div className="card-title">🗂️ Expense by Category</div>
            <CategoryBreakdown
              data={expCatData}
              colorFn={expColorFn}
              amtClass="amt-r"
              emptyLabel="No expense data for this year."
            />
          </div>

          <div className="card">
            <div className="card-title">💵 Income by Category</div>
            <CategoryBreakdown
              data={incCatData}
              colorFn={incColorFn}
              amtClass="amt-g"
              emptyLabel="No income data for this year."
            />
          </div>

        </div>
      )}
    </div>
  );
}