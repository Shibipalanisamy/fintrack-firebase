// Extracted from PortfolioPage.js so it can be code-split — this tab's
// 52W/30D price calculations only run once someone actually clicks the
// "52W" tab, and now the code for it isn't even downloaded/parsed until
// then either (previously it was bundled into PortfolioPage.js as a whole,
// even though the computation itself was already gated behind the tab).
import { useState } from 'react';
import { fmt } from '../utils/helpers';

function PriceAnalysisTab({ items }) {
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState(new Set());

  const stockMap = {};
  items.forEach(i => {
    const sym = i.symbol || i.stockName;
    if (!stockMap[sym]) stockMap[sym] = { symbol: i.symbol, name: i.stockName, prices: [], quantities: 0, currentPrice: 0 };
    stockMap[sym].prices.push({ price: i.purchasePrice, date: new Date(i.purchaseDate) });
    stockMap[sym].quantities += i.quantity;
    if (i.currentPrice > stockMap[sym].currentPrice) stockMap[sym].currentPrice = i.currentPrice;
  });
  const now = new Date();
  const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
  const allRows = Object.entries(stockMap).map(([sym, d]) => {
    const yearPrices = d.prices.filter(p => p.date >= oneYearAgo).map(p => p.price);
    const month30Prices = d.prices.filter(p => p.date >= thirtyDaysAgo).map(p => p.price);
    const allPrices = d.prices.map(p => p.price);
    const w52High = yearPrices.length > 0 ? Math.max(...yearPrices) : null;
    const w52Low = yearPrices.length > 0 ? Math.min(...yearPrices) : null;
    const d30High = month30Prices.length > 0 ? Math.max(...month30Prices) : null;
    const d30Low = month30Prices.length > 0 ? Math.min(...month30Prices) : null;
    const avgBuy = allPrices.reduce((s, p) => s + p, 0) / allPrices.length;
    const cur = d.currentPrice || avgBuy;
    return { sym, name: d.name, qty: d.quantities, avgBuy, cur, w52High, w52Low, d30High, d30Low, pctFromLow: w52Low ? (((cur - w52Low) / w52Low) * 100).toFixed(1) : null, pctFromHigh: w52High ? (((cur - w52High) / w52High) * 100).toFixed(1) : null, buyCount: d.prices.length };
  });

  // Filter by search
  const searchFiltered = allRows.filter(r => !search || r.sym.toLowerCase().includes(search.toLowerCase()) || r.name.toLowerCase().includes(search.toLowerCase()));
  // If any checked, show only checked; else show all search results
  const rows = checked.size > 0 ? searchFiltered.filter(r => checked.has(r.sym)) : searchFiltered;

  const toggleCheck = sym => setChecked(s => { const n = new Set(s); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });
  const clearChecked = () => setChecked(new Set());

  if (items.length === 0) return <div className="card"><div className="empty"><div className="empty-icon">📊</div><div className="empty-title">No data</div></div></div>;

  return (
    <div>
      {/* Search + checkbox filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 12px', flex: 1, minWidth: 200 }}>
          <span>🔍</span>
          <input style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, flex: 1 }} placeholder="Search symbol or name..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}>✕</button>}
        </div>
        {checked.size > 0 && <button className="btn btn-secondary btn-sm" onClick={clearChecked}>✕ Clear {checked.size} selected</button>}
        <span className="fs-12 text-muted">{rows.length} of {allRows.length} stocks</span>
      </div>

      {/* Stock checkbox chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {searchFiltered.map(r => (
          <button key={r.sym} type="button" onClick={() => toggleCheck(r.sym)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${checked.has(r.sym) ? 'var(--blue)' : 'var(--border2)'}`, background: checked.has(r.sym) ? 'rgba(77,158,255,.15)' : 'var(--bg3)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: checked.has(r.sym) ? 'var(--blue)' : 'var(--t2)', fontFamily: 'monospace' }}>
            <span style={{ width: 13, height: 13, borderRadius: 3, border: `2px solid ${checked.has(r.sym) ? 'var(--blue)' : 'var(--border2)'}`, background: checked.has(r.sym) ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {checked.has(r.sym) && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
            </span>
            {r.sym}
          </button>
        ))}
      </div>

      <div style={{ background: 'rgba(77,158,255,.06)', border: '1px solid rgba(77,158,255,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12 }}>
        ℹ️ 52W and 30D High/Low are calculated from your actual <strong>buy price history</strong> in this app. Update current price (✏️) on Holdings tab for accurate P&L.
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Symbol</th><th>Name</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Avg Buy</th><th style={{ textAlign: 'right' }}>Current</th><th style={{ textAlign: 'center', background: 'rgba(34,197,94,.08)' }}>52W High</th><th style={{ textAlign: 'center', background: 'rgba(244,63,94,.08)' }}>52W Low</th><th style={{ textAlign: 'center', background: 'rgba(251,191,36,.08)' }}>30D High</th><th style={{ textAlign: 'center', background: 'rgba(251,191,36,.08)' }}>30D Low</th><th style={{ textAlign: 'center' }}>vs 52W Low</th><th style={{ textAlign: 'center' }}>vs 52W High</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.sym}>
              <td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, background: 'var(--bg3)', padding: '3px 8px', borderRadius: 6, color: 'var(--blue)' }}>{r.sym}</span></td>
              <td className="fw-600 fs-12">{r.name}</td>
              <td style={{ textAlign: 'right' }} className="font-mono fs-12">{r.qty}</td>
              <td style={{ textAlign: 'right' }} className="font-mono fs-12">{fmt(r.avgBuy)}</td>
              <td style={{ textAlign: 'right' }}><span className={`font-mono fs-12 fw-700 ${r.cur > r.avgBuy ? 'amt-g' : 'amt-r'}`}>{fmt(r.cur)}</span></td>
              <td style={{ textAlign: 'center', background: 'rgba(34,197,94,.04)' }}>{r.w52High !== null ? <span className="fw-700 fs-12 amt-g">{fmt(r.w52High)}</span> : <span className="text-muted fs-11">—</span>}</td>
              <td style={{ textAlign: 'center', background: 'rgba(244,63,94,.04)' }}>{r.w52Low !== null ? <span className="fw-700 fs-12 amt-r">{fmt(r.w52Low)}</span> : <span className="text-muted fs-11">—</span>}</td>
              <td style={{ textAlign: 'center', background: 'rgba(251,191,36,.04)' }}>{r.d30High !== null ? <span className="fw-700 fs-12" style={{ color: '#f59e0b' }}>{fmt(r.d30High)}</span> : <span className="text-muted fs-11">—</span>}</td>
              <td style={{ textAlign: 'center', background: 'rgba(251,191,36,.04)' }}>{r.d30Low !== null ? <span className="fw-700 fs-12" style={{ color: '#d97706' }}>{fmt(r.d30Low)}</span> : <span className="text-muted fs-11">—</span>}</td>
              <td style={{ textAlign: 'center' }}>{r.pctFromLow !== null ? <span style={{ background: parseFloat(r.pctFromLow) >= 0 ? 'rgba(34,197,94,.15)' : 'rgba(244,63,94,.15)', color: parseFloat(r.pctFromLow) >= 0 ? 'var(--green)' : 'var(--red)', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{r.pctFromLow >= 0 ? '+' : ''}{r.pctFromLow}%</span> : '—'}</td>
              <td style={{ textAlign: 'center' }}>{r.pctFromHigh !== null ? <span style={{ background: parseFloat(r.pctFromHigh) >= 0 ? 'rgba(34,197,94,.15)' : 'rgba(244,63,94,.15)', color: parseFloat(r.pctFromHigh) >= 0 ? 'var(--green)' : 'var(--red)', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{parseFloat(r.pctFromHigh) >= 0 ? '+' : ''}{r.pctFromHigh}%</span> : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">📊 Buy Price Range Visual</div>
        <div style={{ display: 'grid', gap: 14 }}>
          {rows.filter(r => r.w52Low !== null && r.w52High !== null && r.w52Low !== r.w52High).map(r => {
            const range = r.w52High - r.w52Low;
            const curPct = Math.min(100, Math.max(0, ((r.cur - r.w52Low) / range) * 100));
            const avgPct = Math.min(100, Math.max(0, ((r.avgBuy - r.w52Low) / range) * 100));
            return (
              <div key={r.sym}>
                <div className="flex justify-between mb-1"><span className="fs-13 fw-700">{r.sym} <span className="text-muted fs-11 fw-400">{r.name}</span></span><span className="fs-12 text-muted">{fmt(r.w52Low)} — {fmt(r.w52High)}</span></div>
                <div style={{ position: 'relative', height: 20, background: 'linear-gradient(to right, rgba(244,63,94,.2), rgba(34,197,94,.2))', borderRadius: 10 }}>
                  <div style={{ position: 'absolute', left: `${curPct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: 'var(--blue)', border: '2px solid #fff', zIndex: 2 }} />
                  <div style={{ position: 'absolute', left: `${avgPct}%`, top: 0, bottom: 0, width: 2, background: '#fbbf24', zIndex: 1 }} />
                </div>
                <div className="flex justify-between fs-10 text-muted mt-1"><span>52W Low: {fmt(r.w52Low)}</span><span>🔵 Current · 🟡 Avg Buy</span><span>52W High: {fmt(r.w52High)}</span></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default PriceAnalysisTab;