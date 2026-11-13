const { Prisma } = require('@prisma/client');
const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');
const { toIngredientUnit } = require('./units');
const { syncLowStockNotification } = require('./lowStockNotify');

function D(v) {
  return new Prisma.Decimal(v);
}

const poInclude = {
  supplier: { select: { id: true, name: true, phone: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    include: {
      ingredient: { include: { unit: true } },
    },
  },
};

function mapPo(row) {
  return serializeDecimals({
    ...row,
    items: (row.items || []).map((i) => ({
      ...i,
      ingredientName: i.ingredient?.name,
      unitName: i.ingredient?.unit?.name,
      unitCode: i.ingredient?.unit?.code,
      remaining: D(i.qtyOrdered).sub(i.qtyReceived),
    })),
  });
}

async function listPurchases(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.supplierId) where.supplierId = query.supplierId;

  const [total, rows] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: poInclude,
    }),
  ]);
  return paginatedResult(rows.map(mapPo), total, page, limit);
}

async function getPurchase(id) {
  const row = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: poInclude,
  });
  if (!row) throw new AppError('Purchase not found', 404);
  return mapPo(row);
}

async function createPurchase(data, userId) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: data.supplierId, deletedAt: null, isActive: true },
  });
  if (!supplier) throw new AppError('Supplier not found or inactive', 404);
  if (!data.items?.length) throw new AppError('Add at least one ingredient', 400);

  let total = D(0);
  const itemRows = [];
  for (const line of data.items) {
    const ing = await prisma.ingredient.findFirst({
      where: { id: line.ingredientId, deletedAt: null },
      include: { unit: true },
    });
    if (!ing) throw new AppError('Ingredient not found', 404);
    const qty = D(line.qtyOrdered);
    const cost = D(line.unitCost);
    if (qty.lte(0)) throw new AppError('Quantity must be positive', 400);
    if (cost.lt(0)) throw new AppError('Unit cost cannot be negative', 400);
    const lineTotal = qty.mul(cost).toDecimalPlaces(2);
    total = total.add(lineTotal);
    itemRows.push({
      ingredientId: ing.id,
      qtyOrdered: qty,
      unitCost: cost,
      lineTotal,
    });
  }

  const po = await prisma.purchaseOrder.create({
    data: {
      supplierId: data.supplierId,
      createdById: userId,
      status: data.submit ? 'ORDERED' : 'DRAFT',
      totalCost: total.toDecimalPlaces(2),
      notes: data.notes || null,
      orderedAt: data.submit ? new Date() : null,
      items: { create: itemRows },
    },
    include: poInclude,
  });
  return mapPo(po);
}

async function updatePurchase(id, data) {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!existing) throw new AppError('Purchase not found', 404);
  if (!['DRAFT', 'ORDERED'].includes(existing.status)) {
    throw new AppError('Only draft or ordered purchases can be edited', 409);
  }

  if (data.status === 'ORDERED' && existing.status === 'DRAFT') {
    return mapPo(
      await prisma.purchaseOrder.update({
        where: { id },
        data: { status: 'ORDERED', orderedAt: new Date(), notes: data.notes ?? existing.notes },
        include: poInclude,
      })
    );
  }

  if (data.status === 'CANCELLED') {
    if (['PARTIAL', 'RECEIVED'].includes(existing.status)) {
      throw new AppError('Cannot cancel a purchase that already received stock', 409);
    }
    return mapPo(
      await prisma.purchaseOrder.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: poInclude,
      })
    );
  }

  return getPurchase(id);
}

/**
 * Receive quantities. Body: { items: [{ purchaseOrderItemId, qtyReceived }], app }
 * Converts input unit if unitId provided; otherwise assumes ingredient unit.
 */
async function receivePurchase(id, body, userId, appOrReq = null) {
  const receiveKey = body.idempotencyKey || null;

  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: { include: { ingredient: { include: { unit: true } } } },
      },
    });
    if (!po) throw new AppError('Purchase not found', 404);
    if (['CANCELLED', 'DRAFT'].includes(po.status)) {
      throw new AppError('Purchase must be ordered before receiving', 409);
    }
    if (po.status === 'RECEIVED') {
      throw new AppError('Purchase is already fully received', 409);
    }
    if (!body.items?.length) throw new AppError('Nothing to receive', 400);

    // Simple duplicate guard: same idempotency note in recent RECEIVE txns
    if (receiveKey) {
      const dup = await tx.inventoryTransaction.findFirst({
        where: {
          type: 'RECEIVE',
          referenceType: 'PurchaseOrder',
          referenceId: id,
          notes: { contains: receiveKey },
        },
      });
      if (dup) {
        const fresh = await tx.purchaseOrder.findUnique({ where: { id }, include: poInclude });
        return { replayed: true, purchase: mapPo(fresh) };
      }
    }

    const touched = [];
    for (const line of body.items) {
      const item = po.items.find((i) => i.id === line.purchaseOrderItemId);
      if (!item) throw new AppError('Purchase line not found', 404);

      let qtyIn = D(line.qtyReceived);
      if (qtyIn.lte(0)) continue;

      if (line.unitId && line.unitId !== item.ingredient.unitId) {
        const inputUnit = await tx.unit.findUnique({ where: { id: line.unitId } });
        if (!inputUnit) throw new AppError('Unit not found', 404);
        qtyIn = toIngredientUnit(qtyIn, inputUnit, item.ingredient.unit);
      }

      const remaining = D(item.qtyOrdered).sub(item.qtyReceived);
      if (qtyIn.gt(remaining.add(0.0001))) {
        throw new AppError(
          `Cannot receive more than remaining for ${item.ingredient.name} (remaining ${remaining})`,
          400
        );
      }

      const locked = await tx.$queryRawUnsafe(
        `SELECT id, "currentStock", "avgCost" FROM ingredients WHERE id = $1::uuid FOR UPDATE`,
        item.ingredientId
      );
      const before = D(locked[0].currentStock);
      const after = before.add(qtyIn);
      let avgCost = D(locked[0].avgCost);
      const unitCost = D(item.unitCost);
      if (qtyIn.gt(0)) {
        const oldValue = before.mul(avgCost);
        const addValue = qtyIn.mul(unitCost);
        avgCost = after.gt(0) ? oldValue.add(addValue).div(after) : unitCost;
      }

      await tx.ingredient.update({
        where: { id: item.ingredientId },
        data: { currentStock: after, avgCost },
      });

      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: { qtyReceived: D(item.qtyReceived).add(qtyIn) },
      });

      await tx.inventoryTransaction.create({
        data: {
          ingredientId: item.ingredientId,
          type: 'RECEIVE',
          quantity: qtyIn,
          unitCost,
          stockBefore: before,
          stockAfter: after,
          referenceType: 'PurchaseOrder',
          referenceId: id,
          notes: `PO receive${receiveKey ? ` [${receiveKey}]` : ''}`,
          createdById: userId,
        },
      });
      touched.push(item.ingredientId);
    }

    const refreshedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const allReceived = refreshedItems.every((i) => D(i.qtyReceived).gte(D(i.qtyOrdered).sub(0.0001)));
    const anyReceived = refreshedItems.some((i) => D(i.qtyReceived).gt(0));
    const nextStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : po.status;

    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: nextStatus,
        receivedAt: allReceived ? new Date() : po.receivedAt,
      },
      include: poInclude,
    });

    return { replayed: false, purchase: mapPo(updated), touchedIngredientIds: touched };
  }).then(async (result) => {
    if (appOrReq && result.touchedIngredientIds) {
      for (const iid of result.touchedIngredientIds) {
        await syncLowStockNotification(appOrReq, iid);
      }
    }
    return result;
  });
}

module.exports = {
  listPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  receivePurchase,
};
