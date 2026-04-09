import { useState } from 'react';

// ─── Changelog Data ────────────────────────────────────────
const RELEASES = [
  {
    version: '1.4',
    date: 'April 2, 2026',
    latest: true,
    items: [
      {
        type: 'improved',
        icon: '📊',
        title: 'Redesigned mobile asset filters',
        desc: 'All filters on the portfolio page now fit in a single row on mobile — no more scrolling sideways to find what you need. Broker, asset type, and date filters are always visible.',
      },
      {
        type: 'new',
        icon: '🏷️',
        title: 'Bulk add tags',
        desc: 'Select multiple assets and apply tags to all of them in one go. Organize your portfolio by theme, sector, or goal without editing each holding individually.',
      },
      {
        type: 'improved',
        icon: '📱',
        title: 'Cleaner, faster mobile experience',
        desc: 'Streamlined asset rows, tighter pagination, and a more compact layout across the portfolio and expenses pages. Everything is faster and easier to scan on small screens.',
      },
    ],
  },
  {
    version: '1.3',
    date: 'March 14, 2026',
    latest: false,
    items: [
      {
        type: 'new',
        icon: '🗂️',
        title: 'Category detail tab in expenses',
        desc: 'Drill into any expense category to see a full breakdown by month, paid-via method, and individual transactions.',
      },
      {
        type: 'improved',
        icon: '📉',
        title: 'Reports bar chart now shows savings',
        desc: 'The monthly summary chart on the Reports page now includes a savings bar alongside income and expenses for a complete picture at a glance.',
      },
      {
        type: 'fixed',
        icon: '🔁',
        title: 'Fixed recurring expense date rollover',
        desc: 'Recurring expenses set to the 31st were silently skipped in months with fewer days. They now correctly roll to the last day of the month.',
      },
    ],
  },
  {
    version: '1.2',
    date: 'February 28, 2026',
    latest: false,
    items: [
      {
        type: 'new',
        icon: '💰',
        title: 'Dividend tracker',
        desc: 'Log dividends per stock, view per-share and total yield, and track payout history over time inside the portfolio section.',
      },
      {
        type: 'improved',
        icon: '🧮',
        title: 'Brokerage auto-calculation',
        desc: 'Enter a percentage and brokerage fees are calculated automatically as you fill in quantity and price. No more manual math.',
      },
    ],
  },
];

const BADGE_STYLES = {
  new:      { background: 'rgba(34,197,94,.12)',  color: 'var(--green)' },
  improved: { background: 'rgba(77,158,255,.12)', color: 'var(--blue)'  },
  fixed:    { background: 'rgba(249,115,22,.12)', color: 'var(--orange)' },
};

const FILTER_TABS = ['all', 'new', 'improved', 'fixed'];

// ─── Badge ─────────────────────────────────────────────────
function Badge({ type }) {
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <span style={{ ...BADGE_STYLES[type], borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// ─── Changelog Item ────────────────────────────────────────
function ChangelogItem({ item }) {
  return (
    <div className="flex gap-3" style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 20, width: 32, flexShrink: 0, textAlign: 'center', paddingTop: 1 }}>{item.icon}</div>
      <div style={{ flex: 1 }}>
        <div className="flex items-center gap-2 mb-1" style={{ flexWrap: 'wrap' }}>
          <span className="fw-700 fs-14">{item.title}</span>
          <Badge type={item.type} />
        </div>
        <p className="fs-13 text-muted" style={{ lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
      </div>
    </div>
  );
}

// ─── Release Block ─────────────────────────────────────────
function ReleaseBlock({ release, filter }) {
  const items = filter === 'all' ? release.items : release.items.filter(i => i.type === filter);
  if (items.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="flex items-center gap-3 mb-1" style={{ borderBottom: '1px solid var(--border2)', paddingBottom: 12, marginBottom: 0 }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="fw-800 fs-15">v{release.version}</span>
            {release.latest && (
              <span style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                Latest
              </span>
            )}
          </div>
          <div className="fs-12 text-muted" style={{ marginTop: 2 }}>{release.date}</div>
        </div>
      </div>
      <div>
        {items.map((item, i) => (
          <ChangelogItem key={i} item={item} />
        ))}
      </div>
    </div>
  );
}

// ─── ChangelogPage ─────────────────────────────────────────
export default function ChangelogPage() {
  const [filter, setFilter] = useState('all');

  const hasResults = RELEASES.some(r =>
    filter === 'all' ? true : r.items.some(i => i.type === filter)
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">📋 Changelog</div>
          <div className="page-sub">Every update, improvement, and fix</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className="btn-ghost btn-sm"
            style={{
              borderRadius: 20,
              padding: '5px 14px',
              fontWeight: filter === tab ? 700 : 500,
              background: filter === tab ? 'var(--blue)' : 'var(--bg3)',
              color: filter === tab ? '#fff' : 'var(--t2)',
              border: '1px solid ' + (filter === tab ? 'var(--blue)' : 'var(--border2)'),
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Releases */}
      {hasResults
        ? RELEASES.map((release, i) => (
            <ReleaseBlock key={i} release={release} filter={filter} />
          ))
        : (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">📋</div>
              <div className="empty-title">No {filter} items found</div>
              <div className="empty-sub">Try a different filter</div>
            </div>
          </div>
        )
      }
    </div>
  );
}
