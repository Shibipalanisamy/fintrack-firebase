import { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { fmt, fmtDate } from '../utils/helpers';
import { db, auth } from '../utils/firebase';
import {
  collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, deleteDoc, writeBatch,
} from 'firebase/firestore';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, ReferenceLine, Cell,
} from 'recharts';

// ─── pdf.js ────────────────────────────────────────────────
const PDFJS_CDN    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
function loadPdfJs() {
  return new Promise((res, rej) => {
    if (window.pdfjsLib) { res(window.pdfjsLib); return; }
    const s = document.createElement('script');
    s.src = PDFJS_CDN;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; res(window.pdfjsLib); };
    s.onerror = () => rej(new Error('pdf.js load failed'));
    document.head.appendChild(s);
  });
}

// ─── Helpers ───────────────────────────────────────────────
const parseNum = s => parseFloat(String(s || '').replace(/,/g, '')) || 0;
const MONTH_MAP = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const COLORS = ['#667eea','#43e97b','#f59e0b','#f87171','#a78bfa','#38bdf8','#fb923c','#34d399','#e879f9','#22d3ee'];

function monthYearToDate(mon, yr) {
  const m = MONTH_MAP[mon.toLowerCase().slice(0,3)];
  if (m === undefined) return null;
  const y = parseInt(yr);
  const last = new Date(y, m+1, 0).getDate();
  return `${y}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
}
function shortLabel(dateStr) {
  const d = new Date(dateStr);
  return isNaN(d) ? dateStr : `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}
function shortNum(n) {
  const a = Math.abs(n);
  if (a>=1e7) return (n/1e7).toFixed(1)+'Cr';
  if (a>=1e5) return (n/1e5).toFixed(1)+'L';
  if (a>=1e3) return (n/1e3).toFixed(0)+'K';
  return String(Math.round(n));
}
function parseECASDate(s) {
  if (!s) return null;
  const parts = s.split(/[-\/]/);
  if (parts.length !== 3) return null;
  if (/[a-zA-Z]/.test(parts[1])) {
    const m = MONTH_MAP[parts[1].toLowerCase().slice(0,3)];
    if (m===undefined) return null;
    return new Date(parseInt(parts[2]), m, parseInt(parts[0]));
  }
  const [d,mo,y] = parts.map(Number);
  return new Date(y, mo-1, d);
}

// ══════════════════════════════════════════════════════════
//  PDF LINE EXTRACTOR — groups items by Y coord
// ══════════════════════════════════════════════════════════
async function extractLines(pdfDoc, onProg) {
  const all = [];
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const ct   = await page.getTextContent({ normalizeWhitespace: false });
    const h    = page.getViewport({ scale:1 }).height;
    const yMap = new Map();
    ct.items.forEach(item => {
      if (!item.str.trim()) return;
      // Use a 5-unit bucket (was 3) so that items on the same visual row
      // that differ by a sub-pixel are grouped together, while multi-line
      // table headers that span 2 rows do NOT get merged.
      const yk = Math.round((h - item.transform[5]) / 5) * 5;
      if (!yMap.has(yk)) yMap.set(yk, []);
      yMap.get(yk).push({ x: item.transform[4], text: item.str });
    });
    Array.from(yMap.keys()).sort((a,b)=>a-b).forEach(y => {
      const line = yMap.get(y).sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ').replace(/\s+/g,' ').trim();
      if (line) all.push({ y, p, text: line });
    });
    onProg(p);
  }
  return all;
}

// ══════════════════════════════════════════════════════════
//  CDSL CAS PARSER
//
//  Extracts:
//  1. Monthly portfolio valuation table
//  2. Asset class breakdown
//  3. MF Folio details
//  4. DEMAT stock holdings per account — ISIN, name,
//     op.bal, credits, debits, closing balance
//     from transaction table rows like:
//     "INE172A01027  CASTROL INDIA  09-04-2026  13.000  1.000  --  14.000  0"
// ══════════════════════════════════════════════════════════
function parseCDSLCAS(lines, statementPeriod) {
  // ── 1. Monthly portfolio valuation ─────────────────────
  const rMon = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+([\d,]+\.\d{2})/i;
  const monthly = [];
  lines.forEach(({text}) => {
    const m = text.match(rMon);
    if (m) {
      const date = monthYearToDate(m[1], m[2]);
      if (date) monthly.push({ date, totalValue: parseNum(m[3]), label: shortLabel(date) });
    }
  });
  monthly.sort((a,b)=>new Date(a.date)-new Date(b.date));
  const dedupMon = Array.from(new Map(monthly.map(m=>[m.date,m])).values());

  // Enrich with changes
  const enriched = dedupMon.map((m,i) => ({
    ...m,
    change:    i>0 ? m.totalValue - dedupMon[i-1].totalValue : 0,
    changePct: i>0 && dedupMon[i-1].totalValue>0
      ? +((m.totalValue-dedupMon[i-1].totalValue)/dedupMon[i-1].totalValue*100).toFixed(2) : 0,
    cumChange: dedupMon.length>0 ? m.totalValue - dedupMon[0].totalValue : 0,
  }));

  // ── 2. Asset classes ────────────────────────────────────
  const rAsset = /^(Equity|Mutual Fund(?:s)?(?:\s+Held\s+in\s+Demat\s+Form)?|Mutual\s+Fund\s+Folios|Debts?|Others?|NPS)\s+([\d,]+\.\d{2})\s+([\d.]+)/i;
  const assetMap = new Map();
  lines.forEach(({text}) => {
    const m = text.match(rAsset);
    if (m) {
      const name = m[1].replace(/\s+/g,' ').trim();
      if (!assetMap.has(name)) assetMap.set(name, { name, value: parseNum(m[2]), pct: parseFloat(m[3]) });
    }
  });
  const assetClasses = Array.from(assetMap.values()).sort((a,b)=>b.value-a.value);

  // ── 3. MF Folios ────────────────────────────────────────
  const mfSchemes = [];
  let curAMC = null, curScheme = null, curCode = null;
  const rAMC  = /AMC\s+Name\s*:\s*(.+)/i;
  const rSch  = /Scheme\s+Name\s*:\s*(.+?)(?:\s+Scheme\s+Code\s*:\s*(\S+))?$/i;
  const rFol  = /Folio\s+No\s*:\s*([A-Z0-9\/]+)/i;
  const rISIN = /^ISIN\s*:\s*([A-Z]{2}[A-Z0-9]{10})/i;
  lines.forEach(({text}) => {
    const am = text.match(rAMC); if (am) { curAMC=am[1].trim(); return; }
    const sm = text.match(rSch); if (sm) { curScheme=sm[1].replace(/\s+/g,' ').trim(); curCode=sm[2]||null; return; }
    const fm = text.match(rFol); if (fm && curScheme) {
      mfSchemes.push({ amcName:curAMC||'', schemeName:curScheme, schemeCode:curCode, folioNumber:fm[1], isin:null });
      return;
    }
    const im = text.match(rISIN); if (im && mfSchemes.length>0) mfSchemes[mfSchemes.length-1].isin = im[1];
  });

  // ── 4. DEMAT Stock Holdings ─────────────────────────────
  // Transaction table rows:
  //   "INE172A01027  CASTROL INDIA  [transaction detail]  09-04-2026  13.000  1.000  --  14.000  0"
  // OR simpler closing balance rows (no transaction):
  //   "INE172A01027  CASTROL INDIA  09-04-2026  14.000  0"
  //
  // We also capture the security name lines that appear BEFORE the ISIN line
  // because CDSL puts the name on a separate line above
  //
  // Strategy: scan for ISIN lines, then capture numbers on same/next line

  const stocks = []; // { isin, name, dpId, opBal, credit, debit, clBal, txDate }
  const rISINLine = /\b(IN[A-Z0-9]{10})\b/;
  // Date in transaction: dd-mm-yyyy or dd-Mon-yyyy
  const rTxDate = /(\d{2}[-\/][A-Za-z]{3}[-\/]\d{4}|\d{2}[-\/]\d{2}[-\/]\d{4})/;
  // Numbers: opBal credit debit clBal — debit shown as "--" when zero
  const rNums = /([\d,]+\.\d{3})\s+([\d,]+\.\d{3}|--)\s+([\d,]+\.\d{3}|--)\s+([\d,]+\.\d{3})/;

  // Also track DP context
  let curDP   = '';
  const rDP   = /DP\s+(?:Name|Id)\s*[:\-]?\s*(.+?)(?:\s+DP\s+ID|$)/i;
  const rDPId = /DP\s+ID\s*[:\-]?\s*(\d{8}|IN\d+)/i;

  // Security names appear on lines just before the ISIN row
  // We'll do a two-pass: first collect all ISIN rows with their surrounding lines
  lines.forEach(({text, p}, idx) => {
    // Track DP
    const dpM = text.match(rDPId); if (dpM) curDP = dpM[1];

    const isinM = text.match(rISINLine);
    if (!isinM) return;
    const isin = isinM[1];

    // Skip MF ISINs already captured
    if (mfSchemes.some(s => s.isin === isin)) return;
    // Skip the folio/account detail ISIN lines (they're in "ISIN : INF...")
    if (/^\s*ISIN\s*:/i.test(text)) return;

    // Get security name: look back up to 4 lines for a name line
    let secName = '';
    for (let back = 1; back <= 5 && idx - back >= 0; back++) {
      const prev = lines[idx-back].text;
      // Name lines: ALL CAPS words, no numbers, not a header
      if (/^[A-Z][A-Z&.\-\s()\/]+$/.test(prev.trim()) &&
          !/ISIN|FOLIO|STATEMENT|DEMAT|CDSL|NSDL|Page|Central|Consolidated|Account|Summary|CONSOLIDATED|INVESTMENTS|FORM AND|Lower|Wing|Floor|A Wing|DP Name|DP Id|Email|Mobile|Nominee|BSDA|Account Status|BO/i.test(prev)) {
        secName = (prev.trim() + ' ' + secName).trim();
        if (secName.length > 10) break;
      }
    }
    // Also try extracting name from the same ISIN line
    // Format: "INE172A01027  CASTROL INDIA LIMITED  TM/CP..."
    const sameLineNameM = text.match(/\b(IN[A-Z0-9]{10})\s+([A-Z][A-Z&.\-\s()\/]{4,40?}?)(?:\s+(?:TM\/|SETT|INT|PAYOUT|NEW|#|\d{2}[-\/]))/);
    if (sameLineNameM && sameLineNameM[2]) secName = sameLineNameM[2].trim();

    // Extract date, numbers from this line or the next few
    let txDate = null, opBal = 0, credit = 0, debit = 0, clBal = 0;
    const searchText = [text, ...(lines.slice(idx+1, idx+4).map(l=>l.text))].join(' ');

    const dateM = searchText.match(rTxDate);
    if (dateM) { const d = parseECASDate(dateM[1]); if (d) txDate = d.toISOString().split('T')[0]; }

    const numsM = searchText.match(rNums);
    if (numsM) {
      opBal  = parseNum(numsM[1]);
      credit = numsM[2]==='--' ? 0 : parseNum(numsM[2]);
      debit  = numsM[3]==='--' ? 0 : parseNum(numsM[3]);
      clBal  = parseNum(numsM[4]);
    }

    if (clBal > 0 || opBal > 0) {
      // Deduplicate: if same ISIN+date already exists, pick the latest clBal
      const existing = stocks.find(s => s.isin===isin && s.txDate===txDate);
      if (existing) {
        existing.opBal  = Math.max(existing.opBal, opBal);
        existing.credit += credit;
        existing.debit  += debit;
        existing.clBal  = Math.max(existing.clBal, clBal);
      } else {
        stocks.push({ isin, name: secName, dpId: curDP, opBal, credit, debit, clBal, txDate });
      }
    }
  });

  // ── 4b. Holdings Summary Table (alternative CDSL format) ────────────────
  // Format: ISIN  Security Name  CurrentBal  FrozenBal  PledgeBal  PledgeSetupBal  FreeBal  MarketPrice  Value
  // Numbers are integers or 2-decimal (not 3-decimal like transaction rows).
  // Example line after Y-grouping:
  //   INE172A01027 CASTROL INDIA LIMITED 14 0 0 0 14 195.35 2,735.00
  const rHoldRow = /\b(IN[A-Z0-9]{10})\b\s+([A-Z][A-Z&.\-\s()\/]{2,50}?)\s+([\d,]+(?:\.\d{1,3})?)\s+([\d,]+(?:\.\d{1,3})?|--)\s+([\d,]+(?:\.\d{1,3})?|--)\s+([\d,]+(?:\.\d{1,3})?|--)\s+([\d,]+(?:\.\d{1,3})?)\s+([\d,]+(?:\.\d{1,3})?)\s+([\d,]+(?:\.\d{1,3})?)/;

  lines.forEach(({ text }) => {
    const m = text.match(rHoldRow);
    if (!m) return;
    const isin = m[1];
    // Skip already-captured entries
    if (mfSchemes.some(s => s.isin === isin)) return;
    if (stocks.some(s => s.isin === isin)) return;

    const secName     = m[2].trim();
    const currentBal  = parseNum(m[3]);
    const frozenBal   = m[4] === '--' ? 0 : parseNum(m[4]);
    const pledgeBal   = m[5] === '--' ? 0 : parseNum(m[5]);
    const pledgeSetup = m[6] === '--' ? 0 : parseNum(m[6]);
    const freeBal     = parseNum(m[7]);
    const mktPrice    = parseNum(m[8]);
    const value       = parseNum(m[9]);

    if (currentBal > 0 || freeBal > 0) {
      stocks.push({
        isin, name: secName, dpId: curDP,
        opBal: currentBal, credit: 0, debit: 0, clBal: currentBal, txDate: null,
        frozenBal, pledgeBal, pledgeSetup, freeBal, mktPrice, value,
        _source: 'holdings_table',
      });
    }
  });

  // ── 4c. Fallback: ISIN-only lines where security name is on the line above ──
  // Handles PDFs where name and ISIN data are on separate visual rows.
  const rSimpleHold = /^(IN[A-Z0-9]{10})\s+([\d,]+(?:\.\d{1,3})?)(?:\s+(?:[\d,]+(?:\.\d{1,3})?|--)){3,}/;
  lines.forEach(({ text }, idx) => {
    const m = text.match(rSimpleHold);
    if (!m) return;
    const isin = m[1];
    if (mfSchemes.some(s => s.isin === isin)) return;
    if (stocks.some(s => s.isin === isin)) return;

    const nums = (text.match(/[\d,]+(?:\.\d{1,3})?/g) || []).map(parseNum).filter(n => n >= 0);
    if (nums.length < 2) return;

    // Look back up to 5 lines for a security name
    let secName = '';
    for (let back = 1; back <= 5 && idx - back >= 0; back++) {
      const prev = lines[idx - back].text.trim();
      if (/^[A-Z][A-Z&.\-\s()\/]+$/.test(prev) &&
          !/ISIN|FOLIO|STATEMENT|DEMAT|CDSL|NSDL|Page|Central|Consolidated|Account|Summary|FORM|DP Name|DP Id|Email|Mobile|Pledge|Frozen|Free Bal|Market|Current|Value/i.test(prev)) {
        secName = prev;
        break;
      }
    }

    const currentBal = nums[0];
    if (currentBal > 0) {
      stocks.push({
        isin, name: secName, dpId: curDP,
        opBal: currentBal, credit: 0, debit: 0, clBal: currentBal, txDate: null,
        frozenBal:   nums[1] || 0,
        pledgeBal:   nums[2] || 0,
        pledgeSetup: nums[3] || 0,
        freeBal:     nums[4] || 0,
        mktPrice:    nums[5] || 0,
        value:       nums[6] || 0,
        _source: 'holdings_fallback',
      });
    }
  });

  // ── 5. Holder info ──────────────────────────────────────
  let holderName = '', pan = '';
  lines.forEach(({text}) => {
    if (!holderName) { const m = text.match(/^([A-Z][A-Z\s]{2,30})\s*\(\s*PAN\s*[:\-]/); if (m) holderName = m[1].trim(); }
    if (!pan)        { const m = text.match(/PAN\s*[:\-]?\s*([A-Z]{5}\d{4}[A-Z])/i);   if (m) pan = m[1]; }
  });

  // ── 6. Period ───────────────────────────────────────────
  let period = statementPeriod || '';
  if (!period) {
    lines.forEach(({text}) => {
      const m = text.match(/(\d{2}[-\/]\w{3,9}[-\/]\d{4})\s*(?:to|से)\s*(\d{2}[-\/]\w{3,9}[-\/]\d{4})/i);
      if (m && !period) period = `${m[1]} to ${m[2]}`;
    });
  }

  // ── 7. Total values ─────────────────────────────────────
  let totalPortfolio = 0, mfFolioValue = 0, dematMFValue = 0;
  lines.forEach(({text}) => {
    const t = text.match(/Total\s+Portfolio\s+Value\s+([\d,]+\.\d{2})/i);
    if (t) totalPortfolio = Math.max(totalPortfolio, parseNum(t[1]));
    const f = text.match(/Mutual\s+Fund\s+Folios\s+[\d]+\s+Folios[\s\d]+([\d,]+\.\d{2})/i);
    if (f) mfFolioValue = parseNum(f[1]);
    const d = text.match(/Mutual\s+Funds\s+Held\s+in\s+Demat\s+Form\s+([\d,]+\.\d{2})/i);
    if (d) dematMFValue = parseNum(d[1]);
  });

  return {
    type: 'CDSL_CAS',
    holderName, pan, period,
    totalPortfolio, mfFolioValue, dematMFValue,
    assetClasses,
    monthlyTimeline: enriched,
    mfSchemes,
    stocks,   // ← demat stock holdings
  };
}

// ══════════════════════════════════════════════════════════
//  FIREBASE SERVICE  — ecasSnapshots collection
//  Schema:
//    ecasSnapshots/{uid}/snapshots/{YYYY-MM}  →  { period, parsedAt, stocks[], monthly[], mfSchemes[] }
// ══════════════════════════════════════════════════════════
const ecasService = {
  col: (uid) => collection(db, 'ecasSnapshots', uid, 'snapshots'),

  async save(uid, snapshot) {
    const key = snapshot.monthKey; // "YYYY-MM"
    await setDoc(doc(db, 'ecasSnapshots', uid, 'snapshots', key), {
      ...snapshot, savedAt: new Date().toISOString(),
    });
  },

  async getAll(uid) {
    const snaps = await getDocs(query(ecasService.col(uid), orderBy('monthKey','desc')));
    return snaps.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async delete(uid, key) {
    await deleteDoc(doc(db, 'ecasSnapshots', uid, 'snapshots', key));
  },
};

// ── Tooltip helpers ────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:10,padding:'10px 14px',fontSize:12,boxShadow:'0 4px 20px rgba(0,0,0,.2)' }}>
      <div style={{ fontWeight:700,marginBottom:6,color:'var(--t2)' }}>{label}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{ display:'flex',justifyContent:'space-between',gap:16,color:p.color,fontWeight:600 }}>
          <span>{p.name}</span><span>₹{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
function ChangeTip({ active, payload, label }) {
  if (!active||!payload?.length) return null;
  const v = payload[0]?.value||0;
  return (
    <div style={{ background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:10,padding:'10px 14px',fontSize:12 }}>
      <div style={{ fontWeight:700,marginBottom:4,color:'var(--t2)' }}>{label}</div>
      <div style={{ fontWeight:700,color:v>=0?'var(--green)':'var(--red)' }}>{v>=0?'+':''}₹{fmt(v)}</div>
    </div>
  );
}
function StatCard({ icon, label, value, sub, gradient, accent }) {
  return (
    <div style={{ background:gradient||'var(--bg2)',border:gradient?'none':'1px solid var(--border)',borderRadius:14,padding:'14px 18px' }}>
      <div style={{ fontSize:11,fontWeight:700,color:gradient?'rgba(255,255,255,.75)':'var(--t3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.5px' }}>{icon} {label}</div>
      <div style={{ fontSize:20,fontWeight:900,color:gradient?'#fff':accent||'var(--text)' }}>{value}</div>
      {sub&&<div style={{ fontSize:11,fontWeight:600,marginTop:2,color:gradient?'rgba(255,255,255,.85)':'var(--t3)' }}>{sub}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════
export default function ECASAnalyzer({ pdfPassword: propPassword, onDataExtracted }) {
  const [file,        setFile]        = useState(null);
  const [password,    setPassword]    = useState(propPassword||'');
  const [showPass,    setShowPass]    = useState(false);
  const [processing,  setProcessing]  = useState(false);
  const [progress,    setProgress]    = useState({ page:0,total:0 });
  const [parsed,      setParsed]      = useState(null);        // latest parsed CAS
  const [snapshots,   setSnapshots]   = useState([]);          // saved Firebase records
  const [loadingSnaps,setLoadingSnaps]= useState(false);
  const [saving,      setSaving]      = useState(false);
  const [tab,         setTab]         = useState('overview');  // overview|stocks|monthly|comparison|history
  const [stockFilter, setStockFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('all');       // "all" or "YYYY-MM"
  const [debugLines,  setDebugLines]  = useState(null);
  const [showDebug,   setShowDebug]   = useState(false);
  const [historySnap, setHistorySnap] = useState(null);        // selected history snapshot to view
  const fileRef = useRef(null);

  useEffect(()=>{ if(propPassword) setPassword(propPassword); },[propPassword]);

  // Load saved snapshots on mount
  useEffect(()=>{ loadSnapshots(); },[]);

  const loadSnapshots = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoadingSnaps(true);
    try {
      const snaps = await ecasService.getAll(uid);
      setSnapshots(snaps);
    } catch(e) { console.error(e); }
    finally { setLoadingSnaps(false); }
  };

  // ── File select ──────────────────────────────────────────
  const handleFile = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.pdf')&&f.type!=='application/pdf') { toast.error('Please upload a PDF'); return; }
    setFile(f); setParsed(null); setDebugLines(null);
    toast.success(`Selected: ${f.name}`);
  };

  // ── Process PDF ──────────────────────────────────────────
  const processPDF = async () => {
    if (!file) { toast.error('Select a PDF first'); return; }
    setProcessing(true); setProgress({page:0,total:0});
    try {
      const lib    = await loadPdfJs();
      const buf    = await file.arrayBuffer();
      const params = { data: buf };
      if (password) params.password = password;
      const pdf    = await lib.getDocument(params).promise;
      setProgress({page:0,total:pdf.numPages});
      const lines  = await extractLines(pdf, p=>setProgress({page:p,total:pdf.numPages}));
      setDebugLines(lines);
      const data   = parseCDSLCAS(lines);
      if (!data.monthlyTimeline.length && !data.stocks.length && !data.mfSchemes.length) {
        setShowDebug(true);
        toast.error('No data found — see Debug Panel below');
        return;
      }
      setParsed(data);
      setTab('overview');
      onDataExtracted?.(data);
      toast.success(`✅ Parsed: ${data.stocks.length} stocks · ${data.monthlyTimeline.length} months · ${data.mfSchemes.length} MF schemes`);
    } catch(err) {
      console.error(err);
      if (err.name==='PasswordException'||err.code===1||/password/i.test(err.message))
        toast.error('❌ Wrong password');
      else toast.error('Error: '+(err.message||'Unknown'));
    } finally { setProcessing(false); }
  };

  // ── Save to Firebase ─────────────────────────────────────
  const saveToFirebase = async () => {
    if (!parsed) return;
    const uid = auth.currentUser?.uid;
    if (!uid) { toast.error('Not logged in'); return; }

    // Determine monthKey from the last month of the statement period
    const lastM = parsed.monthlyTimeline[parsed.monthlyTimeline.length-1];
    if (!lastM) { toast.error('No monthly data to save'); return; }
    const monthKey = lastM.date.slice(0,7); // "YYYY-MM"

    setSaving(true);
    try {
      const snapshot = {
        monthKey,
        period:         parsed.period,
        holderName:     parsed.holderName,
        pan:            parsed.pan,
        totalPortfolio: parsed.totalPortfolio,
        mfFolioValue:   parsed.mfFolioValue,
        dematMFValue:   parsed.dematMFValue,
        assetClasses:   parsed.assetClasses,
        monthlyTimeline:parsed.monthlyTimeline,
        mfSchemes:      parsed.mfSchemes,
        stocks:         parsed.stocks,
        sourceFile:     file?.name || '',
      };
      await ecasService.save(uid, snapshot);
      toast.success(`✅ Saved snapshot for ${monthKey}`);
      await loadSnapshots();
    } catch(e) {
      console.error(e); toast.error('Save failed: '+e.message);
    } finally { setSaving(false); }
  };

  // ── Delete snapshot ──────────────────────────────────────
  const deleteSnapshot = async (key) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (!window.confirm(`Delete snapshot ${key}?`)) return;
    try {
      await ecasService.delete(uid, key);
      toast.success('Deleted');
      if (historySnap?.monthKey===key) setHistorySnap(null);
      await loadSnapshots();
    } catch(e) { toast.error('Delete failed'); }
  };

  // ── Derived from parsed or history ──────────────────────
  const active   = historySnap || parsed;   // what we're viewing
  const timeline = active?.monthlyTimeline || [];
  const stocks   = active?.stocks || [];
  const first    = timeline[0];
  const last     = timeline[timeline.length-1];
  const totalChg = last&&first ? last.totalValue-first.totalValue : 0;
  const totalPct = first?.totalValue>0 ? ((totalChg/first.totalValue)*100).toFixed(2) : '0.00';

  // Stock filter + month filter
  const monthKeys = [...new Set(stocks.map(s=>s.txDate?.slice(0,7)).filter(Boolean))].sort().reverse();
  const filteredStocks = stocks.filter(s => {
    const nameOk = !stockFilter ||
      s.name.toLowerCase().includes(stockFilter.toLowerCase()) ||
      s.isin.toLowerCase().includes(stockFilter.toLowerCase());
    const monthOk = monthFilter==='all' || s.txDate?.slice(0,7)===monthFilter;
    return nameOk && monthOk;
  });

  // Aggregate by ISIN for summary (across all months)
  const stockSummary = Object.values(
    stocks.reduce((acc, s) => {
      if (!acc[s.isin]) acc[s.isin] = { isin:s.isin, name:s.name, dpId:s.dpId, records:[] };
      acc[s.isin].records.push(s);
      return acc;
    }, {})
  ).map(g => {
    const sorted = g.records.sort((a,b)=>new Date(b.txDate||0)-new Date(a.txDate||0));
    const latest = sorted[0];
    const totalCredits = g.records.reduce((s,r)=>s+r.credit,0);
    const totalDebits  = g.records.reduce((s,r)=>s+r.debit,0);
    return {
      isin:    g.isin,
      name:    g.name || g.isin,
      dpId:    g.dpId,
      clBal:   latest.clBal,
      opBal:   sorted[sorted.length-1].opBal,
      totalCredits,
      totalDebits,
      lastDate: latest.txDate,
      months:  g.records.length,
    };
  }).filter(s=>s.clBal>0).sort((a,b)=>b.clBal-a.clBal);

  // ── Render ───────────────────────────────────────────────
  return (
    <div>
      {/* ════ UPLOAD CARD ════ */}
      <div className="card" style={{marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
          <span style={{fontSize:26}}>📑</span>
          <div>
            <div className="fw-700 fs-16">CDSL CAS Analyzer</div>
            <div className="fs-12 text-muted">Upload CDSL CAS PDF · Extracts stocks, MF folios, monthly portfolio trend · Saves to Firebase</div>
          </div>
        </div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}}>
          {/* Drop zone */}
          <div style={{flex:1,minWidth:200}}>
            <label className="fl">CAS PDF File</label>
            <input ref={fileRef} type="file" accept=".pdf" onChange={handleFile} style={{display:'none'}}/>
            <div onClick={()=>fileRef.current?.click()} onDrop={e=>{e.preventDefault();handleFile({target:{files:[e.dataTransfer.files[0]]}});}} onDragOver={e=>e.preventDefault()}
              style={{padding:'12px 14px',border:'2px dashed var(--border2)',borderRadius:12,background:'var(--bg3)',cursor:'pointer',display:'flex',alignItems:'center',gap:10,transition:'border-color .2s'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor='var(--blue)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border2)'}>
              <span style={{fontSize:22}}>{file?'📄':'📂'}</span>
              <div style={{flex:1}}>
                {file ? <><div className="fw-700 fs-13">{file.name}</div><div className="fs-11 text-muted">{(file.size/1024/1024).toFixed(2)} MB</div></>
                      : <><div className="fw-600 fs-13">Click or drag & drop PDF</div><div className="fs-11 text-muted">CDSL / NSDL / CAMS CAS</div></>}
              </div>
              {file&&<button onClick={e=>{e.stopPropagation();setFile(null);setParsed(null);setDebugLines(null);if(fileRef.current)fileRef.current.value='';}} style={{background:'var(--red)',border:'none',borderRadius:6,color:'#fff',padding:'3px 8px',fontSize:11,fontWeight:700,cursor:'pointer'}}>✕</button>}
            </div>
          </div>
          {/* Password */}
          <div style={{minWidth:190}}>
            <label className="fl">PDF Password</label>
            <div style={{position:'relative'}}>
              <span style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',fontSize:13}}>🔒</span>
              <input type={showPass?'text':'password'} className="fi" placeholder="Leave blank if none" value={password} onChange={e=>setPassword(e.target.value)}
                style={{paddingLeft:28,paddingRight:34,fontFamily:'monospace',fontWeight:700,letterSpacing:showPass?0:3}}/>
              <button type="button" onClick={()=>setShowPass(v=>!v)} style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:13,color:'var(--t3)'}}>
                {showPass?'🙈':'👁'}
              </button>
            </div>
          </div>
          {/* Buttons */}
          <div style={{display:'flex',gap:8,flexShrink:0}}>
            <button className="btn btn-primary" onClick={processPDF} disabled={!file||processing} style={{minWidth:140,marginBottom:0}}>
              {processing?<><span className="spin" style={{width:11,height:11,borderWidth:2}}/>{progress.total>0?` ${progress.page}/${progress.total}…`:' Loading…'}</>:'🔍 Analyze'}
            </button>
            {parsed && (
              <button className="btn btn-success" onClick={saveToFirebase} disabled={saving} style={{minWidth:120,marginBottom:0}}>
                {saving?<><span className="spin" style={{width:11,height:11,borderWidth:2}}/> Saving…</>:'💾 Save'}
              </button>
            )}
          </div>
        </div>
        {processing&&progress.total>0&&(
          <div style={{marginTop:10}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--t3)',marginBottom:3}}>
              <span>Reading pages…</span><span>{Math.round(progress.page/progress.total*100)}%</span>
            </div>
            <div style={{background:'var(--bg3)',borderRadius:8,height:5,overflow:'hidden'}}>
              <div style={{height:'100%',background:'var(--blue)',borderRadius:8,width:`${progress.page/progress.total*100}%`,transition:'width .3s'}}/>
            </div>
          </div>
        )}
      </div>

      {/* ════ DEBUG PANEL ════ */}
      {debugLines&&(
        <div className="card" style={{marginBottom:14,border:'1px solid var(--orange)',background:'rgba(251,146,60,.05)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span>🔬</span>
              <div className="fw-700 fs-13" style={{color:'var(--orange)'}}>Debug Panel</div>
              <span className="fs-11 text-muted">· {debugLines.length} lines</span>
            </div>
            <div style={{display:'flex',gap:6}}>
              <button onClick={()=>{const txt=debugLines.map((l,i)=>`${i}|p${l.p}|${l.text}`).join('\n');navigator.clipboard?.writeText(txt).then(()=>toast.success('Copied!'));}} style={{padding:'3px 9px',borderRadius:6,border:'1px solid var(--orange)',background:'transparent',color:'var(--orange)',fontSize:11,fontWeight:700,cursor:'pointer'}}>📋 Copy</button>
              <button onClick={()=>setShowDebug(v=>!v)} style={{padding:'3px 9px',borderRadius:6,border:'1px solid var(--border2)',background:'var(--bg3)',color:'var(--t2)',fontSize:11,fontWeight:700,cursor:'pointer'}}>{showDebug?'▲ Hide':'▼ Show'}</button>
            </div>
          </div>
          {showDebug&&(
            <div style={{marginTop:8,fontFamily:'monospace',fontSize:10,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,padding:10,maxHeight:260,overflowY:'auto',lineHeight:1.7}}>
              {debugLines.slice(0,200).map((l,i)=>(
                <div key={i} style={{display:'flex',gap:8,borderBottom:'1px solid var(--border)'}}>
                  <span style={{color:'var(--t3)',minWidth:26}}>{i}</span>
                  <span style={{color:'var(--blue)',minWidth:26}}>p{l.p}</span>
                  <span style={{color:'var(--text)',wordBreak:'break-all'}}>{l.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════ HISTORY SIDEBAR — saved snapshots ════ */}
      {snapshots.length>0&&(
        <div className="card" style={{marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div className="fw-700 fs-14">🗄 Saved Snapshots ({snapshots.length})</div>
            {loadingSnaps&&<span className="spin" style={{width:13,height:13,borderWidth:2}}/>}
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={()=>setHistorySnap(null)}
              style={{padding:'5px 12px',borderRadius:8,border:`2px solid ${!historySnap?'var(--blue)':'var(--border2)'}`,background:!historySnap?'var(--blue-dim)':'var(--bg3)',color:!historySnap?'var(--blue)':'var(--t2)',fontSize:12,fontWeight:700,cursor:'pointer'}}>
              📤 Current Upload
            </button>
            {snapshots.map(s=>(
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:4}}>
                <button onClick={()=>{setHistorySnap(s);setTab('overview');}}
                  style={{padding:'5px 12px',borderRadius:'8px 0 0 8px',border:`2px solid ${historySnap?.monthKey===s.id?'var(--green)':'var(--border2)'}`,borderRight:'none',background:historySnap?.monthKey===s.id?'rgba(67,233,123,.12)':'var(--bg3)',color:historySnap?.monthKey===s.id?'var(--green)':'var(--t2)',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                  {s.monthKey}
                </button>
                <button onClick={()=>deleteSnapshot(s.id)}
                  style={{padding:'5px 7px',borderRadius:'0 8px 8px 0',border:`2px solid ${historySnap?.monthKey===s.id?'var(--green)':'var(--border2)'}`,background:'transparent',color:'var(--red)',fontSize:11,cursor:'pointer',fontWeight:700}}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════ EMPTY STATE ════ */}
      {!active&&!processing&&(
        <div className="card" style={{padding:'50px 24px',textAlign:'center',background:'var(--bg2)'}}>
          <span style={{fontSize:48,display:'block',marginBottom:10}}>📑</span>
          <div className="fw-700 fs-15 mb-2">No CAS Data</div>
          <div className="fs-13 text-muted" style={{maxWidth:380,margin:'0 auto'}}>Upload your CDSL CAS PDF to see stock-wise holdings, MF folios, and month-by-month portfolio data.</div>
        </div>
      )}

      {/* ════ RESULTS ════ */}
      {active&&(
        <>
          {/* Holder banner */}
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,marginBottom:14,flexWrap:'wrap',gap:10}}>
            <span style={{fontSize:22}}>👤</span>
            <div style={{flex:1,minWidth:120}}>
              <div className="fw-800 fs-15">{active.holderName||'—'}</div>
              <div className="fs-11 text-muted font-mono">{active.pan&&`PAN: ${active.pan}`} {historySnap&&`· Snapshot: ${historySnap.monthKey}`}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="fs-11 text-muted">Total Portfolio</div>
              <div className="fw-900 fs-16" style={{color:'var(--blue)'}}>₹{fmt(active.totalPortfolio)}</div>
            </div>
          </div>

          {/* Stat cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:16}}>
            <StatCard icon="💼" label="Total Portfolio"   value={`₹${fmt(active.totalPortfolio)}`}   gradient="linear-gradient(135deg,#667eea,#764ba2)"/>
            <StatCard icon="📈" label="MF Folios"         value={`₹${fmt(active.mfFolioValue)}`}      gradient="linear-gradient(135deg,#43e97b,#38f9d7)"/>
            <StatCard icon="🏦" label="MF in Demat"       value={`₹${fmt(active.dematMFValue)}`}      gradient="linear-gradient(135deg,#4facfe,#00f2fe)"/>
            <StatCard icon="📊" label="Stocks in Demat"   value={stockSummary.length}  sub={`${stocks.length} transaction rows`} gradient="linear-gradient(135deg,#f59e0b,#ef4444)"/>
            <StatCard icon={totalChg>=0?'🟢':'🔴'} label={`${timeline.length}-Month Change`}
              value={`${totalChg>=0?'+':''}₹${fmt(totalChg)}`} sub={`${totalPct>=0?'+':''}${totalPct}%`}
              gradient={totalChg>=0?'linear-gradient(135deg,#34d399,#059669)':'linear-gradient(135deg,#fa709a,#fee140)'}/>
          </div>

          {/* Tabs */}
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
            {[
              {key:'overview',  label:'📊 Overview'},
              {key:'stocks',    label:`🧾 Stocks (${stockSummary.length})`},
              {key:'monthly',   label:'📅 Monthly'},
              {key:'comparison',label:'📉 Comparison'},
              {key:'mfschemes', label:`📂 MF (${active.mfSchemes?.length||0})`},
              {key:'history',   label:'🗄 History'},
            ].map(({key,label})=>(
              <button key={key} onClick={()=>setTab(key)}
                style={{padding:'7px 13px',borderRadius:8,border:'none',fontWeight:700,fontSize:12,cursor:'pointer',transition:'all .2s',background:tab===key?'var(--blue)':'var(--bg3)',color:tab===key?'#fff':'var(--t2)'}}>
                {label}
              </button>
            ))}
            {debugLines&&<button onClick={()=>setShowDebug(v=>!v)} style={{padding:'7px 11px',borderRadius:8,border:'1px solid var(--border2)',fontWeight:700,fontSize:11,cursor:'pointer',background:showDebug?'rgba(251,146,60,.15)':'var(--bg3)',color:'var(--orange)',marginLeft:'auto'}}>🔬</button>}
          </div>

          {/* ─── OVERVIEW ─── */}
          {tab==='overview'&&(
            <div>
              {/* Asset breakdown */}
              {active.assetClasses?.length>0&&(
                <div className="card" style={{marginBottom:14}}>
                  <div className="fw-700 fs-14 mb-3">🥧 Asset Class Breakdown</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginBottom:12}}>
                    {active.assetClasses.map((a,i)=>(
                      <div key={i} style={{background:'var(--bg3)',borderRadius:10,padding:'10px 13px',borderLeft:`3px solid ${COLORS[i%COLORS.length]}`}}>
                        <div style={{fontSize:11,color:'var(--t3)',marginBottom:2}}>{a.name}</div>
                        <div style={{fontWeight:800,fontSize:15,color:COLORS[i%COLORS.length]}}>₹{fmt(a.value)}</div>
                        <div style={{fontSize:11,color:'var(--t3)',marginTop:1}}>{a.pct}%</div>
                      </div>
                    ))}
                  </div>
                  <div style={{height:16,borderRadius:8,overflow:'hidden',display:'flex',gap:1}}>
                    {active.assetClasses.map((a,i)=>(
                      <div key={i} style={{width:`${a.pct}%`,background:COLORS[i%COLORS.length],minWidth:a.pct>0?2:0}} title={`${a.name}: ${a.pct}%`}/>
                    ))}
                  </div>
                </div>
              )}
              {/* Trend preview */}
              {timeline.length>0&&(
                <div className="card">
                  <div className="fw-700 fs-14 mb-1">📈 Portfolio Trend</div>
                  <div className="fs-12 text-muted mb-3">{first?.label} → {last?.label}</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={timeline}>
                      <defs><linearGradient id="gPV" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#667eea" stopOpacity={0.4}/><stop offset="95%" stopColor="#667eea" stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border2)"/>
                      <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--t3)'}} tickLine={false}/>
                      <YAxis tick={{fontSize:10,fill:'var(--t3)'}} tickFormatter={v=>`₹${shortNum(v)}`}/>
                      <Tooltip content={<ChartTip/>}/>
                      <Area type="monotone" dataKey="totalValue" stroke="#667eea" fill="url(#gPV)" strokeWidth={2.5} name="Portfolio Value" dot={{r:3}}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ─── STOCKS TAB ─── */}
          {tab==='stocks'&&(
            <div>
              {/* Filter bar */}
              <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12,alignItems:'flex-end'}}>
                <div style={{flex:1,minWidth:180}}>
                  <label className="fl">Search Stock / ISIN</label>
                  <input className="fi" placeholder="e.g. CASTROL or INE172..." value={stockFilter} onChange={e=>setStockFilter(e.target.value)}
                    style={{fontFamily:'monospace'}}/>
                </div>
                <div style={{minWidth:160}}>
                  <label className="fl">Filter by Month</label>
                  <select value={monthFilter} onChange={e=>setMonthFilter(e.target.value)}
                    style={{padding:'9px 12px',borderRadius:8,border:'1px solid var(--border2)',background:'var(--bg3)',fontSize:13,fontWeight:600,color:'var(--text)',cursor:'pointer',width:'100%'}}>
                    <option value="all">📅 All Months</option>
                    {monthKeys.map(k=><option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div style={{fontSize:12,color:'var(--t3)',paddingBottom:10}}>
                  {filteredStocks.length} rows · {stockSummary.filter(s=>!stockFilter||(s.name+s.isin).toLowerCase().includes(stockFilter.toLowerCase())).length} unique
                </div>
              </div>

              {/* Summary table (aggregated across all months) */}
              {monthFilter==='all'&&(
                <div className="card" style={{marginBottom:14}}>
                  <div className="fw-700 fs-14 mb-3">📊 Stock Summary (All Months)</div>
                  <div style={{overflowX:'auto'}}>
                    <table className="data-table">
                      {/* Detect if this is a holdings-table parse (extra columns present) */}
                      {(()=>{
                        const isHoldings = stockSummary.some(s=>s._source==='holdings_table'||s._source==='holdings_fallback');
                        const filtered   = stockSummary.filter(s=>!stockFilter||(s.name+s.isin).toLowerCase().includes(stockFilter.toLowerCase()));
                        return (<>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Security Name</th>
                          <th className="font-mono">ISIN</th>
                          <th style={{textAlign:'right'}}>Current Bal</th>
                          {isHoldings ? (<>
                            <th style={{textAlign:'right'}}>Frozen Bal</th>
                            <th style={{textAlign:'right'}}>Pledge Bal</th>
                            <th style={{textAlign:'right'}}>Free Bal</th>
                            <th style={{textAlign:'right'}}>Mkt Price</th>
                            <th style={{textAlign:'right'}}>Value (₹)</th>
                          </>) : (<>
                            <th style={{textAlign:'right'}}>Total Bought</th>
                            <th style={{textAlign:'right'}}>Total Sold</th>
                            <th style={{textAlign:'right'}}>Closing Qty</th>
                            <th style={{textAlign:'right'}}>Last Updated</th>
                          </>)}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((s,i)=>(
                          <tr key={i}>
                            <td className="text-muted fs-12">{i+1}</td>
                            <td>
                              <div className="fw-600 fs-13" style={{maxWidth:220,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.name||'—'}</div>
                              <div className="fs-10 text-muted">{s.dpId&&`DP: ${s.dpId}`}</div>
                            </td>
                            <td><span className="font-mono fs-11" style={{background:'var(--bg3)',padding:'2px 6px',borderRadius:4,color:'var(--blue)'}}>{s.isin}</span></td>
                            <td className="font-mono fs-12" style={{textAlign:'right'}}>{s.opBal.toFixed(3)}</td>
                            {isHoldings ? (<>
                              <td className="font-mono fs-12" style={{textAlign:'right'}}>{(s.frozenBal||0).toFixed(3)}</td>
                              <td className="font-mono fs-12" style={{textAlign:'right'}}>{(s.pledgeBal||0).toFixed(3)}</td>
                              <td className="font-mono fs-12 amt-g" style={{textAlign:'right'}}>{(s.freeBal||0).toFixed(3)}</td>
                              <td className="font-mono fs-12" style={{textAlign:'right'}}>{s.mktPrice?`₹${fmt(s.mktPrice)}`:'—'}</td>
                              <td className="font-mono fw-800 fs-13" style={{textAlign:'right',color:'var(--blue)'}}>{s.value?`₹${fmt(s.value)}`:'—'}</td>
                            </>) : (<>
                            <td className="font-mono fs-12 amt-g" style={{textAlign:'right'}}>{s.totalCredits>0?`+${s.totalCredits.toFixed(3)}`:'—'}</td>
                            <td className="font-mono fs-12 amt-r" style={{textAlign:'right'}}>{s.totalDebits>0?`-${s.totalDebits.toFixed(3)}`:'—'}</td>
                            <td>
                              <span className="fw-800 fs-13 font-mono" style={{color:'var(--blue)',textAlign:'right',display:'block'}}>
                                {s.clBal.toFixed(3)}
                              </span>
                            </td>
                            <td className="font-mono fs-11 text-muted" style={{textAlign:'right'}}>{s.lastDate||'—'}</td>
                            </>)}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} className="text-muted fs-12" style={{padding:'8px 14px'}}>
                            TOTAL ({filtered.length} stocks)
                          </td>
                          <td className="font-mono fw-800 fs-12" style={{textAlign:'right',padding:'8px 14px'}}>
                            {filtered.reduce((a,s)=>a+s.opBal,0).toFixed(3)}
                          </td>
                          {isHoldings ? (<>
                            <td className="font-mono fw-800 fs-12" style={{textAlign:'right',padding:'8px 14px'}}>{filtered.reduce((a,s)=>a+(s.frozenBal||0),0).toFixed(3)}</td>
                            <td className="font-mono fw-800 fs-12" style={{textAlign:'right',padding:'8px 14px'}}>{filtered.reduce((a,s)=>a+(s.pledgeBal||0),0).toFixed(3)}</td>
                            <td className="font-mono fw-800 fs-12 amt-g" style={{textAlign:'right',padding:'8px 14px'}}>{filtered.reduce((a,s)=>a+(s.freeBal||0),0).toFixed(3)}</td>
                            <td/>
                            <td className="font-mono fw-800 fs-13" style={{textAlign:'right',padding:'8px 14px',color:'var(--blue)'}}>₹{fmt(filtered.reduce((a,s)=>a+(s.value||0),0))}</td>
                          </>) : (<>
                            <td className="font-mono fw-800 fs-12 amt-g" style={{textAlign:'right',padding:'8px 14px'}}>+{filtered.reduce((a,s)=>a+s.totalCredits,0).toFixed(3)}</td>
                            <td className="font-mono fw-800 fs-12 amt-r" style={{textAlign:'right',padding:'8px 14px'}}>-{filtered.reduce((a,s)=>a+s.totalDebits,0).toFixed(3)}</td>
                            <td className="font-mono fw-800 fs-13" style={{textAlign:'right',padding:'8px 14px',color:'var(--blue)'}}>{filtered.reduce((a,s)=>a+s.clBal,0).toFixed(3)}</td>
                            <td/>
                          </>)}
                        </tr>
                      </tfoot>
                        </>);
                      })()}
                    </table>
                  </div>
                </div>
              )}

              {/* Month-filtered transaction rows */}
              {monthFilter!=='all'&&(
                <div className="card">
                  <div className="fw-700 fs-14 mb-1">📅 Transactions for {monthFilter}</div>
                  <div className="fs-12 text-muted mb-3">{filteredStocks.length} records</div>
                  <div style={{overflowX:'auto'}}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>#</th><th>Security</th><th className="font-mono">ISIN</th>
                          <th style={{textAlign:'right'}}>Date</th>
                          <th style={{textAlign:'right'}}>Op. Bal</th>
                          <th style={{textAlign:'right'}}>Credit</th>
                          <th style={{textAlign:'right'}}>Debit</th>
                          <th style={{textAlign:'right'}}>Cl. Bal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStocks.map((s,i)=>(
                          <tr key={i}>
                            <td className="text-muted fs-12">{i+1}</td>
                            <td className="fw-600 fs-13" style={{maxWidth:200,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.name||'—'}</td>
                            <td><span className="font-mono fs-11" style={{background:'var(--bg3)',padding:'2px 5px',borderRadius:4,color:'var(--blue)'}}>{s.isin}</span></td>
                            <td className="font-mono fs-11 text-muted" style={{textAlign:'right'}}>{s.txDate||'—'}</td>
                            <td className="font-mono fs-12" style={{textAlign:'right'}}>{s.opBal.toFixed(3)}</td>
                            <td className="font-mono fs-12 amt-g" style={{textAlign:'right'}}>{s.credit>0?`+${s.credit.toFixed(3)}`:'—'}</td>
                            <td className="font-mono fs-12 amt-r" style={{textAlign:'right'}}>{s.debit>0?`-${s.debit.toFixed(3)}`:'—'}</td>
                            <td className="font-mono fw-800 fs-12" style={{textAlign:'right',color:'var(--blue)'}}>{s.clBal.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── MONTHLY TAB ─── */}
          {tab==='monthly'&&(
            <div className="card">
              <div className="fw-700 fs-14 mb-1">📅 Monthly Portfolio Records</div>
              <div className="fs-12 text-muted mb-3">{timeline.length} months from {first?.label} to {last?.label}</div>
              <div style={{overflowX:'auto'}}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Month</th>
                      <th style={{textAlign:'right'}}>Portfolio Value</th>
                      <th style={{textAlign:'right'}}>Change (₹)</th>
                      <th style={{textAlign:'right'}}>Change %</th>
                      <th style={{textAlign:'right'}}>Gain from Start</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.map((m,i)=>(
                      <tr key={i}>
                        <td className="text-muted fs-12">{i+1}</td>
                        <td className="fw-700 fs-13">{m.label}</td>
                        <td className="amt fw-800" style={{textAlign:'right'}}>₹{fmt(m.totalValue)}</td>
                        <td style={{textAlign:'right'}}>
                          {i===0?<span className="text-muted fs-12">Base</span>
                            :<span className={`fw-700 fs-12 ${m.change>=0?'amt-g':'amt-r'}`}>{m.change>=0?'+':''}₹{fmt(m.change)}</span>}
                        </td>
                        <td style={{textAlign:'right'}}>
                          {i===0?<span className="text-muted fs-12">—</span>
                            :<span className={`fw-700 fs-12 ${m.changePct>=0?'amt-g':'amt-r'}`}>{m.changePct>=0?'+':''}{m.changePct}%</span>}
                        </td>
                        <td style={{textAlign:'right'}}>
                          <span className={`fw-600 fs-12 ${m.cumChange>=0?'amt-g':'amt-r'}`}>{m.cumChange>=0?'+':''}₹{fmt(m.cumChange)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="text-muted fs-12" style={{padding:'8px 14px'}}>{first?.label} → {last?.label}</td>
                      <td className="amt fw-900 fs-14" style={{textAlign:'right',padding:'8px 14px'}}>₹{fmt(last?.totalValue||0)}</td>
                      <td style={{textAlign:'right',padding:'8px 14px'}}><span className={`fw-800 fs-13 ${totalChg>=0?'amt-g':'amt-r'}`}>{totalChg>=0?'+':''}₹{fmt(totalChg)}</span></td>
                      <td style={{textAlign:'right',padding:'8px 14px'}}><span className={`fw-800 fs-13 ${totalPct>=0?'amt-g':'amt-r'}`}>{totalPct>=0?'+':''}{totalPct}%</span></td>
                      <td/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ─── COMPARISON TAB ─── */}
          {tab==='comparison'&&(
            <div>
              <div className="card" style={{marginBottom:14}}>
                <div className="fw-700 fs-14 mb-1">📈 Total Portfolio Value</div>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={timeline}>
                    <defs><linearGradient id="gC1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#667eea" stopOpacity={0.4}/><stop offset="95%" stopColor="#667eea" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border2)"/>
                    <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--t3)'}} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'var(--t3)'}} tickFormatter={v=>`₹${shortNum(v)}`}/>
                    <Tooltip content={<ChartTip/>}/>
                    <Area type="monotone" dataKey="totalValue" stroke="#667eea" fill="url(#gC1)" strokeWidth={2.5} name="Portfolio Value" dot={{r:4,fill:'#667eea'}}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="card" style={{marginBottom:14}}>
                <div className="fw-700 fs-14 mb-1">📊 Monthly Change (₹)</div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={timeline.slice(1)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border2)"/>
                    <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--t3)'}} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'var(--t3)'}} tickFormatter={v=>`₹${shortNum(v)}`}/>
                    <Tooltip content={<ChangeTip/>}/>
                    <ReferenceLine y={0} stroke="var(--border)"/>
                    <Bar dataKey="change" name="Change" radius={[4,4,0,0]}>
                      {timeline.slice(1).map((e,i)=><Cell key={i} fill={e.change>=0?'#4ade80':'#f87171'}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card" style={{marginBottom:14}}>
                <div className="fw-700 fs-14 mb-1">💹 Monthly Return %</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={timeline.slice(1)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border2)"/>
                    <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--t3)'}} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'var(--t3)'}} tickFormatter={v=>`${v}%`}/>
                    <Tooltip formatter={v=>[`${v}%`,'Change %']} contentStyle={{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:10,fontSize:12}}/>
                    <ReferenceLine y={0} stroke="var(--border)"/>
                    <Bar dataKey="changePct" name="Return %" radius={[4,4,0,0]}>
                      {timeline.slice(1).map((e,i)=><Cell key={i} fill={e.changePct>=0?'#4ade80':'#f87171'}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="fw-700 fs-14 mb-1">📉 Cumulative Gain from {first?.label}</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={timeline}>
                    <defs><linearGradient id="gCum" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border2)"/>
                    <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--t3)'}} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'var(--t3)'}} tickFormatter={v=>`₹${shortNum(v)}`}/>
                    <Tooltip content={<ChangeTip/>}/>
                    <ReferenceLine y={0} stroke="var(--border)"/>
                    <Area type="monotone" dataKey="cumChange" stroke="#f59e0b" fill="url(#gCum)" strokeWidth={2} name="Cumulative Gain" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ─── MF SCHEMES TAB ─── */}
          {tab==='mfschemes'&&(
            <div>
              {(active.mfSchemes||[]).length>0 ? (active.mfSchemes||[]).map((h,i)=>(
                <div key={i} className="card" style={{marginBottom:12}}>
                  <div style={{display:'flex',gap:12,alignItems:'flex-start',marginBottom:10}}>
                    <div style={{width:34,height:34,borderRadius:10,background:COLORS[i%COLORS.length]+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>📈</div>
                    <div style={{flex:1}}>
                      <div className="fw-700 fs-14">{h.schemeName}</div>
                      <div className="fs-12 text-muted">{h.amcName}</div>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:7}}>
                    {[['Folio No',h.folioNumber],['Scheme Code',h.schemeCode||'—'],['ISIN',h.isin||'—'],['AMC',h.amcName]].map(([l,v])=>(
                      <div key={l} style={{background:'var(--bg3)',borderRadius:8,padding:'7px 11px'}}>
                        <div style={{fontSize:10,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:2}}>{l}</div>
                        <div style={{fontFamily:'monospace',fontSize:12,fontWeight:700,wordBreak:'break-all'}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )) : <div className="card" style={{padding:40,textAlign:'center',color:'var(--t3)'}}>No MF schemes found</div>}
            </div>
          )}

          {/* ─── HISTORY TAB ─── */}
          {tab==='history'&&(
            <div>
              {snapshots.length===0 ? (
                <div className="card" style={{padding:40,textAlign:'center',color:'var(--t3)'}}>
                  <span style={{fontSize:36,display:'block',marginBottom:10}}>🗄</span>
                  <div className="fw-600 fs-14">No saved snapshots yet</div>
                  <div className="fs-12 text-muted mt-2">Analyze a PDF and click 💾 Save to store a monthly snapshot in Firebase</div>
                </div>
              ) : (
                <div>
                  {snapshots.map(s=>(
                    <div key={s.id} className="card" style={{marginBottom:12}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                        <div>
                          <div className="fw-700 fs-15">📅 {s.monthKey}</div>
                          <div className="fs-12 text-muted">{s.holderName} · {s.sourceFile} · Saved: {s.savedAt?.slice(0,10)}</div>
                        </div>
                        <div style={{display:'flex',gap:8,alignItems:'center'}}>
                          <div style={{textAlign:'right'}}>
                            <div className="fs-11 text-muted">Portfolio</div>
                            <div className="fw-800 fs-15" style={{color:'var(--blue)'}}>₹{fmt(s.totalPortfolio)}</div>
                          </div>
                          <button onClick={()=>{setHistorySnap(s);setTab('overview');}} style={{padding:'6px 12px',borderRadius:8,border:'none',background:'var(--blue)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>View</button>
                          <button onClick={()=>deleteSnapshot(s.id)} style={{padding:'6px 10px',borderRadius:8,border:'1px solid var(--red)',background:'transparent',color:'var(--red)',fontSize:12,fontWeight:700,cursor:'pointer'}}>✕</button>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:16,marginTop:8,flexWrap:'wrap'}}>
                        <span className="fs-12 text-muted">🧾 {s.stocks?.length||0} stock rows</span>
                        <span className="fs-12 text-muted">📂 {s.mfSchemes?.length||0} MF schemes</span>
                        <span className="fs-12 text-muted">📅 {s.monthlyTimeline?.length||0} monthly records</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}