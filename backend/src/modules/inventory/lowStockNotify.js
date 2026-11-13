const prisma = require('../../config/db');
const { toNum, stockStatus } = require('./stockStatus');
const { emitEvent } = require('../../sockets/emit');

/**
 * After stock mutation: emit inventory.low_stock once per low/out period;
 * clear lowStockNotifiedAt when stock recovers above min.
 */
async function syncLowStockNotification(appOrReq, ingredientId) {
  const ing = await prisma.ingredient.findFirst({
    where: { id: ingredientId, deletedAt: null },
    include: { unit: true },
  });
  if (!ing) return;

  const status = stockStatus(ing);
  const isLow = status === 'LOW_STOCK' || status === 'OUT_OF_STOCK';

  if (!isLow) {
    if (ing.lowStockNotifiedAt) {
      await prisma.ingredient.update({
        where: { id: ing.id },
        data: { lowStockNotifiedAt: null },
      });
    }
    return;
  }

  if (ing.lowStockNotifiedAt) return;

  await prisma.ingredient.update({
    where: { id: ing.id },
    data: { lowStockNotifiedAt: new Date() },
  });

  emitEvent(appOrReq, 'inventory.low_stock', {
    ingredientId: ing.id,
    name: ing.name,
    currentStock: toNum(ing.currentStock),
    minStock: toNum(ing.minStock),
    unitName: ing.unit?.name || null,
    stockStatus: status,
    message:
      status === 'OUT_OF_STOCK'
        ? `${ing.name} is out of stock`
        : `${ing.name} is low (${toNum(ing.currentStock)} ${ing.unit?.name || ''} / min ${toNum(ing.minStock)})`,
  });
}

module.exports = { syncLowStockNotification };
