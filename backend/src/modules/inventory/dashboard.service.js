const prisma = require('../../config/db');
const { serializeDecimals } = require('../../utils/decimal');
const { presentIngredient, stockStatus, toNum, txnTypeLabel } = require('./stockStatus');
const { presentMovement } = require('./stock.service');

async function getDashboard() {
  const ingredients = await prisma.ingredient.findMany({
    where: { deletedAt: null, isActive: true },
    include: {
      category: true,
      unit: true,
      supplier: { select: { id: true, name: true } },
    },
  });

  let stockValue = 0;
  const low = [];
  const out = [];
  for (const ing of ingredients) {
    stockValue += toNum(ing.currentStock) * toNum(ing.avgCost);
    const status = stockStatus(ing);
    if (status === 'OUT_OF_STOCK') out.push(presentIngredient(ing));
    else if (status === 'LOW_STOCK') low.push(presentIngredient(ing));
  }

  const recentMovements = await prisma.inventoryTransaction.findMany({
    take: 15,
    orderBy: { createdAt: 'desc' },
    include: {
      ingredient: { include: { unit: true } },
      createdBy: { select: { name: true } },
    },
  });

  const recentWastage = await prisma.inventoryTransaction.findMany({
    where: { type: 'WASTE' },
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      ingredient: { include: { unit: true } },
      createdBy: { select: { name: true } },
    },
  });

  const orderIds = [
    ...new Set(
      [...recentMovements, ...recentWastage]
        .filter((t) => t.referenceType === 'Order' && t.referenceId)
        .map((t) => t.referenceId)
    ),
  ];
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderNumber: true },
      })
    : [];
  const orderMap = Object.fromEntries(orders.map((o) => [o.id, o.orderNumber]));

  const withOrder = (rows) =>
    rows.map((r) =>
      serializeDecimals(
        presentMovement({
          ...r,
          orderNumber: r.referenceType === 'Order' ? orderMap[r.referenceId] || null : null,
        })
      )
    );

  return serializeDecimals({
    totals: {
      itemCount: ingredients.length,
      stockValue,
      lowStockCount: low.length,
      outOfStockCount: out.length,
    },
    lowStockItems: low.slice(0, 20).map((i) => serializeDecimals(i)),
    outOfStockItems: out.slice(0, 20).map((i) => serializeDecimals(i)),
    recentMovements: withOrder(recentMovements),
    recentWastage: withOrder(recentWastage),
  });
}

module.exports = { getDashboard, txnTypeLabel };
