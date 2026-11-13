/** Display order numbers: sequential globals as #1, legacy YYMMDD-#### unchanged. */
export function formatOrderNumber(orderNumber) {
  if (orderNumber == null || orderNumber === '') return '—';
  const s = String(orderNumber);
  if (/^\d+$/.test(s)) return `#${s}`;
  return s.startsWith('#') ? s : s;
}
