import { format } from 'date-fns';

// Indian number format: 1,00,00,000.00
export const fmt = (n) => {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtDate = (d) => format(new Date(d), 'dd MMM yyyy');
export const fmtDateInput = (d) => format(new Date(d), 'yyyy-MM-dd');
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
    const lines = e.target.result.split('\n').filter(Boolean);
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      return headers.reduce((obj, h, i) => ({ ...obj, [h]: vals[i] || '' }), {});
    });
    resolve(data);
  };
  reader.onerror = reject;
  reader.readAsText(file);
});