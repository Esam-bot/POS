/**
 * Atomic global daily order numbers: YYMMDD-0001
 * Uses a single sequence row per day (OrderType DINE_IN bucket) so numbers stay unique.
 */
async function nextOrderNumber(tx) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateKey = `${yy}${mm}${dd}`;

  await tx.$executeRawUnsafe(
    `INSERT INTO order_sequences (id, "dateKey", "orderType", "lastValue")
     VALUES (gen_random_uuid(), $1, 'DINE_IN'::"OrderType", 0)
     ON CONFLICT ("dateKey", "orderType") DO NOTHING`,
    dateKey
  );

  const rows = await tx.$queryRawUnsafe(
    `UPDATE order_sequences
     SET "lastValue" = "lastValue" + 1
     WHERE "dateKey" = $1 AND "orderType" = 'DINE_IN'::"OrderType"
     RETURNING "lastValue"`,
    dateKey
  );

  const lastValue = Number(rows[0].lastValue);
  return `${dateKey}-${String(lastValue).padStart(4, '0')}`;
}

module.exports = { nextOrderNumber };
