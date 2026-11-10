export const FLOORS = [
  { key: 'Ground Floor', label: 'Ground Floor' },
  { key: 'First Floor', label: 'First Floor' },
];

export const STATUS_LABEL = {
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  CLEANING: 'Cleaning',
  RESERVED: 'Reserved',
  DISABLED: 'Disabled',
  INACTIVE: 'Inactive',
};

/** POS/admin visual tones for table status */
export const STATUS_CARD_TONE = {
  AVAILABLE: 'border-emerald-500 bg-emerald-500/25 text-white',
  OCCUPIED: 'border-red-500 bg-red-500/25 text-white',
  CLEANING: 'border-orange-400 bg-orange-500/25 text-white',
  RESERVED: 'border-violet-400 bg-violet-500/20 text-white',
  DISABLED: 'border-slate-500 bg-slate-500/20 text-white/70 opacity-70',
  INACTIVE: 'border-slate-500 bg-slate-500/20 text-white/70 opacity-70',
};

export const STATUS_BADGE_TONE = {
  AVAILABLE: 'success',
  OCCUPIED: 'danger',
  CLEANING: 'warning',
  RESERVED: 'brand',
  DISABLED: 'muted',
  INACTIVE: 'muted',
};

export function tablesForFloor(tables, floorKey) {
  return (tables || []).filter((t) => (t.section || '') === floorKey);
}

export function otherTables(tables) {
  const known = new Set(FLOORS.map((f) => f.key));
  return (tables || []).filter((t) => !known.has(t.section || ''));
}
