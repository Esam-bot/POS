/**
 * Format a PKR amount for staff-facing UI.
 * Null/undefined/empty become 0. Always shows 2 decimal places.
 */
export function money(value) {
  const n = Number(value || 0);
  return `Rs. ${n.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
