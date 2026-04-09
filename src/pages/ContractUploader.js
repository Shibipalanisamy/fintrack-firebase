import { useState, useRef, useEffect, useCallback } from 'react';
import { db, auth } from '../utils/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { stockMasterService, symbolMappingService } from '../utils/dbService';
import { fmt } from '../utils/helpers';
import toast from 'react-hot-toast';

// ─── PDF.js loader (CDN, no extra npm package needed) ──────
let pdfjsLib = null;
function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (pdfjsLib) { resolve(pdfjsLib); return; }
    if (window.pdfjsLib) { pdfjsLib = window.pdfjsLib; resolve(pdfjsLib); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);
  });
}

// ─── Extract all text from a (possibly password-protected) PDF ──
async function extractPdfText(file, password) {
  const lib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = lib.getDocument({
    data: arrayBuffer,
    password: password || '',
  });
  const pdf = await loadingTask.promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Sort items into reading order: descending Y (PDF Y=0 is bottom of page),
    // then ascending X within the same row. Without this sort, PDF.js returns
    // items in stream/draw order which is often column-by-column, scrambling rows.
    const items = content.items
      .map(item => ({ text: item.str, x: item.transform[4], y: item.transform[5] }))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    // Y-threshold of 8 handles minor baseline shifts between items on the same row
    // (subscripts, different font sizes). 3 was too tight for most contract notes.
    let lastY = null;
    for (const item of items) {
      if (lastY !== null && Math.abs(item.y - lastY) > 8) fullText += '\n';
      fullText += item.text + ' ';
      lastY = item.y;
    }
    fullText += '\n--- PAGE BREAK ---\n';
  }
  return fullText;
}

// ─── PARSERS ───────────────────────────────────────────────
// NOTE: These regex patterns are written for typical Indian broker
// contract note layouts. If the format changes, tune the patterns
// in parseAionion() and parseMstock() below.

function parseAionion(text) {
  /*
    Aionion (AIONION CAPITAL MARKET SERVICES) contract note layout:

    The MAIN TABLE (page 1) is a net-obligation table with no explicit B/S column
    and the security name split across multiple lines — very hard to parse reliably.

    The TRADE ANNEXURE (page 3) is clean and machine-readable:
      ORDER_NUM  HH:MM:SS  TRADE_NUM  HH:MM:SS  SECURITY NAME  B/S  QTY  PRICE  NET_RATE  NET_AMT  REMARK

    Example line (after PDF text extraction):
      1100000091585424  15:04:06  209355985  15:04:06  DR.REDDYS LABORATORIES LTD. B  1  1195.3000  1201.2765  1201.28  D

    Charges come from the Obligation Details block:
      Securities Transactions Tax (Rs.)   1.00 DR
      Taxable Value Of Supply (Brokerage) 6.16 DR
      CGST* RATE:9% AMOUNT (RS.)          0.56 DR
      SGST* RATE:9% AMOUNT (RS.)          0.56 DR
  */
  const trades = [];

  // ── Trade Date ──
  const dateMatch = text.match(/Trade\s*Date\s*[:\s]+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i)
    || text.match(/Date\s*:\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
  const tradeDate = dateMatch ? dateMatch[1] : '';

  // ── Settlement No ──
  const settlementMatch = text.match(/Settlement\s*No\s+(\d+)/i);
  const settlementNo = settlementMatch ? settlementMatch[1].trim() : '';

  // ── Charges from Obligation Details block ──
  // STT
  const sttMatch = text.match(/Securities\s*Transactions?\s*Tax[^0-9]*([\d,]+\.?\d*)/i);
  // Brokerage (Taxable Value of Supply line)
  const brokerageDocMatch = text.match(/Taxable\s*Value\s*Of\s*Supply\s*\(Brokerage\)[^0-9]*([\d,]+\.?\d*)/i);
  // CGST + SGST summed → total GST
  const cgstMatch = text.match(/CGST[^0-9]*([\d,]+\.?\d*)\s*DR/i);
  const sgstMatch = text.match(/SGST[^0-9]*([\d,]+\.?\d*)\s*DR/i);
  const igstMatch = text.match(/IGST[^0-9]*([\d,]+\.?\d*)\s*DR/i);
  const gstTotal  = parseNum(cgstMatch?.[1]) + parseNum(sgstMatch?.[1]) + parseNum(igstMatch?.[1]);
  // Stamp duty (may not appear in all notes)
  const stampMatch = text.match(/Stamp\s*Duty[^0-9]*([\d,]+\.?\d*)/i);
  // Exchange / TOC charges
  const exchMatch = text.match(/Toc\s*Nse\s*Exchange[^0-9]*([\d,]+\.?\d*)/i)
    || text.match(/Exchange\s*(?:Transaction\s*)?Charges?[^0-9]*([\d,]+\.?\d*)/i);

  // Total brokerage from the document (spread across all trades proportionally later if needed)
  const docBrokerage = parseNum(brokerageDocMatch?.[1]);

  const charges = {
    stt:         parseNum(sttMatch?.[1]),
    gst:         gstTotal,
    stampDuty:   parseNum(stampMatch?.[1]),
    exchCharges: parseNum(exchMatch?.[1]),
  };

  // ── Parse Trade Annexure ──
  // The annexure section starts with "Trade Annexure" header.
  // Each trade row has: long_order_num  time  trade_num  time  SECURITY NAME  B/S  qty  price  net_rate  net_amt
  //
  // Regex breakdown:
  //   \d{10,}           — order number (10+ digits)
  //   \s+\d{2}:\d{2}:\d{2}  — order time
  //   \s+\d+            — trade number
  //   \s+\d{2}:\d{2}:\d{2}  — trade time
  //   \s+(.+?)          — security name (non-greedy, stops before B/S)
  //   \s+(B|S)          — buy or sell flag
  //   \s+(\d+)          — quantity
  //   \s+([\d.]+)       — price
  //   \s+([\d.]+)       — net rate (price + brokerage per share)
  //   \s+([\d.]+)       — net amount
  const annexureRe = /\d{10,}\s+\d{2}:\d{2}:\d{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+(.+?)\s+(B|S)\s+(\d[\d,]*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/g;
  let m;
  while ((m = annexureRe.exec(text)) !== null) {
    const rawName = m[1].trim();
    // Derive a short symbol from the security name:
    // Remove common suffixes, take meaningful uppercase words
    const symbol = rawName
      .replace(/\bLIMITED\b|\bLTD\.?\b|\bTHE\b|\bAND\b|\b&\b/gi, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('_')
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '');

    const qty      = parseNum(m[3]);
    const rate     = parseNum(m[4]);
    const netRate  = parseNum(m[5]);
    const netAmt   = parseNum(m[6]);
    // Brokerage per trade = (netRate - rate) * qty
    const brokerage = Math.round((netRate - rate) * qty * 100) / 100;
    const grossAmt  = Math.round(rate * qty * 100) / 100;

    trades.push({
      source:      'Aionion',
      tradeDate,
      settlementNo,
      symbol,
      securityName: rawName,   // full name stored for reference
      buySell:     m[2] === 'B' ? 'BUY' : 'SELL',
      qty,
      rate,
      grossAmt,
      brokerage,
      netAmt,
      ...charges,
    });
  }

  // ── Fallback: parse ISIN rows from the main obligation table ──
  // Used only when the annexure section is absent (older note format).
  // Row looks like: INE089A01031  PARTIAL_NAME  BUY_QTY  WAP  BROKERAGE_PER_SH  TOTAL_AFTER_BROK  ...  NET_OBLIGATION
  if (trades.length === 0) {
    const isinRowRe = /(INE[A-Z0-9]{10})\s+[\w\s.\/]+?\s+(\d+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+\d+\s+([-\d,]+\.?\d*)/g;
    while ((m = isinRowRe.exec(text)) !== null) {
      const netObligation = parseNum(m[6].replace('-', ''));
      const buySell = m[6].includes('-') ? 'BUY' : 'SELL'; // DR (negative) = BUY obligation
      trades.push({
        source:      'Aionion',
        tradeDate,
        settlementNo,
        symbol:      m[1], // use ISIN as symbol fallback
        buySell,
        qty:         parseNum(m[2]),
        rate:        parseNum(m[3]),
        grossAmt:    parseNum(m[3]) * parseNum(m[2]),
        brokerage:   parseNum(m[4]) * parseNum(m[2]),
        netAmt:      netObligation,
        ...charges,
      });
    }
  }

  return trades;
}

function parseMstock(text) {
  /*
    Mstock (Mirae Asset) contract notes have a structured table:
    Sr | Symbol | ISIN | Buy/Sell | Qty | Avg Price | Gross | Brokerage | Net
    with separate charge summary at bottom.
  */
  const trades = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Trade Date ──
  // Mstock uses "TRADE DATE   Apr 07 2026" (text month) — must be matched first
  // before the DD/MM/YYYY fallback which would grab the settlement date instead.
  const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
  const textMonthMatch = text.match(/TRADE\s*DATE[:\s]+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/i);
  let tradeDate = '';
  if (textMonthMatch) {
    const mon = textMonthMatch[1].toLowerCase();
    const dd  = textMonthMatch[2].padStart(2, '0');
    const mm  = String((MONTHS[mon] ?? 0) + 1).padStart(2, '0');
    const yyyy = textMonthMatch[3];
    tradeDate = `${dd}/${mm}/${yyyy}`;   // normalise to DD/MM/YYYY like rest of app
  } else {
    const dateMatch = text.match(/Trade\s*Date[:\s]+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
    tradeDate = dateMatch ? dateMatch[1] : '';
  }

  // ── Settlement ──
  // Mstock contract notes label it "SETTLEMENT NO." followed by a number on the
  // same line, e.g. "SETTLEMENT NO.   2026064 Normal T1".
  // The old regex grabbed any alpha-numeric blob which often matched dates.
  const settlementMatch = text.match(/SETTLEMENT\s*NO[.\s:]+(\d+)/i);
  const settlementNo = settlementMatch ? settlementMatch[1].trim() : '';

  // ── Document-level charges ──
  const sttMatch    = text.match(/STT\s*[:\-]?\s*(?:Rs\.?\s*)?([\d,]+\.?\d*)/i);
  const gstMatch    = text.match(/(?:CGST|SGST|GST|IGST)\s*[:\-]?\s*(?:Rs\.?\s*)?([\d,]+\.?\d*)/i);
  const stampMatch  = text.match(/Stamp\s*Duty\s*[:\-]?\s*(?:Rs\.?\s*)?([\d,]+\.?\d*)/i);
  const exchMatch   = text.match(/(?:Exchange\s*(?:Transaction\s*)?Charges?|SEBI\s*Charges?)\s*[:\-]?\s*(?:Rs\.?\s*)?([\d,]+\.?\d*)/i);

  const charges = {
    stt:         parseNum(sttMatch?.[1]),
    gst:         parseNum(gstMatch?.[1]),
    stampDuty:   parseNum(stampMatch?.[1]),
    exchCharges: parseNum(exchMatch?.[1]),
  };

  // ── Strategy 1: Contract Note Annexure (primary) ──
  // Mstock contract notes include a "Contract Note Annexure" page with rows:
  // ORDER_NUM  HH:MM:SS  TRADE_NUM  HH:MM:SS  EXCHANGE_SEGMENT  SYMBOL  BUY/SELL  QTY  PRICE  BROKERAGE  NET_RATE  BROKERAGE_TOT  NET_AMT
  // e.g.: 1200000088505627  15:17:32  406673236  15:17:32  NSE - M  NIPPONAMC - NETFPHAR  BUY  1  22.4400  0.0000  22.4400  0.0000  -22.4400
  // Exchange segment is always "NSE - M", "BSE - M", "NSE - E" etc.
  // Using an explicit pattern (instead of the old non-greedy [A-Z\s\-]+?) prevents
  // the trailing letter (e.g. "M") from leaking into the captured security name.
  const annexureRe = /\d{10,}\s+\d{2}:\d{2}:\d{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+(?:NSE|BSE|MCX|NFO|CDS|BFO|BCD)\s*-\s*[A-Z]+\s+([A-Z][A-Z0-9\s\-\.&]+?)\s+(BUY|SELL)\s+(\d[\d,]*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([-\d,]+\.?\d*)/gi;
  let am;
  while ((am = annexureRe.exec(text)) !== null) {
    const rawName  = am[1].trim();
    // Derive a short symbol: take first 2 meaningful words, strip spaces
    const symbol = rawName.replace(/\s+/g, '-').toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 20);
    const qty      = parseNum(am[3]);
    const rate     = parseNum(am[4]);
    const netRate  = parseNum(am[7]);
    const netAmt   = Math.abs(parseNum(am[8]));
    const brokerage = Math.round((netRate - rate) * qty * 100) / 100;
    const grossAmt  = Math.round(rate * qty * 100) / 100;
    trades.push({
      source:    'Mstock',
      tradeDate,
      settlementNo,
      symbol,
      securityName: rawName,
      buySell:   am[2].toUpperCase(),
      qty,
      rate,
      grossAmt,
      brokerage: Math.max(0, brokerage),
      netAmt,
      ...charges,
    });
  }

  // ── Strategy 2: Mstock structured numbered row ──
  // Mstock obligation table has: 1  SYMBOL  ISIN  B  10  2450.50  24505.00  0.00  24505.00
  // Mstock typically has numbered rows: 1  RELIANCE  INE...  B  10  2450.50  24505.00  0.00  24505.00
  // NOTE: No ^ anchor — after Y-sort reconstruction the serial number may have
  // leading spaces or be merged with prior text on the same reconstructed line.
  if (trades.length === 0) {
  const rowRe = /\b\d+\s+([A-Z][A-Z0-9\-&]{1,20})\s+(?:INE[A-Z0-9]*)?\s*(B(?:UY)?|S(?:ELL)?)\s+([\d,]+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/i;

  for (const line of lines) {
    const m = line.match(rowRe);
    if (m) {
      trades.push({
        source:    'Mstock',
        tradeDate,
        settlementNo,
        symbol:    m[1].trim(),
        buySell:   m[2].toUpperCase().startsWith('B') ? 'BUY' : 'SELL',
        qty:       parseNum(m[3]),
        rate:      parseNum(m[4]),
        grossAmt:  parseNum(m[5]),
        brokerage: parseNum(m[6]),
        netAmt:    parseNum(m[7]),
        ...charges,
      });
    }
  }
  }

  // ── Strategy 3: Fallback broad scan ──
  if (trades.length === 0) {
    const broadRe = /([A-Z][A-Z0-9\-&]{2,20})\s+(BUY|SELL|B|S)\s+([\d,]+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/gi;
    let m;
    while ((m = broadRe.exec(text)) !== null) {
      trades.push({
        source:    'Mstock',
        tradeDate,
        settlementNo,
        symbol:    m[1].trim(),
        buySell:   m[2].toUpperCase().startsWith('B') ? 'BUY' : 'SELL',
        qty:       parseNum(m[3]),
        rate:      parseNum(m[4]),
        grossAmt:  parseNum(m[5]),
        brokerage: 0,
        netAmt:    parseNum(m[5]),
        ...charges,
      });
    }
  }

  return trades;
}

function parseNum(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/,/g, '')) || 0;
}

const PARSERS = { Aionion: parseAionion, Mstock: parseMstock };
export const SOURCES = ['Mstock', 'Aionion'];   // ← add this line


// ─── Save to Firestore ──────────────────────────────────────
async function saveContractTrades(trades, fileName) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not logged in');
  const ref = collection(db, 'contractTrades');
  const batch = trades.map(t =>
    addDoc(ref, { ...t, userId: uid, fileName, importedAt: serverTimestamp() })
  );
  await Promise.all(batch);
}

// ─── Load saved contracts from Firestore ───────────────────
async function loadSavedTrades() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(
    collection(db, 'contractTrades'),
    where('userId', '==', uid),
    orderBy('importedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Main Component ─────────────────────────────────────────
export default function ContractUploader({ onClose, onTradesSaved }) {
  const [source, setSource]             = useState('Mstock');
  const [file, setFile]                 = useState(null);
  const [password, setPassword]         = useState('');
  const [showPwd, setShowPwd]           = useState(false);
  const [extracting, setExtracting]     = useState(false);
  const [saving, setSaving]             = useState(false);
  const [preview, setPreview]           = useState(null);
  const [rawOpen, setRawOpen]           = useState(false);
  const [savedTrades, setSavedTrades]   = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [histTab, setHistTab]           = useState('import');
  const [deleting, setDeleting]         = useState(null);
  const [expandedGroup, setExpandedGroup]   = useState(null);
  const [checkedTrades, setCheckedTrades]   = useState({});
  const [pushingToHoldings, setPushingToHoldings] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [editForm, setEditForm]         = useState({});
  const [settingsSymbols, setSettingsSymbols] = useState([]);  // symbols from Settings page
  // symbolMappings: Map keyed "broker::securityName" → googleSymbol (persisted in Firestore)
  const [symbolMappings, setSymbolMappings]   = useState({});
  // tradeGoogleSymbols: per-trade overrides for the current preview { [tradeIndex]: googleSymbol }
  const [tradeGoogleSymbols, setTradeGoogleSymbols] = useState({});
  const fileRef = useRef(null);
  const dragRef = useRef(null);

  // Load history on mount
  useEffect(() => {
    setLoadingHistory(true);
    loadSavedTrades()
      .then(setSavedTrades)
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, []);

  // Load symbols from Settings → 📈 Stock Master
  useEffect(() => {
    stockMasterService.getAll()
      .then(stocks => {
        // Store full objects so the dropdown can show symbol + name
        const sorted = [...stocks].sort((a, b) => a.symbol.localeCompare(b.symbol));
        setSettingsSymbols(sorted);
      })
      .catch(() => {});
  }, []);

  // Load all broker→symbol mappings from Firestore once on mount
  useEffect(() => {
    symbolMappingService.getAllAsMap()
      .then(map => setSymbolMappings(map))
      .catch(() => {});
  }, []);

  // ── Drag & Drop ──
  const handleDrop = useCallback(e => {
    e.preventDefault();
    dragRef.current?.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') setFile(f);
    else toast.error('Please drop a PDF file');
  }, []);

  // ── Extract ──
  const extract = async () => {
    if (!file) { toast.error('Choose a PDF first'); return; }
    setExtracting(true);
    setPreview(null);
    setTradeGoogleSymbols({});
    try {
      const rawText = await extractPdfText(file, password);
      const parser  = PARSERS[source];
      const trades  = parser(rawText);

      // Auto-apply saved symbol mappings: if we have a mapping for this broker+securityName,
      // pre-fill the googleSymbol so the user doesn't have to fix it manually again.
      const autoOverrides = {};
      trades.forEach((t, i) => {
        const key = `${t.source}::${t.securityName || t.symbol}`;
        if (symbolMappings[key]) {
          autoOverrides[i] = symbolMappings[key];
        }
      });
      setTradeGoogleSymbols(autoOverrides);

      setPreview({ trades, rawText });
      if (trades.length === 0) {
        toast('⚠️ No trades found — check raw text & parser patterns', { icon: '⚠️', duration: 5000 });
      } else {
        const autoCount = Object.keys(autoOverrides).length;
        toast.success(`Found ${trades.length} trade${trades.length > 1 ? 's' : ''}${autoCount > 0 ? ` · ${autoCount} symbol${autoCount > 1 ? 's' : ''} auto-mapped ✨` : ''}`);
      }
    } catch (err) {
      if (err.message?.includes('password')) {
        toast.error('Wrong password or PDF is not password-protected');
      } else {
        toast.error('Error reading PDF: ' + err.message);
      }
    } finally {
      setExtracting(false);
    }
  };

  // ── Save extracted trades to Firestore ──
  const save = async () => {
    if (!preview?.trades?.length) return;
    setSaving(true);
    try {
      // Attach resolved googleSymbol to each trade before saving
      const tradesToSave = preview.trades.map((t, i) => ({
        ...t,
        googleSymbol: tradeGoogleSymbols[i] || t.symbol || '',
      }));
      await saveContractTrades(tradesToSave, file.name);
      if (onTradesSaved) {
        const buyTrades = tradesToSave.filter(t => t.buySell === 'BUY');
        if (buyTrades.length > 0) await onTradesSaved(buyTrades);
      }
      toast.success(`Saved ${tradesToSave.length} trades ✅`);
      setPreview(null);
      setFile(null);
      setPassword('');
      setTradeGoogleSymbols({});
      const fresh = await loadSavedTrades();
      setSavedTrades(fresh);
      setHistTab('history');
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Handle Google Symbol override in preview table ──
  // Called when the user picks/types a corrected symbol for a trade row.
  // Persists the broker→symbol mapping so future PDFs auto-correct the same name.
  const handleGoogleSymbolChange = async (tradeIndex, trade, googleSymbol) => {
    const val = (googleSymbol || '').toUpperCase().trim();
    setTradeGoogleSymbols(p => ({ ...p, [tradeIndex]: val }));
    if (!val) return;
    try {
      const brokerSymbol = trade.securityName || trade.symbol;
      await symbolMappingService.upsert(trade.source, brokerSymbol, val);
      // Update local map so subsequent extracts in the same session reflect the new mapping
      const key = `${trade.source}::${brokerSymbol}`;
      setSymbolMappings(p => ({ ...p, [key]: val }));
    } catch {
      // Silent — mapping save failing shouldn't block the user
    }
  };

  // ── Delete saved trade ──
  const deleteTrade = async (id) => {
    setDeleting(id);
    try {
      await deleteDoc(doc(db, 'contractTrades', id));
      setSavedTrades(p => p.filter(t => t.id !== id));
      setCheckedTrades(p => { const n = { ...p }; delete n[id]; return n; });
      toast.success('Deleted');
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  // ── Checkbox helpers ──
  const toggleCheck = (id) => setCheckedTrades(p => ({ ...p, [id]: !p[id] }));

  const toggleGroupAll = (trades) => {
    const allChecked = trades.every(t => checkedTrades[t.id]);
    const next = { ...checkedTrades };
    trades.forEach(t => { next[t.id] = !allChecked; });
    setCheckedTrades(next);
  };

  // ── Push selected BUY trades → Holdings ──
  // This calls onTradesSaved which is handleContractTrades in PortfolioPage.
  // It saves each trade via investmentService.create(), reloads items, and
  // switches the tab to 'holdings' so the user can see the new records.
  const pushSelectedToHoldings = async () => {
    const selected = savedTrades.filter(t => checkedTrades[t.id] && t.buySell === 'BUY');
    if (!selected.length) { toast.error('Select at least one BUY trade'); return; }
    if (!onTradesSaved)   { toast.error('onTradesSaved handler not connected'); return; }
    setPushingToHoldings(true);
    try {
      // Apply saved symbol mappings to every trade before handing off to Holdings.
      // This fixes trades saved *before* googleSymbol existed, and trades where the
      // user set the mapping but the Firestore record predates the googleSymbol field.
      const resolved = selected.map(t => {
        const existingGoogle = (t.googleSymbol || '').trim();
        if (existingGoogle) return t; // already has a mapping saved on the record
        // Look up via the in-memory symbolMappings map
        const key = `${t.source}::${t.securityName || t.symbol}`;
        const mapped = symbolMappings[key];
        return mapped ? { ...t, googleSymbol: mapped } : t;
      });
      await onTradesSaved(resolved);
      setCheckedTrades({});
    } catch (err) {
      toast.error('Push failed: ' + err.message);
    } finally {
      setPushingToHoldings(false);
    }
  };

  // ── Inline edit: save to Firestore ──
  const saveEditedTrade = async () => {
    if (!editingTrade) return;
    try {
      const { updateDoc, doc: fsDoc } = await import('firebase/firestore');
      const payload = {
        symbol:    editForm.symbol    ?? editingTrade.symbol,
        buySell:   editForm.buySell   ?? editingTrade.buySell,
        qty:       Number(editForm.qty       ?? editingTrade.qty),
        rate:      Number(editForm.rate      ?? editingTrade.rate),
        grossAmt:  Number(editForm.grossAmt  ?? editingTrade.grossAmt),
        brokerage: Number(editForm.brokerage ?? editingTrade.brokerage),
        netAmt:    Number(editForm.netAmt    ?? editingTrade.netAmt),
        tradeDate: editForm.tradeDate ?? editingTrade.tradeDate,
      };
      await updateDoc(fsDoc(db, 'contractTrades', editingTrade.id), payload);
      setSavedTrades(p => p.map(t => t.id === editingTrade.id ? { ...t, ...payload } : t));
      toast.success('Trade updated');
      setEditingTrade(null);
      setEditForm({});
    } catch (err) {
      toast.error('Update failed: ' + err.message);
    }
  };

  // ── Summary stats for preview ──
  const previewSummary = preview?.trades ? {
    totalBuy:  preview.trades.filter(t => t.buySell === 'BUY').reduce((s,t)  => s + t.netAmt, 0),
    totalSell: preview.trades.filter(t => t.buySell === 'SELL').reduce((s,t) => s + t.netAmt, 0),
    totalBrokerage: preview.trades.reduce((s,t) => s + t.brokerage, 0),
    totalSTT:  preview.trades.reduce((s,t) => s + (t.stt || 0), 0),
  } : null;

  // ── Group history by fileName ──
  const historyGroups = savedTrades.reduce((acc, t) => {
    const key = t.fileName || 'Unknown';
    if (!acc[key]) acc[key] = { fileName: key, source: t.source, tradeDate: t.tradeDate, trades: [] };
    acc[key].trades.push(t);
    return acc;
  }, {});

  return (
    <div className="cu-root">
      <style>{`
        .cu-root {
          display: flex;
          flex-direction: row;
          gap: 0;
          min-height: 500;
          height: 100%;
        }
        .cu-left {
          width: 300px;
          min-width: 260px;
          border-right: 1px solid var(--border);
          padding: 20px 18px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex-shrink: 0;
        }
        .cu-right {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          min-width: 0;
        }
        .cu-right-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 300px;
          color: var(--t3);
          text-align: center;
          gap: 10px;
        }
        @media (max-width: 600px) {
          .cu-root {
            flex-direction: column;
            height: auto;
            min-height: unset;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }
          .cu-left {
            width: 100%;
            min-width: unset;
            border-right: none;
            border-bottom: 1px solid var(--border);
            padding: 16px;
          }
          .cu-right {
            padding: 16px;
            overflow-y: visible;
          }
          .cu-right-placeholder {
            min-height: 120px;
            font-size: 12px;
          }
          .cu-right-placeholder > div:first-child {
            font-size: 36px !important;
          }
        }
      `}</style>

      {/* ── Left Panel: Upload ── */}
      <div className="cu-left">

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ k: 'import', label: '📤 Import' }, { k: 'history', label: `🗂 History (${savedTrades.length})` }].map(t => (
            <button key={t.k} onClick={() => setHistTab(t.k)}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 10, border: '1.5px solid', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
                borderColor: histTab === t.k ? 'var(--blue)' : 'var(--border2)',
                background:  histTab === t.k ? 'rgba(77,158,255,.1)' : 'var(--bg3)',
                color:       histTab === t.k ? 'var(--blue)' : 'var(--t3)',
              }}>{t.label}</button>
          ))}
        </div>

        {histTab === 'import' && <>
          {/* Source selector */}
          <div>
            <div className="fs-12 fw-700 text-muted mb-2">Broker</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SOURCES.map(s => (
                <button key={s} onClick={() => setSource(s)}
                  style={{ padding: '10px 8px', borderRadius: 10, border: `2px solid ${source === s ? 'var(--blue)' : 'var(--border2)'}`, background: source === s ? 'rgba(77,158,255,.1)' : 'var(--bg3)', cursor: 'pointer', fontSize: 13, fontWeight: 800, color: source === s ? 'var(--blue)' : 'var(--t3)', transition: 'all .15s' }}>
                  {s === 'Mstock' ? '📈' : '🏦'} {s}
                </button>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <div>
            <div className="fs-12 fw-700 text-muted mb-2">Contract PDF</div>
            <div
              ref={dragRef}
              onDragOver={e => { e.preventDefault(); dragRef.current.style.borderColor = 'var(--blue)'; }}
              onDragLeave={() => { if (dragRef.current) dragRef.current.style.borderColor = file ? 'var(--green)' : 'var(--border2)'; }}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${file ? 'var(--green)' : 'var(--border2)'}`, borderRadius: 12, padding: '18px 12px', textAlign: 'center', cursor: 'pointer', background: file ? 'rgba(34,197,94,.05)' : 'var(--bg3)', transition: 'all .2s' }}>
              <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }}
                onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]); }} />
              {file
                ? <><div style={{ fontSize: 22, marginBottom: 4 }}>📄</div>
                    <div className="fs-12 fw-700" style={{ color: 'var(--green)', wordBreak: 'break-all' }}>{file.name}</div>
                    <div className="fs-11 text-muted mt-1">{(file.size / 1024).toFixed(1)} KB</div>
                    <button onClick={e => { e.stopPropagation(); setFile(null); setPreview(null); }}
                      style={{ marginTop: 6, fontSize: 10, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕ Remove</button>
                  </>
                : <><div style={{ fontSize: 28, marginBottom: 6 }}>📂</div>
                    <div className="fs-13 fw-700">Drop PDF here</div>
                    <div className="fs-11 text-muted mt-1">or click to browse</div>
                  </>
              }
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="fs-12 fw-700 text-muted mb-2">PDF Password <span className="fs-10" style={{ color: 'var(--t3)' }}>(if protected)</span></div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Leave blank if no password"
                className="fi"
                style={{ paddingRight: 40, fontFamily: 'monospace', fontSize: 13 }}
              />
              <button onClick={() => setShowPwd(p => !p)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--t3)' }}>
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* Extract button */}
          <button className="btn btn-primary" onClick={extract} disabled={extracting || !file}
            style={{ width: '100%', padding: '11px', fontWeight: 800, fontSize: 14 }}>
            {extracting ? <><span className="spin" /> Reading PDF…</> : '⚡ Extract Trades'}
          </button>

          {/* Firebase free note */}
          <div style={{ background: 'rgba(34,197,94,.07)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 10, padding: '10px 12px', fontSize: 11, color: 'var(--green)' }}>
            <div className="fw-800 mb-1">✅ 100% Free on Firebase Spark</div>
            <div style={{ color: 'var(--t3)', lineHeight: 1.5 }}>
              PDFs are parsed <strong>in your browser</strong> — never uploaded. Only the extracted trade data (tiny JSON) is saved to Firestore. Stays well within the 20K writes/day free limit.
            </div>
          </div>
        </>}

        {/* History list */}
        {histTab === 'history' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>

            {/* Push-to-holdings action bar */}
            {Object.values(checkedTrades).some(Boolean) && (
              <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(77,158,255,.1)', border: '1.5px solid var(--blue)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', flex: 1 }}>
                  {Object.values(checkedTrades).filter(Boolean).length} selected
                </span>
                <button onClick={pushSelectedToHoldings} disabled={pushingToHoldings}
                  style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', fontSize: 11, fontWeight: 800, cursor: pushingToHoldings ? 'not-allowed' : 'pointer' }}>
                  {pushingToHoldings ? '…' : '📥 Add to Holdings'}
                </button>
                <button onClick={() => setCheckedTrades({})}
                  style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--t3)', fontSize: 11, cursor: 'pointer' }}>✕</button>
              </div>
            )}

            {loadingHistory
              ? <div className="spin-center"><div className="spin" /></div>
              : Object.keys(historyGroups).length === 0
                ? <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 13 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                    No imported contracts yet
                  </div>
                : Object.values(historyGroups).map(g => {
                    const isExpanded  = expandedGroup === g.fileName;
                    const groupChecked = g.trades.every(t => checkedTrades[t.id]);
                    const groupPartial = !groupChecked && g.trades.some(t => checkedTrades[t.id]);
                    return (
                      <div key={g.fileName} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>

                        {/* Group header */}
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <input type="checkbox" checked={groupChecked}
                              ref={el => { if (el) el.indeterminate = groupPartial; }}
                              onChange={() => toggleGroupAll(g.trades)}
                              style={{ marginTop: 2, cursor: 'pointer', accentColor: 'var(--blue)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="fs-12 fw-800" style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{g.fileName}</div>
                              <div className="fs-11 text-muted mt-1">{g.source} · {g.tradeDate || 'No date'}</div>
                              <div className="fs-11 fw-700" style={{ color: 'var(--blue)', marginTop: 4 }}>{g.trades.length} trade{g.trades.length > 1 ? 's' : ''}</div>
                            </div>
                            <button onClick={() => setExpandedGroup(isExpanded ? null : g.fileName)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 13, fontWeight: 800, padding: '2px 4px', flexShrink: 0 }}>
                              {isExpanded ? '▲' : '▼'}
                            </button>
                          </div>

                          {/* Trade chips when collapsed */}
                          {!isExpanded && (
                            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {g.trades.map(t => (
                                <span key={t.id} style={{ fontSize: 10, background: t.buySell === 'BUY' ? 'rgba(34,197,94,.15)' : 'rgba(244,63,94,.15)', color: t.buySell === 'BUY' ? 'var(--green)' : 'var(--red)', borderRadius: 6, padding: '2px 6px', fontWeight: 700 }}>
                                  {t.buySell[0]} {t.symbol}
                                </span>
                              ))}
                            </div>
                          )}

                          <button onClick={() => { if (window.confirm(`Delete all ${g.trades.length} trades from "${g.fileName}"?`)) g.trades.forEach(t => deleteTrade(t.id)); }}
                            style={{ marginTop: 8, fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>
                            🗑 Delete all
                          </button>
                        </div>

                        {/* Expanded trade rows */}
                        {isExpanded && (
                          <div style={{ borderTop: '1px solid var(--border)' }}>
                            {g.trades.map((t, idx) => {
                              const isEditing = editingTrade?.id === t.id;
                              return (
                                <div key={t.id} style={{ padding: '8px 12px', borderBottom: idx < g.trades.length - 1 ? '1px solid var(--border)' : 'none', background: checkedTrades[t.id] ? 'rgba(77,158,255,.06)' : 'transparent' }}>
                                  {isEditing ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                        {/* Symbol: synced dropdown from Settings → Stock Master */}
                                        <div style={{ gridColumn: '1 / -1' }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', marginBottom: 2 }}>
                                            Symbol {settingsSymbols.length > 0 && <span style={{ color: 'var(--blue)', fontWeight: 400 }}>({settingsSymbols.length} from Stock Master)</span>}
                                          </div>
                                          <datalist id={`sym-${t.id}`}>
                                            {settingsSymbols.map(s => (
                                              <option key={s.symbol} value={s.symbol}>
                                                {s.name ? `${s.symbol} – ${s.name}` : s.symbol}
                                              </option>
                                            ))}
                                          </datalist>
                                          <input
                                            list={`sym-${t.id}`}
                                            value={editForm.symbol ?? t.symbol ?? ''}
                                            onChange={e => setEditForm(p => ({ ...p, symbol: e.target.value.toUpperCase() }))}
                                            placeholder={settingsSymbols.length > 0 ? 'Type or pick from Stock Master…' : 'e.g. RELIANCE'}
                                            style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: '1.5px solid var(--blue)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 11, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', fontWeight: 700 }} />
                                        </div>
                                        {[
                                          { label: 'Date',      key: 'tradeDate', type: 'text'   },
                                          { label: 'Qty',       key: 'qty',       type: 'number' },
                                          { label: 'Rate',      key: 'rate',      type: 'number' },
                                          { label: 'Gross',     key: 'grossAmt',  type: 'number' },
                                          { label: 'Brokerage', key: 'brokerage', type: 'number' },
                                          { label: 'Net Amt',   key: 'netAmt',    type: 'number' },
                                        ].map(f => (
                                          <div key={f.key}>
                                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', marginBottom: 2 }}>{f.label}</div>
                                            <input type={f.type}
                                              value={editForm[f.key] ?? t[f.key] ?? ''}
                                              onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                                              style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: '1.5px solid var(--blue)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                                          </div>
                                        ))}
                                        <div>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', marginBottom: 2 }}>Type</div>
                                          <select value={editForm.buySell ?? t.buySell}
                                            onChange={e => setEditForm(p => ({ ...p, buySell: e.target.value }))}
                                            style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: '1.5px solid var(--blue)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 11 }}>
                                            <option value="BUY">BUY</option>
                                            <option value="SELL">SELL</option>
                                          </select>
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                                        <button onClick={saveEditedTrade} style={{ flex: 1, padding: '5px', borderRadius: 7, border: 'none', background: 'var(--green)', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>✓ Save</button>
                                        <button onClick={() => { setEditingTrade(null); setEditForm({}); }} style={{ flex: 1, padding: '5px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--t3)', fontSize: 11, cursor: 'pointer' }}>✕ Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                      <input type="checkbox" checked={!!checkedTrades[t.id]}
                                        onChange={() => toggleCheck(t.id)}
                                        style={{ marginTop: 3, cursor: 'pointer', accentColor: 'var(--blue)', flexShrink: 0 }} />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                          <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: 'var(--blue)' }}>{t.symbol}</span>
                                          <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 20, padding: '1px 6px',
                                            background: t.buySell === 'BUY' ? 'rgba(34,197,94,.15)' : 'rgba(244,63,94,.15)',
                                            color: t.buySell === 'BUY' ? 'var(--green)' : 'var(--red)' }}>
                                            {t.buySell}
                                          </span>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                                          Qty: <strong style={{ color: 'var(--text)' }}>{t.qty?.toLocaleString('en-IN')}</strong>
                                          &nbsp;·&nbsp;Rate: <strong style={{ color: 'var(--text)' }}>₹{fmt(t.rate)}</strong>
                                          &nbsp;·&nbsp;Net: <strong style={{ color: 'var(--text)' }}>₹{fmt(t.netAmt)}</strong>
                                        </div>
                                        {t.tradeDate && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{t.tradeDate}</div>}
                                      </div>
                                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                        <button onClick={() => { setEditingTrade(t); setEditForm({}); }} title="Edit"
                                          style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--blue)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏️</button>
                                        <button onClick={() => { if (window.confirm(`Delete ${t.symbol} trade?`)) deleteTrade(t.id); }}
                                          disabled={deleting === t.id} title="Delete"
                                          style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid rgba(244,63,94,.3)', background: 'rgba(244,63,94,.08)', color: 'var(--red)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          {deleting === t.id ? '…' : '🗑'}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
            }
          </div>
        )}
      </div>

      {/* ── Right Panel: Preview ── */}
      <div className="cu-right">
        {!preview && !extracting && (
          <div className="cu-right-placeholder">
            <div style={{ fontSize: 56 }}>📋</div>
            <div className="fs-15 fw-700">Upload a contract PDF</div>
            <div className="fs-13">Choose your broker, drop the PDF, enter password if needed,<br />then click ⚡ Extract Trades</div>
          </div>
        )}

        {extracting && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300, gap: 12 }}>
            <div className="spin spin-lg" />
            <div className="fs-14 fw-700" style={{ color: 'var(--blue)' }}>Reading PDF…</div>
            <div className="fs-12 text-muted">Decrypting & extracting trade data</div>
          </div>
        )}

        {preview && !extracting && (
          <div>
            {/* Header */}
            <div className="flex justify-between items-center mb-4" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div className="fs-16 fw-800">🧾 Extracted Trades</div>
                <div className="fs-12 text-muted mt-1">{source} · {file?.name}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setRawOpen(p => !p)}
                  style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--t3)' }}>
                  {rawOpen ? '▲ Hide Raw' : '▼ Raw Text'}
                </button>
                {preview.trades.length > 0 && (
                  <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}
                    style={{ fontWeight: 800 }}>
                    {saving ? <><span className="spin" /> Saving…</> : `💾 Save ${preview.trades.length} Trades`}
                  </button>
                )}
              </div>
            </div>

            {/* Summary cards */}
            {previewSummary && preview.trades.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Total Trades', val: preview.trades.length,                         c: 'var(--blue)',   icon: '🔢' },
                  { label: 'Buy Value',    val: `₹${fmt(previewSummary.totalBuy)}`,             c: 'var(--green)',  icon: '📈' },
                  { label: 'Sell Value',   val: `₹${fmt(previewSummary.totalSell)}`,            c: 'var(--red)',    icon: '📉' },
                  { label: 'Brokerage',   val: `₹${fmt(previewSummary.totalBrokerage)}`,        c: 'var(--orange)', icon: '💼' },
                  { label: 'STT',         val: `₹${fmt(previewSummary.totalSTT)}`,              c: 'var(--purple)', icon: '🏛' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 16, marginBottom: 2 }}>{s.icon}</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: s.c }}>{s.val}</div>
                    <div className="fs-11 text-muted">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* No trades warning */}
            {preview.trades.length === 0 && (
              <div style={{ background: 'rgba(244,63,94,.07)', border: '1px solid rgba(244,63,94,.2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div className="fs-14 fw-800" style={{ color: 'var(--red)' }}>⚠️ No trades extracted</div>
                <div className="fs-12 text-muted mt-2" style={{ lineHeight: 1.6 }}>
                  The parser didn't find trade rows. Try:<br />
                  1. Check the <strong>Raw Text</strong> below to see what was extracted<br />
                  2. Verify the correct broker is selected<br />
                  3. If the PDF layout is different, the regex patterns in <code>parseAionion()</code> / <code>parseMstock()</code> may need tuning
                </div>
              </div>
            )}

            {/* Trade table */}
            {preview.trades.length > 0 && (
              <div className="tbl-wrap">
                <table className="tbl" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Broker Symbol</th>
                      <th style={{ minWidth: 160 }}>
                        Google Symbol
                        <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--t3)', marginLeft: 4 }}>
                          (Stock Master)
                        </span>
                      </th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Rate</th>
                      <th style={{ textAlign: 'right' }}>Gross</th>
                      <th style={{ textAlign: 'right' }}>Brokerage</th>
                      <th style={{ textAlign: 'right' }}>Net Amt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.trades.map((t, i) => {
                      const googleSym = tradeGoogleSymbols[i] || '';
                      const isAutoMapped = !!symbolMappings[`${t.source}::${t.securityName || t.symbol}`];
                      return (
                      <tr key={i}>
                        <td className="text-muted fs-12">{i + 1}</td>
                        <td>
                          <span className="badge badge-r fs-12">{t.symbol}</span>
                          {t.securityName && t.securityName !== t.symbol && (
                            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.securityName}>
                              {t.securityName}
                            </div>
                          )}
                        </td>
                        <td style={{ minWidth: 160 }}>
                          {/* Google Symbol picker — linked to Stock Master */}
                          <datalist id={`gsym-${i}`}>
                            {settingsSymbols.map(s => (
                              <option key={s.symbol} value={s.symbol}>
                                {s.name ? `${s.symbol} – ${s.name}` : s.symbol}
                              </option>
                            ))}
                          </datalist>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              list={`gsym-${i}`}
                              value={googleSym}
                              onChange={e => handleGoogleSymbolChange(i, t, e.target.value)}
                              placeholder="Pick or type…"
                              style={{
                                width: '100%', padding: '3px 6px', borderRadius: 6,
                                border: `1.5px solid ${googleSym ? 'var(--green)' : 'var(--border2)'}`,
                                background: googleSym ? 'rgba(34,197,94,.07)' : 'var(--bg3)',
                                color: 'var(--text)', fontSize: 11, outline: 'none',
                                fontFamily: 'monospace', fontWeight: 700, boxSizing: 'border-box',
                              }}
                            />
                            {isAutoMapped && googleSym && (
                              <span title="Auto-mapped from saved rules" style={{ fontSize: 10, color: 'var(--blue)', flexShrink: 0 }}>✨</span>
                            )}
                          </div>
                          {!googleSym && (
                            <div style={{ fontSize: 9, color: 'var(--orange)', marginTop: 2 }}>
                              ⚠ No mapping yet
                            </div>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 20, padding: '2px 8px',
                            background: t.buySell === 'BUY' ? 'rgba(34,197,94,.15)' : 'rgba(244,63,94,.15)',
                            color: t.buySell === 'BUY' ? 'var(--green)' : 'var(--red)' }}>
                            {t.buySell === 'BUY' ? '▲' : '▼'} {t.buySell}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{t.qty.toLocaleString('en-IN')}</td>
                        <td style={{ textAlign: 'right' }}><span className="amt">₹{fmt(t.rate)}</span></td>
                        <td style={{ textAlign: 'right' }}><span className="amt">₹{fmt(t.grossAmt)}</span></td>
                        <td style={{ textAlign: 'right', color: 'var(--orange)', fontWeight: 700 }}>₹{fmt(t.brokerage)}</td>
                        <td style={{ textAlign: 'right' }}><span className="amt amt-r fw-800">₹{fmt(t.netAmt)}</span></td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="text-muted fs-12" style={{ padding: '10px 14px' }}>TOTAL ({preview.trades.length} trades)</td>
                      <td style={{ textAlign: 'right', padding: '10px 14px', fontFamily: 'monospace', fontWeight: 800 }}>
                        {preview.trades.reduce((s, t) => s + t.qty, 0).toLocaleString('en-IN')}
                      </td>
                      <td />
                      <td style={{ textAlign: 'right', padding: '10px 14px' }}>
                        <span className="amt fw-800">₹{fmt(preview.trades.reduce((s, t) => s + t.grossAmt, 0))}</span>
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--orange)', fontWeight: 800 }}>
                        ₹{fmt(preview.trades.reduce((s, t) => s + t.brokerage, 0))}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 14px' }}>
                        <span className="amt amt-r fw-800">₹{fmt(preview.trades.reduce((s, t) => s + t.netAmt, 0))}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Charges breakdown */}
            {preview.trades.length > 0 && (preview.trades[0].stt > 0 || preview.trades[0].gst > 0 || preview.trades[0].stampDuty > 0) && (
              <div style={{ marginTop: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                <div className="fs-12 fw-700 mb-2 text-muted">📋 Charges (from contract)</div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[
                    { label: 'STT',          val: preview.trades[0].stt },
                    { label: 'GST',          val: preview.trades[0].gst },
                    { label: 'Stamp Duty',   val: preview.trades[0].stampDuty },
                    { label: 'Exch Charges', val: preview.trades[0].exchCharges },
                  ].filter(c => c.val > 0).map(c => (
                    <div key={c.label}>
                      <div className="fs-11 text-muted">{c.label}</div>
                      <div className="fs-13 fw-800" style={{ color: 'var(--orange)' }}>₹{fmt(c.val)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw text viewer */}
            {rawOpen && (
              <div style={{ marginTop: 16 }}>
                <div className="fs-12 fw-700 text-muted mb-2">🔍 Raw Extracted Text <span style={{ fontWeight: 400 }}>(use this to tune parser patterns)</span></div>
                <textarea
                  readOnly
                  value={preview.rawText}
                  style={{ width: '100%', minHeight: 260, fontFamily: 'monospace', fontSize: 11, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 12px', color: 'var(--t3)', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}