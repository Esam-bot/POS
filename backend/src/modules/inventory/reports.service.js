const prisma = require('../../config/db');
const { serializeDecimals } = require('../../utils/decimal');
const { toNum, presentIngredient } = require('./stockStatus');

function dateRange(query) {
  const where = {};
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }
  return where;
}

async function currentStock() {
  const rows = await prisma.ingredient.findMany({
    where: { deletedAt: null, isActive: true },
    include: { category: true, unit: true, supplier: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  const items = rows.map((r) => serializeDecimals(presentIngredient(r)));
  const stockValue = items.reduce((s, i) => s + toNum(i.stockValue), 0);
  return { items, totals: { count: items.length, stockValue } };
}

async function lowStock() {
  const rows = await prisma.ingredient.findMany({
    where: { deletedAt: null, isActive: true },
    include: { category: true, unit: true, supplier: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  const items = rows
    .map((r) => serializeDecimals(presentIngredient(r)))
    .filter((i) => i.stockStatus === 'LOW_STOCK' || i.stockStatus === 'OUT_OF_STOCK');
  return {
    items,
    totals: {
      low: items.filter((i) => i.stockStatus === 'LOW_STOCK').length,
      out: items.filter((i) => i.stockStatus === 'OUT_OF_STOCK').length,
    },
  };
}

async function consumption(query = {}) {
  const where = { type: 'CONSUME', ...dateRange(query) };
  const rows = await prisma.inventoryTransaction.findMany({
    where,
    include: { ingredient: { include: { unit: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const byIngredient = new Map();
  for (const r of rows) {
    const id = r.ingredientId;
    const prev = byIngredient.get(id) || {
      ingredientId: id,
      name: r.ingredient?.name,
      unitName: r.ingredient?.unit?.name,
      quantity: 0,
    };
    prev.quantity += Math.abs(toNum(r.quantity));
    byIngredient.set(id, prev);
  }
  return {
    items: [...byIngredient.values()].sort((a, b) => b.quantity - a.quantity),
    movements: rows.slice(0, 100).map((r) =>
      serializeDecimals({
        id: r.id,
        ingredientName: r.ingredient?.name,
        quantity: r.quantity,
        createdAt: r.createdAt,
        notes: r.notes,
        referenceId: r.referenceId,
      })
    ),
  };
}

async function purchaseHistory(query = {}) {
  const where = {};
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }
  if (query.status) where.status = query.status;
  const rows = await prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: { select: { name: true } },
      items: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return {
    items: rows.map((r) =>
      serializeDecimals({
        id: r.id,
        supplierName: r.supplier?.name,
        status: r.status,
        totalCost: r.totalCost,
        orderedAt: r.orderedAt,
        receivedAt: r.receivedAt,
        lineCount: r.items.length,
        createdAt: r.createdAt,
      })
    ),
  };
}

async function wastageHistory(query = {}) {
  const where = dateRange(query);
  const rows = await prisma.wastageRecord.findMany({
    where,
    include: {
      ingredient: { include: { unit: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  return {
    items: rows.map((r) =>
      serializeDecimals({
        id: r.id,
        ingredientName: r.ingredient?.name,
        unitName: r.ingredient?.unit?.name,
        quantity: r.quantity,
        reason: r.reason,
        staffName: r.createdBy?.name,
        createdAt: r.createdAt,
      })
    ),
  };
}

async function stockValuation() {
  const data = await currentStock();
  const byCategory = new Map();
  for (const i of data.items) {
    const key = i.categoryName || 'Uncategorized';
    const prev = byCategory.get(key) || { category: key, stockValue: 0, count: 0 };
    prev.stockValue += toNum(i.stockValue);
    prev.count += 1;
    byCategory.set(key, prev);
  }
  return {
    totals: data.totals,
    byCategory: [...byCategory.values()].sort((a, b) => b.stockValue - a.stockValue),
    items: data.items,
  };
}

module.exports = {
  currentStock,
  lowStock,
  consumption,
  purchaseHistory,
  wastageHistory,
  stockValuation,
};
