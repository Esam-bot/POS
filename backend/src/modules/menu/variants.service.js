const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { toDecimal, serializeDecimals } = require('../../utils/decimal');

async function getActiveItem(menuItemId) {
  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, deletedAt: null } });
  if (!item) throw new AppError('Menu item not found', 404);
  return item;
}

async function createVariant(menuItemId, data) {
  await getActiveItem(menuItemId);

  const duplicate = await prisma.menuVariant.findFirst({
    where: {
      menuItemId,
      deletedAt: null,
      name: { equals: data.name, mode: 'insensitive' },
    },
  });
  if (duplicate) throw new AppError('Variant name already exists for this item', 409);

  const variant = await prisma.menuVariant.create({
    data: {
      menuItemId,
      name: data.name,
      price: toDecimal(data.price),
      sku: data.sku || null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  });
  return serializeDecimals(variant);
}

async function updateVariant(variantId, data) {
  const existing = await prisma.menuVariant.findFirst({
    where: { id: variantId, deletedAt: null },
  });
  if (!existing) throw new AppError('Variant not found', 404);

  if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicate = await prisma.menuVariant.findFirst({
      where: {
        menuItemId: existing.menuItemId,
        deletedAt: null,
        name: { equals: data.name, mode: 'insensitive' },
        NOT: { id: variantId },
      },
    });
    if (duplicate) throw new AppError('Variant name already exists for this item', 409);
  }

  const variant = await prisma.menuVariant.update({
    where: { id: variantId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.price !== undefined ? { price: toDecimal(data.price) } : {}),
      ...(data.sku !== undefined ? { sku: data.sku || null } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  return serializeDecimals(variant);
}

async function setVariantStatus(variantId, isActive) {
  return updateVariant(variantId, { isActive });
}

async function softDeleteVariant(variantId) {
  const existing = await prisma.menuVariant.findFirst({
    where: { id: variantId, deletedAt: null },
    include: { _count: { select: { orderItems: true } } },
  });
  if (!existing) throw new AppError('Variant not found', 404);
  if (existing._count.orderItems > 0) {
    throw new AppError('Cannot delete variant referenced by orders. Deactivate it instead.', 409);
  }
  await prisma.menuVariant.update({
    where: { id: variantId },
    data: { deletedAt: new Date(), isActive: false },
  });
  return true;
}

module.exports = {
  createVariant,
  updateVariant,
  setVariantStatus,
  softDeleteVariant,
};
