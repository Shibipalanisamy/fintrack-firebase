import { useState, useEffect } from 'react';
import { goalsService } from '../utils/dbService';
import { fmt, today } from '../utils/helpers';
import { Modal, ConfirmDelete, DateStepper } from '../components/UI';
import toast from 'react-hot-toast';

const GOAL_ICONS = ['🚗','🏠','✈️','💍','📚','💻','👶','🏥','💰','🎓','🌍','🛒','🏋️','🎸','📷','⛵','🏖️','🎯'];
const GOAL_COLORS = [
  { key: 'blue',   label: 'Blue',   hex: '#4d9eff' },
  { key: 'green',  label: 'Green',  hex: '#22c55e' },
  { key: 'purple', label: 'Purple', hex: '#a78bfa' },
  { key: 'orange', label: 'Orange', hex: '#fb923c' },
  { key: 'pink',   label: 'Pink',   hex: '#f472b6' },
  { key: 'teal',   label: 'Teal',   hex: '#2dd4bf' },
  { key: 'yellow', label: 'Yellow', hex: '#fbbf24' },
  { key: 'red',    label: 'Red',    hex: '#f43f5e' },
];

const BLANK = { name: '', icon: '🎯', color: 'blue', targetAmount: '', currentAmount: '0', targetDate: '', notes: '', priority: 'medium' };

function calcGoal(g) {
  const target = parseFloat(g.targetAmount) || 0;
  const current = parseFloat(g.currentAmount) || 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);
  const now = new Date();
  const due = g.targetDate ? new Date(g.targetDate) : null;
  const daysLeft = due ? Math.round((due - now) / (1000 * 60 * 60 * 24)) : null;
  const monthsLeft = daysLeft !== null ? Math.max(0, daysLeft / 30.44) : null;
  const monthlyNeeded = monthsLeft > 0 ? remaining / monthsLeft : remaining;
  const onTrack = monthsLeft !== null && monthsLeft > 0
    ? (current / target) >= ((new Date(g.createdAt?.toDate?.() || g.createdAt || now) - now) / (due - now) + 1) * -1 + 1
    : null;
  return { target, current, pct, remaining, daysLeft, monthsLeft, monthlyNeeded };
}

function GoalForm({ item, onSave, onClose }) {
  const [f, setF] = useState({ ...BLANK, ...(item || {}) });
  const [saving, setSaving] = useState(false);
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const colorHex = GOAL_COLORS.find(c => c.key === f.color)?.hex || '#4d9eff';

  const preview = f.targetAmount && f.currentAmount !== '' ? calcGoal(f) : null;

  const submit = async () => {
    if (!f.name || !f.targetAmount) { toast.error('Fill Goal Name and Target Amount'); return; }
    setSaving(true);
    try { await onSave(f); } finally { setSaving(false); }
  };

  return (
    <div>
      {/* Icon selector */}
      <div className="fg">
        <label className="fl">Icon</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {GOAL_ICONS.map(ic => (
            <button key={ic} type="button" onClick={() => setF(p => ({ ...p, icon: ic }))}
              style={{ fontSize: 20, width: 36, height: 36, borderRadius: 8, border: `2px solid ${f.icon === ic ? colorHex : 'var(--border2)'}`, background: f.icon === ic ? colorHex + '20' : 'var(--bg3)', cursor: 'pointer' }}>
              {ic}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div className="fg">
        <label className="fl">Color</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {GOAL_COLORS.map(c => (
            <button key={c.key} type="button" onClick={() => setF(p => ({ ...p, color: c.key }))}
              style={{ width: 26, height: 26, borderRadius: '50%', background: c.hex, border: f.color === c.key ? '3px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />
          ))}
        </div>
      </div>

      <div className="fg"><label className="fl">Goal Name</label>
        <input className="fi" name="name" value={f.name} onChange={ch} placeholder="e.g. Buy a Car, Europe Trip, Emergency Fund" autoFocus />
      </div>

      <div className="frow">
        <div className="fg"><label className="fl">Target Amount (Rs)</label>
          <input className="fi" type="number" name="targetAmount" value={f.targetAmount} onChange={ch} placeholder="e.g. 5,00,000" min="0" />
        </div>
        <div className="fg"><label className="fl">Already Saved (Rs)</label>
          <input className="fi" type="number" name="currentAmount" value={f.currentAmount} onChange={ch} placeholder="e.g. 50,000" min="0" />
        </div>
      </div>

      <div className="frow">
        <div className="fg"><label className="fl">Target Date</label>
          <DateStepper name="targetDate" value={f.targetDate} onChange={ch} />
        </div>
        <div className="fg"><label className="fl">Priority</label>
          <select className="fi" name="priority" value={f.priority} onChange={ch}>
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
        </div>
      </div>

      <div className="fg"><label className="fl">Notes (optional)</label>
        <input className="fi" name="notes" value={f.notes} onChange={ch} placeholder="e.g. saving ₹10k/month from salary" />
      </div>

      {/* Live preview */}
      {preview && (
        <div style={{ background: colorHex + '10', border: `1px solid ${colorHex}40`, borderRadius: 10, padding: '12px 14px', marginTop: 4 }}>
          <div className="fw-700 fs-13 mb-2" style={{ color: colorHex }}>📊 Goal Preview</div>
          <div style={{ background: 'var(--bg3)', borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: '100%', width: `${preview.pct}%`, background: colorHex, borderRadius: 8, transition: 'width .4s' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
            <div><span className="text-muted">Progress</span><div className="fw-700" style={{ color: colorHex }}>{preview.pct.toFixed(1)}%</div></div>
            <div><span className="text-muted">Still Needed</span><div className="fw-700">{fmt(preview.remaining)}</div></div>
            {preview.monthsLeft !== null && <div><span className="text-muted">Months Left</span><div className="fw-700">{preview.monthsLeft.toFixed(1)} mo</div></div>}
            {preview.monthsLeft > 0 && <div><span className="text-muted">Monthly Target</span><div className="fw-700" style={{ color: colorHex }}>{fmt(preview.monthlyNeeded)}/mo</div></div>}
          </div>
        </div>
      )}

      <div className="modal-foot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? <span className="spin" /> : null} {item ? 'Update Goal' : 'Add Goal'}</button>
      </div>
    </div>
  );
}

function GoalCard({ goal, onEdit, onDelete, onAddMoney }) {
  const c = calcGoal(goal);
  const colorHex = GOAL_COLORS.find(col => col.key === goal.color)?.hex || '#4d9eff';
  const pri = { high: { label: 'High', color: '#f43f5e' }, medium: { label: 'Medium', color: '#fbbf24' }, low: { label: 'Low', color: '#22c55e' } }[goal.priority] || {};
  const completed = c.pct >= 100;

  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${completed ? colorHex + '60' : 'var(--border)'}`, borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden' }}>
      {/* Background accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: colorHex, borderRadius: '16px 16px 0 0' }} />

      {completed && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: colorHex, color: '#fff', fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 20 }}>🎉 COMPLETED!</div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-3" style={{ marginTop: 8 }}>
        <div style={{ fontSize: 32, width: 48, height: 48, borderRadius: 12, background: colorHex + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{goal.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="fw-800 fs-15" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span style={{ background: pri.color + '20', color: pri.color, fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 20 }}>{pri.label}</span>
            {goal.targetDate && (
              <span className="text-muted fs-11">
                {c.daysLeft < 0 ? `${Math.abs(c.daysLeft)}d overdue` : c.daysLeft === 0 ? 'Due today!' : `${c.daysLeft}d left`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--bg3)', borderRadius: 10, height: 12, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', width: `${c.pct}%`, background: colorHex, borderRadius: 10, transition: 'width .5s', position: 'relative' }}>
          {c.pct > 15 && <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 900, color: '#fff' }}>{c.pct.toFixed(0)}%</span>}
        </div>
      </div>
      <div className="flex justify-between fs-12 mb-3">
        <span style={{ color: colorHex, fontWeight: 700 }}>{fmt(c.current)} saved</span>
        <span className="text-muted">{fmt(c.target)} goal</span>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px' }}>
          <div className="fs-11 text-muted">Still Needed</div>
          <div className="fw-700 fs-13">{fmt(c.remaining)}</div>
        </div>
        {c.monthlyNeeded > 0 && c.monthsLeft > 0 && (
          <div style={{ background: colorHex + '10', border: `1px solid ${colorHex}30`, borderRadius: 8, padding: '8px 10px' }}>
            <div className="fs-11 text-muted">Monthly Target</div>
            <div className="fw-800 fs-13" style={{ color: colorHex }}>{fmt(c.monthlyNeeded)}/mo</div>
          </div>
        )}
        {goal.targetDate && (
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px' }}>
            <div className="fs-11 text-muted">Target Date</div>
            <div className="fw-700 fs-12">{new Date(goal.targetDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        )}
        {c.monthsLeft !== null && c.monthsLeft > 0 && (
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px' }}>
            <div className="fs-11 text-muted">Months Left</div>
            <div className="fw-700 fs-12">{c.monthsLeft.toFixed(1)} months</div>
          </div>
        )}
      </div>

      {goal.notes && <div className="fs-12 text-muted mb-3" style={{ fontStyle: 'italic' }}>📝 {goal.notes}</div>}

      {/* Actions */}
      <div className="flex gap-2">
        {!completed && (
          <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center', background: colorHex, borderColor: colorHex }} onClick={() => onAddMoney(goal)}>
            + Add Money
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => onEdit(goal)}>✏️</button>
        <button className="btn-icon" onClick={() => onDelete(goal.id)}>🗑️</button>
      </div>
    </div>
  );
}

function AddMoneyModal({ goal, onSave, onClose }) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const c = calcGoal(goal);
  const colorHex = GOAL_COLORS.find(col => col.key === goal.color)?.hex || '#4d9eff';
  const newTotal = c.current + (parseFloat(amount) || 0);
  const newPct = goal.targetAmount > 0 ? Math.min(100, (newTotal / parseFloat(goal.targetAmount)) * 100) : 0;

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await onSave({ ...goal, currentAmount: String(newTotal) });
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ background: colorHex + '10', border: `1px solid ${colorHex}30`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <div className="flex justify-between fs-13 mb-1">
          <span className="text-muted">Current</span><span className="fw-700" style={{ color: colorHex }}>{fmt(c.current)}</span>
        </div>
        <div className="flex justify-between fs-13 mb-1">
          <span className="text-muted">Target</span><span className="fw-700">{fmt(c.target)}</span>
        </div>
        <div className="flex justify-between fs-13">
          <span className="text-muted">Remaining</span><span className="fw-700">{fmt(c.remaining)}</span>
        </div>
      </div>

      <div className="fg">
        <label className="fl">Amount to Add (Rs)</label>
        <input className="fi" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 10,000" min="0" autoFocus
          onKeyDown={e => e.key === 'Enter' && save()} />
      </div>

      {amount && parseFloat(amount) > 0 && (
        <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
          <div style={{ background: 'var(--bg4)', borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${newPct}%`, background: colorHex, borderRadius: 8 }} />
          </div>
          <div className="flex justify-between fs-12">
            <span className="text-muted">New Total: <span className="fw-700" style={{ color: colorHex }}>{fmt(newTotal)}</span></span>
            <span className="fw-700" style={{ color: colorHex }}>{newPct.toFixed(1)}%</span>
          </div>
          {newPct >= 100 && <div className="fs-12 fw-700 mt-2" style={{ color: colorHex, textAlign: 'center' }}>🎉 Goal will be completed!</div>}
        </div>
      )}

      <div className="modal-foot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ background: colorHex, borderColor: colorHex }} onClick={save} disabled={saving}>
          {saving ? <span className="spin" /> : null} Add {amount ? fmt(parseFloat(amount) || 0) : 'Money'}
        </button>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [addMoneyGoal, setAddMoneyGoal] = useState(null);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [filter, setFilter] = useState('all'); // all | active | completed

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { setGoals(await goalsService.getAll()); }
    catch { toast.error('Failed to load goals'); }
    finally { setLoading(false); }
  };

  const save = async (data) => {
    try {
      if (edit) { await goalsService.update(edit.id, data); toast.success('Goal updated!'); }
      else { await goalsService.create(data); toast.success('Goal added! 🎯'); }
      setModal(false); setEdit(null); load();
    } catch { toast.error('Failed to save'); }
  };

  const addMoney = async (data) => {
    try {
      await goalsService.update(data.id, data);
      const c = calcGoal(data);
      if (c.pct >= 100) toast.success('🎉 Goal completed! Congratulations!');
      else toast.success(`Added! New total: ${fmt(parseFloat(data.currentAmount))}`);
      setAddMoneyGoal(null); load();
    } catch { toast.error('Failed'); }
  };

  const del = async () => {
    try { await goalsService.delete(delId); toast.success('Deleted'); setDelId(null); load(); }
    catch { toast.error('Failed'); }
  };

  const completed = goals.filter(g => calcGoal(g).pct >= 100);
  const active    = goals.filter(g => calcGoal(g).pct < 100);
  const displayed = filter === 'completed' ? completed : filter === 'active' ? active : goals;

  // Summary
  const totalTarget  = goals.reduce((s, g) => s + (parseFloat(g.targetAmount) || 0), 0);
  const totalSaved   = goals.reduce((s, g) => s + (parseFloat(g.currentAmount) || 0), 0);
  const totalNeeded  = Math.max(0, totalTarget - totalSaved);
  const overallPct   = totalTarget > 0 ? (totalSaved / totalTarget * 100).toFixed(1) : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">🎯 Financial Goals</div>
          <div className="page-sub">Set targets, track progress, stay on track</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEdit(null); setModal(true); }}>+ New Goal</button>
      </div>

      {/* Summary Stats */}
      {goals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Total Goals', val: goals.length, c: 'var(--blue)', icon: '🎯' },
            { label: 'Completed', val: completed.length, c: 'var(--green)', icon: '✅' },
            { label: 'Total Saved', val: fmt(totalSaved), c: 'var(--green)', icon: '💰' },
            { label: 'Still Needed', val: fmt(totalNeeded), c: 'var(--orange)', icon: '⏳' },
            { label: 'Overall Progress', val: `${overallPct}%`, c: 'var(--purple)', icon: '📊' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${s.c}` }}>
              <div className="fs-11 text-muted">{s.icon} {s.label}</div>
              <div className="fw-800 fs-14 mt-1" style={{ color: s.c }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      {goals.length > 0 && (
        <div className="flex gap-2 mb-4">
          {[['all', '📋 All', goals.length], ['active', '🔄 Active', active.length], ['completed', '✅ Done', completed.length]].map(([key, label, count]) => (
            <button key={key} onClick={() => setFilter(key)}
              style={{ padding: '6px 16px', borderRadius: 20, border: `2px solid ${filter === key ? 'var(--blue)' : 'var(--border2)'}`, background: filter === key ? 'rgba(77,158,255,.12)' : 'var(--bg3)', color: filter === key ? 'var(--blue)' : 'var(--t2)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {label} <span style={{ opacity: 0.7, fontSize: 11 }}>({count})</span>
            </button>
          ))}
        </div>
      )}

      {loading
        ? <div className="spin-center"><div className="spin spin-lg" /></div>
        : goals.length === 0
          ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🎯</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>No goals yet</div>
              <div className="text-muted fs-14 mb-5">Set your first financial goal — car, house, trip, emergency fund...</div>
              <button className="btn btn-primary" style={{ fontSize: 15, padding: '10px 28px' }} onClick={() => setModal(true)}>+ Set First Goal</button>
            </div>
          )
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {displayed.sort((a, b) => {
                const pa = { high: 0, medium: 1, low: 2 }[a.priority] ?? 1;
                const pb = { high: 0, medium: 1, low: 2 }[b.priority] ?? 1;
                return pa - pb;
              }).map(g => (
                <GoalCard key={g.id} goal={g}
                  onEdit={g => { setEdit(g); setModal(true); }}
                  onDelete={id => setDelId(id)}
                  onAddMoney={g => setAddMoneyGoal(g)}
                />
              ))}
            </div>
          )
      }

      {modal && (
        <Modal title={edit ? '✏️ Edit Goal' : '🎯 New Financial Goal'} onClose={() => { setModal(false); setEdit(null); }}>
          <GoalForm item={edit} onSave={save} onClose={() => { setModal(false); setEdit(null); }} />
        </Modal>
      )}
      {addMoneyGoal && (
        <Modal title={`💰 Add Money — ${addMoneyGoal.name}`} onClose={() => setAddMoneyGoal(null)}>
          <AddMoneyModal goal={addMoneyGoal} onSave={addMoney} onClose={() => setAddMoneyGoal(null)} />
        </Modal>
      )}
      {delId && <ConfirmDelete onConfirm={del} onCancel={() => setDelId(null)} />}
    </div>
  );
}