const { Prisma } = require('@prisma/client');
const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { toNum } = require('./stockStatus');

function D(v) {
  return new Prisma.Decimal(v);
}

/**
 * Build aggregated ingredient requirements for an order (recipes + modifiers).
 * Returns Map<ingredientId, { name, unitName, quantity: Decimal }>
 */
async function buildRequirements(tx, orderId) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        where: { status: { not: 'CANCELLED' } },
        include: {
          menuItem: { select: { id: true, name: true, trackInventory: true } },
          variant: { select: { id: true } },
          modifiers: true,
        },
      },
    },
  });
  if (!order) throw new AppError('Order not found', 404);

  const needs = new Map();

  function addNeed(ingredient, qty) {
    const q = D(qty);
    if (q.lte(0)) return;
    const prev = needs.get(ingredient.id);
    if (prev) {
      prev.quantity = prev.quantity.add(q);
    } else {
      needs.set(ingredient.id, {
        id: ingredient.id,
        name: ingredient.name,
        unitName: ingredient.unit?.name || '',
        quantity: q,
      });
    }
  }

  for (const line of order.items) {
    if (!line.menuItem?.trackInventory) continue;
    const servings = Number(line.quantity) || 0;
    if (servings <= 0) continue;

    const recipe = await tx.recipe.findFirst({
      where: {
        menuItemId: line.menuItemId,
        variantId: line.variantId || null,
        isActive: true,
        deletedAt: null,
      },
      include: {
        items: { include: { ingredient: { include: { unit: true } } } },
      },
    });

    // Fall back to base recipe (no variant) if variant-specific missing
    let activeRecipe = recipe;
    if (!activeRecipe && line.variantId) {
      activeRecipe = await tx.recipe.findFirst({
        where: {
          menuItemId: line.menuItemId,
          variantId: null,
          isActive: true,
          deletedAt: null,
        },
        include: {
          items: { include: { ingredient: { include: { unit: true } } } },
        },
      });
    }

    if (activeRecipe) {
      const yieldQty = Number(activeRecipe.yieldQty) || 1;
      for (const ri of activeRecipe.items) {
        const perServing = D(ri.quantity).div(yieldQty);
        addNeed(ri.ingredient, perServing.mul(servings));
      }
    }

    for (const mod of line.modifiers || []) {
      if (!mod.modifierId) continue;
      const modQty = (Number(mod.quantity) || 1) * servings;
      const mappings = await tx.modifierIngredient.findMany({
        where: { modifierId: mod.modifierId },
        include: { ingredient: { include: { unit: true } } },
      });
      for (const m of mappings) {
        addNeed(m.ingredient, D(m.quantity).mul(modQty));
      }
    }
  }

  return { order, needs };
}

/**
 * Preview shortages without mutating stock.
 */
async function previewDeduction(orderId) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.orderInventoryDeduction.findUnique({
      where: { orderId },
    });
    if (existing) {
      return { alreadyDeducted: true, shortages: [], requirements: [] };
    }
    const { needs } = await buildRequirements(tx, orderId);
    const shortages = [];
    const requirements = [];
    for (const need of needs.values()) {
      const ing = await tx.ingredient.findUnique({ where: { id: need.id } });
      const available = toNum(ing?.currentStock);
      const required = toNum(need.quantity);
      requirements.push({
        name: need.name,
        unitName: need.unitName,
        required,
        available,
      });
      if (required > available + 1e-9) {
        shortages.push({
          name: need.name,
          unitName: need.unitName,
          required,
          available,
          shortBy: required - available,
        });
      }
    }
    return { alreadyDeducted: false, shortages, requirements };
  });
}

/**
 * Consume ingredients once per order after successful payment.
 * @param {object} opts
 * @param {string} opts.orderId
 * @param {string} opts.userId
 * @param {boolean} opts.allowNegative - inventory.allow_negative
 * @param {import('@prisma/client').Prisma.TransactionClient} [opts.tx] - optional outer tx
 */
async function deductForOrder({ orderId, userId, allowNegative = false, tx: outerTx = null }) {
  const run = async (tx) => {
    const already = await tx.orderInventoryDeduction.findUnique({ where: { orderId } });
    if (already) {
      return { deducted: false, replayed: true, movements: [], shortages: [] };
    }

    const { order, needs } = await buildRequirements(tx, orderId);
    if (!needs.size) {
      await tx.orderInventoryDeduction.create({
        data: { orderId, notes: 'No recipe ingredients to deduct' },
      });
      return { deducted: true, replayed: false, movements: [], shortages: [], empty: true };
    }

    const shortages = [];
    const locked = [];
    for (const need of needs.values()) {
      const rows = await tx.$queryRawUnsafe(
        `SELECT id, name, "currentStock" FROM ingredients WHERE id = $1::uuid FOR UPDATE`,
        need.id
      );
      if (!rows.length) {
        throw new AppError(`Ingredient missing: ${need.name}`, 404);
      }
      const available = D(rows[0].currentStock);
      locked.push({ need, available, row: rows[0] });
      if (need.quantity.gt(available)) {
        shortages.push({
          name: need.name,
          required: Number(need.quantity),
          available: Number(available),
          shortBy: Number(need.quantity.sub(available)),
        });
      }
    }

    if (shortages.length && !allowNegative) {
      const detail = shortages
        .map((s) => `${s.name}: need ${s.required}, have ${s.available}`)
        .join('; ');
      throw new AppError(
        `Not enough stock to complete this sale. ${detail}. Ask a manager to restock or approve override.`,
        422,
        [{ code: 'INSUFFICIENT_STOCK', shortages }]
      );
    }

    const movements = [];
    for (const { need, available } of locked) {
      const after = available.sub(need.quantity);
      await tx.ingredient.update({
        where: { id: need.id },
        data: { currentStock: after },
      });
      const txn = await tx.inventoryTransaction.create({
        data: {
          ingredientId: need.id,
          type: 'CONSUME',
          quantity: need.quantity.neg(),
          stockBefore: available,
          stockAfter: after,
          referenceType: 'Order',
          referenceId: orderId,
          notes: `Order ${order.orderNumber}`,
          createdById: userId,
        },
      });
      movements.push(txn);
    }

    await tx.orderInventoryDeduction.create({
      data: {
        orderId,
        notes: shortages.length
          ? `Deducted with shortage override (${shortages.length} items)`
          : 'Deducted after successful payment',
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'INVENTORY_CONSUME_ORDER',
        entityType: 'Order',
        entityId: orderId,
        after: {
          orderNumber: order.orderNumber,
          ingredientCount: movements.length,
          shortages,
        },
      },
    });

    return {
      deducted: true,
      replayed: false,
      movements,
      shortages,
      empty: false,
    };
  };

  if (outerTx) return run(outerTx);
  return prisma.$transaction(run);
}

module.exports = {
  buildRequirements,
  previewDeduction,
  deductForOrder,
};
