const { Prisma } = require('@prisma/client');
const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');
const { toNum, txnTypeLabel, presentIngredient } = require('./stockStatus');

function D(v) {
  return new Prisma.Decimal(v);
}

async function lockIngredient(tx, ingredientId) {
  const rows = await tx.$queryRawUnsafe(
    `SELECT id, "currentStock", "avgCost", name FROM ingredients WHERE id = $1::uuid AND "deletedAt" IS NULL FOR UPDATE`,
    ingredientId
  );
  if (!rows.length) throw new AppError('Inventory item not found', 404);
  return rows[0];
}

function presentMovement(row) {
  return {
    id: row.id,
    itemName: row.ingredient?.name || null,
    unitName: row.ingredient?.unit?.name || null,
    type: row.type,
    typeLabel: txnTypeLabel(row.type),
    quantity: row.quantity,
    unitCost: row.unitCost,
    stockBefore: row.stockBefore,
    stockAfter: row.stockAfter,
    notes: row.notes,
    referenceType: row.referenceType,
    orderNumber: row.orderNumber || null,
    staffName: row.createdBy?.name || null,
    createdAt: row.createdAt,
  };
}

async function resolveOrderNumbers(txns) {
  const orderIds = [
    ...new Set(
      txns
        .filter((t) => t.referenceType === 'Order' && t.referenceId)
        .map((t) => t.referenceId)
    ),
  ];
  if (!orderIds.length) return txns;
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, orderNumber: true },
  });
  const map = Object.fromEntries(orders.map((o) => [o.id, o.orderNumber]));
  return txns.map((t) => ({
    ...t,
    orderNumber: t.referenceType === 'Order' ? map[t.referenceId] || null : null,
  }));
}

async function addStock(body, userId) {
  const quantity = D(body.quantity);
  const unitCost = body.unitCost != null ? D(body.unitCost) : null;

  const result = await prisma.$transaction(async (tx) => {
    const ing = await lockIngredient(tx, body.ingredientId);
    const before = D(ing.currentStock);
    const after = before.add(quantity);

    let avgCost = D(ing.avgCost);
    if (unitCost != null && quantity.gt(0)) {
      const oldValue = before.mul(avgCost);
      const addValue = quantity.mul(unitCost);
      avgCost = after.gt(0) ? oldValue.add(addValue).div(after) : unitCost;
    }

    const updated = await tx.ingredient.update({
      where: { id: body.ingredientId },
      data: { currentStock: after, avgCost },
      include: { category: true, unit: true, supplier: { select: { id: true, name: true } } },
    });

    const txn = await tx.inventoryTransaction.create({
      data: {
        ingredientId: body.ingredientId,
        type: 'RECEIVE',
        quantity,
        unitCost,
        stockBefore: before,
        stockAfter: after,
        notes: body.notes || null,
        createdById: userId,
      },
      include: {
        ingredient: { include: { unit: true } },
        createdBy: { select: { name: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'INVENTORY_STOCK_ADD',
        entityType: 'Ingredient',
        entityId: body.ingredientId,
        after: { quantity: Number(quantity), stockAfter: Number(after) },
      },
    });

    return { item: updated, txn };
  });

  return serializeDecimals({
    item: presentIngredient(result.item),
    movement: presentMovement(result.txn),
  });
}

async function adjustStock(body, userId) {
  const newStock = D(body.newStock);
  const result = await prisma.$transaction(async (tx) => {
    const ing = await lockIngredient(tx, body.ingredientId);
    const before = D(ing.currentStock);
    const delta = newStock.sub(before);

    const updated = await tx.ingredient.update({
      where: { id: body.ingredientId },
      data: { currentStock: newStock },
      include: { category: true, unit: true, supplier: { select: { id: true, name: true } } },
    });

    const txn = await tx.inventoryTransaction.create({
      data: {
        ingredientId: body.ingredientId,
        type: 'ADJUST',
        quantity: delta,
        stockBefore: before,
        stockAfter: newStock,
        notes: body.reason,
        createdById: userId,
      },
      include: {
        ingredient: { include: { unit: true } },
        createdBy: { select: { name: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'INVENTORY_STOCK_ADJUST',
        entityType: 'Ingredient',
        entityId: body.ingredientId,
        before: { stock: Number(before) },
        after: { stock: Number(newStock), reason: body.reason },
      },
    });

    return { item: updated, txn };
  });

  return serializeDecimals({
    item: presentIngredient(result.item),
    movement: presentMovement(result.txn),
  });
}

async function recordWastage(body, userId) {
  const quantity = D(body.quantity);
  const result = await prisma.$transaction(async (tx) => {
    const ing = await lockIngredient(tx, body.ingredientId);
    const before = D(ing.currentStock);
    if (quantity.gt(before)) {
      throw new AppError(
        `Cannot record wastage of ${Number(quantity)} — only ${Number(before)} available for ${ing.name}`,
        422
      );
    }
    const after = before.sub(quantity);

    const updated = await tx.ingredient.update({
      where: { id: body.ingredientId },
      data: { currentStock: after },
      include: { category: true, unit: true, supplier: { select: { id: true, name: true } } },
    });

    await tx.wastageRecord.create({
      data: {
        ingredientId: body.ingredientId,
        quantity,
        reason: body.reason,
        createdById: userId,
      },
    });

    const txn = await tx.inventoryTransaction.create({
      data: {
        ingredientId: body.ingredientId,
        type: 'WASTE',
        quantity: quantity.neg(),
        stockBefore: before,
        stockAfter: after,
        notes: body.reason,
        createdById: userId,
      },
      include: {
        ingredient: { include: { unit: true } },
        createdBy: { select: { name: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'INVENTORY_WASTAGE',
        entityType: 'Ingredient',
        entityId: body.ingredientId,
        after: { quantity: Number(quantity), reason: body.reason },
      },
    });

    return { item: updated, txn };
  });

  return serializeDecimals({
    item: presentIngredient(result.item),
    movement: presentMovement(result.txn),
  });
}

async function listMovements(query) {
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (query.ingredientId) where.ingredientId = query.ingredientId;
  if (query.type) where.type = query.type;

  const [total, rows] = await Promise.all([
    prisma.inventoryTransaction.count({ where }),
    prisma.inventoryTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        ingredient: { include: { unit: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  const withOrders = await resolveOrderNumbers(rows);
  const items = withOrders.map((r) => serializeDecimals(presentMovement(r)));
  return paginatedResult(items, total, page, limit);
}

module.exports = {
  addStock,
  adjustStock,
  recordWastage,
  listMovements,
  lockIngredient,
  presentMovement,
  D,
  toNum,
};
