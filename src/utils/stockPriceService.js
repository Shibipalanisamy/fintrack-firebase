// ─── Live Stock Price Service ─────────────────────────────
// Uses your Google Apps Script Web App — calls GOOGLEFINANCE() on Google's servers
// No CORS issues, no API key, completely free

const CACHE = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// ⚠️ Paste your Google Apps Script Web App URL here after deploying
// It looks like: https://script.google.com/macros/s/XXXXXXXXXX/exec
let APPS_SCRIPT_URL = localStorage.getItem('fintrack_gas_url') || '';

export function setAppsScriptUrl(url) {
  APPS_SCRIPT_URL = url;
  localStorage.setItem('fintrack_gas_url', url);
}

export function getAppsScriptUrl() {
  return APPS_SCRIPT_URL;
}

export async function fetchLivePrices(symbols) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('NO_URL');
  }

  const unique = [...new Set(symbols.filter(Boolean).map(s => s.toUpperCase()))];

  // Check cache first
  const uncached = unique.filter(s => {
    const c = CACHE[s];
    return !c || Date.now() - c.ts >= CACHE_TTL;
  });

  const results = {};
  // Return cached prices for already-fetched symbols
  unique.forEach(s => { if (CACHE[s]) results[s] = CACHE[s].price; });

  if (uncached.length === 0) return results;

  // Call Google Apps Script Web App
  const url = `${APPS_SCRIPT_URL}?symbols=${encodeURIComponent(uncached.join(','))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Apps Script returned ${res.status}`);

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Apps Script did not return valid JSON — check deployment access is set to "Anyone" and that the URL is correct.');
  }
  if (!json.success) throw new Error(json.error || 'Apps Script error');

  Object.entries(json.prices || {}).forEach(([sym, data]) => {
    const price = data.price;
    if (price && price > 0) {
      CACHE[sym] = { price, ts: Date.now() };
      results[sym] = price;
    }
  });

  return results;
}