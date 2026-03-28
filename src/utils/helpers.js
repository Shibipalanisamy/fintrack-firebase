import { format } from 'date-fns';

// Indian number format: 1,00,00,000.00
export const fmt = (n) => {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtDate = (d) => {
  try {
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return format(dt, 'dd MMM yyyy');
  } catch { return '—'; }
};
export const fmtDateInput = (d) => {
  try {
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    return format(dt, 'yyyy-MM-dd');
  } catch { return ''; }
};
export const today = () => format(new Date(), 'yyyy-MM-dd');
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const PALETTE = ['#f97316','#22c55e','#93c5fd','#a78bfa','#fbbf24','#fb923c','#f43f5e','#d8b4fe','#38bdf8','#fb7185','#6ee7b7','#94a3b8','#10d98a','#3b9eed','#e879f9','#facc15'];

export const exportCSV = (data, filename) => {
  if (!data.length) return;
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(r => Object.values(r).map(v => `"${v}"`).join(','));
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

export const importCSV = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      // Strip BOM, normalize \r\n → \n
      let text = e.target.result.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = text.split('\n').filter(l => l.trim() !== '');
      if (lines.length < 2) { resolve([]); return; }

      // Parse a single CSV line respecting quoted fields
      const parseLine = (line) => {
        const result = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQ = !inQ; }
          else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
          else { cur += ch; }
        }
        result.push(cur.trim());
        return result;
      };

      const headers = parseLine(lines[0]).map(h => h.replace(/"/g, '').trim());
      const data = lines.slice(1).map(line => {
        const vals = parseLine(line).map(v => v.replace(/"/g, '').trim());
        return headers.reduce((obj, h, i) => ({ ...obj, [h]: vals[i] ?? '' }), {});
      });
      resolve(data);
    } catch (err) { reject(err); }
  };
  reader.onerror = reject;
  reader.readAsText(file);
});