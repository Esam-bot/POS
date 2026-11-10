const { Prisma } = require('@prisma/client');
const AppError = require('../../utils/AppError');

function D(value) {
  return new Prisma.Decimal(value);
}

/**
 * Resolve menu catalog rows into priced line snapshots.
 * Never trusts client-submitted prices.
 */
async function buildPricedLines(tx, itemInputs) {
  const lines = [];

  for (const input of itemInputs) {
    const menuItem = await tx.menuItem.findFirst({
      where: {
        id: input.menuItemId,
        deletedAt: null,
        isActive: true,
        isAvailable: true,
        category: { isActive: true, deletedAt: null },
      },
      include: {
        variants: { where: { deletedAt: null } },
        modifierGroups: {
          include: {
            modifierGroup: {
              include: {
                modifiers: { where: { deletedAt: null, isActive: true } },
              },
            },
          },
        },
      },
    });

    if (!menuItem) {
      throw new AppError('One or more menu items are unavailable', 400);
    }

    let unitPrice = D(menuItem.basePrice);
    let variantNameSnapshot = null;
    let variantId = null;

    if (input.variantId) {
      const variant = menuItem.variants.find((v) => v.id === input.variantId && v.isActive);
      if (!variant) {
        throw new AppError(`Variant is unavailable for ${menuItem.name}`, 400);
      }
      unitPrice = D(variant.price);
      variantNameSnapshot = variant.name;
      variantId = variant.id;
    }

    const allowedModifiers = new Map();
    for (const link of menuItem.modifierGroups) {
      const group = link.modifierGroup;
      if (!group || !group.isActive || group.deletedAt) continue;
      for (const mod of group.modifiers) {
        allowedModifiers.set(mod.id, mod);
      }
    }

    const modifierRows = [];
    let modifierTotal = D(0);
    for (const sel of input.modifiers || []) {
      const mod = allowedModifiers.get(sel.modifierId);
      if (!mod) {
        throw new AppError(`Invalid modifier for ${menuItem.name}`, 400);
      }
      const qty = sel.quantity || 1;
      const priceDelta = D(mod.priceDelta);
      modifierTotal = modifierTotal.plus(priceDelta.times(qty));
      modifierRows.push({
        modifierId: mod.id,
        nameSnapshot: mod.name,
        priceDelta,
        quantity: qty,
      });
    }

    const quantity = D(input.quantity);
    const lineUnit = unitPrice.plus(modifierTotal);
    const lineTotal = lineUnit.times(quantity).toDecimalPlaces(2);

    lines.push({
      menuItemId: menuItem.id,
      variantId,
      kitchenStationId: menuItem.kitchenStationId,
      nameSnapshot: menuItem.name,
      skuSnapshot: menuItem.sku,
      variantNameSnapshot,
      unitPrice: lineUnit.toDecimalPlaces(2),
      quantity,
      lineTotal,
      specialInstructions: input.specialInstructions || null,
      modifiers: modifierRows,
    });
  }

  return lines;
}

function sumSubtotal(lines) {
  return lines.reduce((acc, line) => acc.plus(line.lineTotal), D(0)).toDecimalPlaces(2);
}

module.exports = { buildPricedLines, sumSubtotal, D };
