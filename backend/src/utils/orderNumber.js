/**
 * Atomic global sequential order numbers: "1", "2", "3", …
 * Shared across Dine-in / Takeaway / Delivery. Never resets daily.
 * Cancelled numbers are not reused (counter only increments).
 * Historical YYMMDD-#### numbers are left untouched; only new orders use this sequence.
 */
async function nextOrderNumber(tx) {
  await tx.$executeRawUnsafe(
    `INSERT INTO order_global_sequences (id, "lastValue")
     VALUES ('global', 0)
     ON CONFLICT (id) DO NOTHING`
  );

  const rows = await tx.$queryRawUnsafe(
    `UPDATE order_global_sequences
     SET "lastValue" = "lastValue" + 1
     WHERE id = 'global'
     RETURNING "lastValue"`
  );

  const lastValue = Number(rows[0].lastValue);
  return String(lastValue);
}

/** Display helper for UI (optional use). */
function formatOrderNumber(orderNumber) {
  if (orderNumber == null || orderNumber === '') return '—';
  const s = String(orderNumber);
  if (/^\d+$/.test(s)) return `#${s}`;
  return s.startsWith('#') ? s : s;
}

module.exports = { nextOrderNumber, formatOrderNumber };
