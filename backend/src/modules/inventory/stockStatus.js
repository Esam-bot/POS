const { Prisma } = require('@prisma/client');

function toNum(v) {
  if (v == null) return 0;
  if (v instanceof Prisma.Decimal) return Number(v.toString());
  return Number(v);
}

function stockStatus(ingredient) {
  const stock = toNum(ingredient.currentStock);
  const min = toNum(ingredient.minStock);
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (min > 0 && stock <= min) return 'LOW_STOCK';
  return 'IN_STOCK';
}

function stockStatusLabel(status) {
  if (status === 'OUT_OF_STOCK') return 'Out of Stock';
  if (status === 'LOW_STOCK') return 'Low Stock';
  return 'In Stock';
}

function txnTypeLabel(type) {
  const map = {
    RECEIVE: 'Stock added',
    ADJUST: 'Stock adjusted',
    WASTE: 'Wastage',
    CONSUME: 'Used for sale',
    REVERSE: 'Stock restored',
    RESERVE: 'Reserved',
    RELEASE: 'Reservation released',
  };
  return map[type] || type;
}

/** Public shape for staff — no SKU. */
function presentIngredient(row) {
  const status = stockStatus(row);
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    categoryId: row.categoryId,
    categoryName: row.category?.name || null,
    unitId: row.unitId,
    unitName: row.unit?.name || null,
    unitCode: row.unit?.code || null,
    unitDimension: row.unit?.dimension || null,
    supplierId: row.supplierId || null,
    supplierName: row.supplier?.name || null,
    currentStock: row.currentStock,
    minStock: row.minStock,
    avgCost: row.avgCost,
    stockValue: toNum(row.currentStock) * toNum(row.avgCost),
    stockStatus: status,
    stockStatusLabel: stockStatusLabel(status),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

module.exports = {
  toNum,
  stockStatus,
  stockStatusLabel,
  txnTypeLabel,
  presentIngredient,
};
