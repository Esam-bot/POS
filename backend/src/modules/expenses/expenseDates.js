/**
 * Date-only helpers for recurring expense schedules (YYYY-MM-DD).
 * Avoids timezone drift by working with calendar components.
 */

function toDateOnlyString(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateOnly(value) {
  const s = toDateOnlyString(value);
  if (!s) throw new Error('Invalid date');
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function formatDateOnly({ y, m, d }) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function clampDay(y, m, day) {
  return Math.min(Math.max(1, day), daysInMonth(y, m));
}

function todayDateOnly(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return formatDateOnly({ y, m, d });
}

function frequencyMonths(frequency) {
  if (frequency === 'QUARTERLY') return 3;
  if (frequency === 'YEARLY') return 12;
  return 1;
}

/**
 * Advance a due date by frequency, clamping to anchorDay for short months.
 * Example: anchorDay=31, Feb → 28/29, then March → 31 again.
 */
function advanceDueDate(dueDate, frequency, anchorDay) {
  const { y, m } = parseDateOnly(dueDate);
  const months = frequencyMonths(frequency);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = clampDay(ny, nm, anchorDay);
  return formatDateOnly({ y: ny, m: nm, d: nd });
}

function anchorDayFromStart(startDate) {
  return parseDateOnly(startDate).d;
}

function compareDateOnly(a, b) {
  const sa = toDateOnlyString(a);
  const sb = toDateOnlyString(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

module.exports = {
  toDateOnlyString,
  parseDateOnly,
  formatDateOnly,
  daysInMonth,
  clampDay,
  todayDateOnly,
  frequencyMonths,
  advanceDueDate,
  anchorDayFromStart,
  compareDateOnly,
};
