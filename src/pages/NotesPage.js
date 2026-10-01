import { useState, useEffect } from 'react';
import { notesService, incomeService, expenseService } from '../utils/dbService';
import { fmt, today } from '../utils/helpers';
import { ConfirmDelete, Modal } from '../components/UI';
import toast from 'react-hot-toast';

// ─── Note Detail / Edit Modal ───────────────────────────────
// A richer editor than the quick single-line add: a header (title), a
// multi-line body, and — the key feature — each line of the body gets its
// own copy button, so you can copy just one line out of a longer note
// instead of copying everything.
function NoteDetailModal({ note, onSave, onClose, onCopy }) {
  const [header, setHeader] = useState(note?.header || '');
  const [body, setBody] = useState(note?.text || '');
  const [saving, setSaving] = useState(false);

  const lines = body.split('\n');

  const save = async () => {
    setSaving(true);
    try { await onSave({ header: header.trim(), text: body }); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={note?.id ? '📝 Edit Note' : '📝 New Note'} onClose={onClose}>
      <div className="fg">
        <label className="fl">Header</label>
        <input className="fi" value={header} onChange={e => setHeader(e.target.value)} placeholder="e.g. Shopping list, Meeting notes…" autoFocus />
      </div>
      <div className="fg">
        <label className="fl">Body <span className="text-muted" style={{ fontWeight: 400, textTransform: 'none' }}>(one item per line)</span></label>
        <textarea className="fta" rows={8} style={{ fontFamily: 'monospace', fontSize: 13 }}
          value={body} onChange={e => setBody(e.target.value)} placeholder="Type each line separately…" />
      </div>

      {lines.some(l => l.trim()) && (
        <div className="fg">
          <label className="fl">Copy a Specific Line</label>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {lines.map((line, i) => line.trim() ? (
              <div key={i} className="flex items-center justify-between" style={{ padding: '6px 10px', borderBottom: i < lines.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span className="fs-12" style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{line}</span>
                <button className="btn-icon" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => onCopy(line)} title="Copy this line">📋</button>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-secondary" onClick={() => onCopy(body)}>📋 Copy Whole Note</button>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spin" /> : null} Save</button>
        </div>
      </div>
    </Modal>
  );
}

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [delId, setDelId] = useState(null);
  const [detailNote, setDetailNote] = useState(null); // null = closed, {} = new note, object = editing an existing one
  const [summary, setSummary] = useState({ weekIncome: 0, weekExpense: 0, monthIncome: 0, monthExpense: 0 });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [emailing, setEmailing] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setNotes(await notesService.getAll()); }
    catch { toast.error('Failed to load notes'); }
    finally { setLoading(false); }
  };

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const now = new Date();
      const weekFrom = daysAgoISO(6); // last 7 days including today
      const monthFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const todayStr = today();
      const [weekInc, weekExp, monthInc, monthExp] = await Promise.all([
        incomeService.getAll({ dateFrom: weekFrom, dateTo: todayStr }),
        expenseService.getAll({ dateFrom: weekFrom, dateTo: todayStr }),
        incomeService.getAll({ dateFrom: monthFrom, dateTo: todayStr }),
        expenseService.getAll({ dateFrom: monthFrom, dateTo: todayStr }),
      ]);
      const sum = (arr) => arr.reduce((s, i) => s + (+i.amount || 0), 0);
      setSummary({
        weekIncome: sum(weekInc), weekExpense: sum(weekExp),
        monthIncome: sum(monthInc), monthExpense: sum(monthExp),
      });
    } catch { toast.error('Failed to load summary'); }
    finally { setSummaryLoading(false); }
  };

  useEffect(() => { load(); loadSummary(); }, []);

  const addNote = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      await notesService.create({ text: newText.trim(), done: false });
      setNewText('');
      load();
    } catch { toast.error('Failed to add'); }
    finally { setAdding(false); }
  };

  const toggleDone = async (n) => {
    try { await notesService.update(n.id, { done: !n.done }); setNotes(prev => prev.map(x => x.id === n.id ? { ...x, done: !x.done } : x)); }
    catch { toast.error('Failed to update'); }
  };

  const updateText = async (n, text) => {
    setNotes(prev => prev.map(x => x.id === n.id ? { ...x, text } : x)); // optimistic, so typing feels instant
  };
  const saveText = async (n) => {
    try { await notesService.update(n.id, { text: n.text }); }
    catch { toast.error('Failed to save'); }
  };

  const saveDetailNote = async ({ header, text }) => {
    try {
      if (detailNote?.id) {
        await notesService.update(detailNote.id, { header, text });
      } else {
        await notesService.create({ header, text, done: false });
      }
      load();
    } catch { toast.error('Failed to save'); }
  };

  const copyNote = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied!');
    } catch {
      toast.error('Could not copy — select and copy manually');
    }
  };

  const del = async () => {
    try { await notesService.delete(delId); toast.success('Deleted'); setDelId(null); load(); }
    catch { toast.error('Failed'); }
  };

  const sendWeeklyEmail = async () => {
    const scanUrl = localStorage.getItem('fintrack_scan_gas_url') || '';
    if (!scanUrl) { toast.error('Set up the Apps Script connection first — go to Expenses → MRP Prices → ⚙️'); return; }

    setEmailing(true);
    try {
      const pendingList = notes.filter(n => !n.done);
      const weekBal = summary.weekIncome - summary.weekExpense;
      const monthBal = summary.monthIncome - summary.monthExpense;
      const plainBody =
        `FinTrack Weekly Summary\n\n` +
        `This Week\n` +
        `  Income:   ${fmt(summary.weekIncome)}\n` +
        `  Expenses: ${fmt(summary.weekExpense)}\n` +
        `  Net:      ${fmt(weekBal)}\n\n` +
        `This Month\n` +
        `  Current Balance: ${fmt(monthBal)} (Income ${fmt(summary.monthIncome)} − Expenses ${fmt(summary.monthExpense)})\n\n` +
        (pendingList.length > 0
          ? `Pending To-Dos (${pendingList.length})\n` + pendingList.map(n => `  • ${n.header ? `${n.header}: ` : ''}${n.text}`).join('\n')
          : 'No pending to-dos.');

      const htmlBody =
        `<h2>📝 FinTrack Weekly Summary</h2>` +
        `<h3>This Week</h3>` +
        `<p>Income: <b style="color:#22c55e">${fmt(summary.weekIncome)}</b><br/>` +
        `Expenses: <b style="color:#f43f5e">${fmt(summary.weekExpense)}</b><br/>` +
        `Net: <b style="color:${weekBal >= 0 ? '#22c55e' : '#f43f5e'}">${fmt(weekBal)}</b></p>` +
        `<h3>This Month</h3>` +
        `<p>Current Balance: <b style="color:${monthBal >= 0 ? '#22c55e' : '#f43f5e'}">${fmt(monthBal)}</b> ` +
        `(Income ${fmt(summary.monthIncome)} − Expenses ${fmt(summary.monthExpense)})</p>` +
        (pendingList.length > 0
          ? `<h3>Pending To-Dos (${pendingList.length})</h3><ul>${pendingList.map(n => `<li>${n.header ? `<b>${n.header}:</b> ` : ''}${n.text}</li>`).join('')}</ul>`
          : '<p>No pending to-dos.</p>');

      const res = await fetch(scanUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'sendEmail', subject: '📝 FinTrack Weekly Summary', body: plainBody, html: htmlBody }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Send failed');
      toast.success(`Sent to ${json.sentTo}!`);
    } catch (err) {
      console.error('Send weekly email error:', err);
      toast.error('Could not send: ' + (err.message || 'unknown error'));
    } finally {
      setEmailing(false);
    }
  };

  const weekBalance = summary.weekIncome - summary.weekExpense;
  const monthBalance = summary.monthIncome - summary.monthExpense;
  const pending = notes.filter(n => !n.done);
  const done = notes.filter(n => n.done);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">📝 Notes & Quick Summary</div>
          <div className="page-sub">Jot things down, check them off, copy anytime — plus a quick look at this week's money</div>
        </div>
        <button className="btn btn-secondary" onClick={sendWeeklyEmail} disabled={emailing || summaryLoading}>
          {emailing ? <span className="spin" /> : '📧'} {emailing ? 'Sending...' : "Email This Week's Summary"}
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="text-muted fs-11" style={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>This Week — Income</div>
          <div className="amt amt-g" style={{ fontSize: 20, fontWeight: 800 }}>{summaryLoading ? '…' : fmt(summary.weekIncome)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="text-muted fs-11" style={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>This Week — Expenses</div>
          <div className="amt amt-r" style={{ fontSize: 20, fontWeight: 800 }}>{summaryLoading ? '…' : fmt(summary.weekExpense)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="text-muted fs-11" style={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>This Week — Net</div>
          <div className={`amt ${weekBalance >= 0 ? 'amt-g' : 'amt-r'}`} style={{ fontSize: 20, fontWeight: 800 }}>{summaryLoading ? '…' : fmt(weekBalance)}</div>
        </div>
        <div className="card" style={{ padding: 16, borderLeft: '3px solid var(--blue)' }}>
          <div className="text-muted fs-11" style={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>Current Balance (This Month)</div>
          <div className={`amt ${monthBalance >= 0 ? 'amt-g' : 'amt-r'}`} style={{ fontSize: 20, fontWeight: 800 }}>{summaryLoading ? '…' : fmt(monthBalance)}</div>
          <div className="fs-10 text-muted" style={{ marginTop: 2 }}>Income {fmt(summary.monthIncome)} − Expenses {fmt(summary.monthExpense)}</div>
        </div>
      </div>

      {/* Add note */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-2">
          <input className="fi" style={{ flex: 1 }} placeholder="Quick add a single-line note or to-do…" value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }} />
          <button className="btn btn-primary" onClick={addNote} disabled={adding || !newText.trim()}>
            {adding ? <span className="spin" /> : '+'} Add
          </button>
          <button className="btn btn-secondary" onClick={() => setDetailNote({})}>📄 New Detailed Note</button>
        </div>
        <div className="fs-11 text-muted mt-2">For a longer note with a header and multiple lines (each individually copyable), use "New Detailed Note" instead.</div>
      </div>

      {loading ? (
        <div className="spin-center"><div className="spin spin-lg" /></div>
      ) : notes.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-icon">📝</div><div className="empty-title">No notes yet</div><div className="empty-sub">Add your first note or to-do above</div></div></div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">📋 To Do ({pending.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pending.map(n => (
                  <div key={n.id} style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 8 }}>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={!!n.done} onChange={() => toggleDone(n)} style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                      {n.header && <span className="fw-800 fs-12" style={{ flexShrink: 0 }}>{n.header}:</span>}
                      <input className="fi" style={{ flex: 1, border: 'none', background: 'transparent', padding: '2px 4px' }}
                        value={n.text} onChange={e => updateText(n, e.target.value)} onBlur={() => saveText(n)} />
                      <button className="btn-icon" onClick={() => setDetailNote(n)} title="Open full editor (header, multiple lines, copy any line)">📄</button>
                      <button className="btn-icon" onClick={() => copyNote(n.text)} title="Copy whole note">📋</button>
                      <button className="btn-icon" onClick={() => setDelId(n.id)} title="Delete">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {done.length > 0 && (
            <div className="card">
              <div className="card-title">✅ Done ({done.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {done.map(n => (
                  <div key={n.id} className="flex items-center gap-2" style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 8, opacity: 0.6 }}>
                    <input type="checkbox" checked={!!n.done} onChange={() => toggleDone(n)} style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                    <span style={{ flex: 1, textDecoration: 'line-through', fontSize: 13 }}>{n.header ? `${n.header}: ` : ''}{n.text}</span>
                    <button className="btn-icon" onClick={() => setDetailNote(n)} title="Open full editor">📄</button>
                    <button className="btn-icon" onClick={() => copyNote(n.text)} title="Copy whole note">📋</button>
                    <button className="btn-icon" onClick={() => setDelId(n.id)} title="Delete">🗑️</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}

      {detailNote && (
        <NoteDetailModal
          note={detailNote}
          onSave={saveDetailNote}
          onClose={() => setDetailNote(null)}
          onCopy={copyNote}
        />
      )}
    </div>
  );
}