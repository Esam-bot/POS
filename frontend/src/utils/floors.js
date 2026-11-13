/**
 * Floor / section helpers — sections come from dining table records in the DB.
 * STATUS_* maps are display labels for TableStatus enums (not business data).
 */

export const STATUS_LABEL = {
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  CLEANING: 'Cleaning',
  RESERVED: 'Reserved',
  DISABLED: 'Disabled',
  INACTIVE: 'Inactive',
};

/** Admin (light workspace) table status cards */
export const STATUS_CARD_TONE = {
  AVAILABLE: 'border-emerald-500 bg-emerald-50 text-[var(--color-ink)]',
  OCCUPIED: 'border-red-400 bg-red-50 text-[var(--color-ink)]',
  CLEANING: 'border-orange-400 bg-orange-50 text-[var(--color-ink)]',
  RESERVED: 'border-violet-400 bg-violet-50 text-[var(--color-ink)]',
  DISABLED: 'border-[var(--color-line)] bg-[var(--color-section)] text-[var(--color-ink-muted)] opacity-70',
  INACTIVE: 'border-[var(--color-line)] bg-[var(--color-section)] text-[var(--color-ink-muted)] opacity-70',
};

/** POS dark terminal table status cards */
export const POS_STATUS_CARD_TONE = {
  AVAILABLE: 'border-[#16a36a] bg-[#202429] text-[#f5f5f5]',
  OCCUPIED: 'border-[#e05252] bg-[#202429] text-[#f5f5f5]',
  CLEANING: 'border-[#e9a23b] bg-[#202429] text-[#f5f5f5]',
  RESERVED: 'border-[#7c6af0] bg-[#202429] text-[#f5f5f5]',
  DISABLED: 'border-[#30363d] bg-[#181b1f] text-[#a1a7ae] opacity-70',
  INACTIVE: 'border-[#30363d] bg-[#181b1f] text-[#a1a7ae] opacity-70',
};

export const STATUS_BADGE_TONE = {
  AVAILABLE: 'success',
  OCCUPIED: 'danger',
  CLEANING: 'warning',
  RESERVED: 'brand',
  DISABLED: 'muted',
  INACTIVE: 'muted',
};

/** Build floor tabs from distinct table.section values in the database. */
export function floorsFromTables(tables) {
  const seen = new Map();
  for (const t of tables || []) {
    const raw = String(t.section || '').trim();
    const key = raw || 'Unassigned';
    if (!seen.has(key)) {
      seen.set(key, { key, label: key });
    }
  }
  return [...seen.values()].sort((a, b) => {
    if (a.key === 'Unassigned') return 1;
    if (b.key === 'Unassigned') return -1;
    return a.label.localeCompare(b.label);
  });
}

export function tablesForFloor(tables, floorKey) {
  if (floorKey === 'Unassigned') {
    return (tables || []).filter((t) => !String(t.section || '').trim());
  }
  return (tables || []).filter((t) => (t.section || '') === floorKey);
}

export function defaultSection(tables) {
  const floors = floorsFromTables(tables);
  const first = floors.find((f) => f.key !== 'Unassigned');
  return first?.key || floors[0]?.key || '';
}
