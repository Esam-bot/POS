const { randomUUID } = require('crypto');
const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');
const { presentIngredient, stockStatus, toNum } = require('./stockStatus');

const itemInclude = {
  category: true,
  unit: true,
  supplier: { select: { id: true, name: true } },
};

async function assertCategory(categoryId) {
  const cat = await prisma.inventoryCategory.findFirst({
    where: { id: categoryId, deletedAt: null, isActive: true },
  });
  if (!cat) throw new AppError('Inventory category not found or inactive', 404);
}

async function assertUnit(unitId) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) throw new AppError('Unit of measurement not found', 404);
}

async function assertSupplier(supplierId) {
  if (!supplierId) return;
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, deletedAt: null },
  });
  if (!supplier) throw new AppError('Supplier not found', 404);
}

async function assertUniqueName(name, excludeId) {
  const existing = await prisma.ingredient.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existing) throw new AppError('An inventory item with this name already exists', 409);
}

async function listItems(query) {
  const { page, limit, skip } = parsePagination(query);
  const where = { deletedAt: null };
  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' };
  }
  if (query.isActive !== undefined) {
    where.isActive = query.isActive === true || query.isActive === 'true';
  }
  if (query.categoryId) where.categoryId = query.categoryId;

  // Stock filters that need column-vs-column comparison use SQL on the server.
  if (query.stockStatus === 'OUT_OF_STOCK') {
    where.currentStock = { lte: 0 };
  } else if (query.stockStatus === 'LOW_STOCK' || query.stockStatus === 'IN_STOCK') {
    const params = [];
    const clauses = [`"deletedAt" IS NULL`];
    if (query.search) {
      params.push(`%${query.search}%`);
      clauses.push(`name ILIKE $${params.length}`);
    }
    if (query.isActive === true || query.isActive === 'true') {
      clauses.push(`"isActive" = true`);
    } else if (query.isActive === false || query.isActive === 'false') {
      clauses.push(`"isActive" = false`);
    }
    if (query.categoryId) {
      params.push(query.categoryId);
      clauses.push(`"categoryId" = $${params.length}::uuid`);
    }
    if (query.stockStatus === 'LOW_STOCK') {
      clauses.push(`"currentStock" > 0 AND "minStock" > 0 AND "currentStock" <= "minStock"`);
    } else {
      clauses.push(
        `(("minStock" <= 0 AND "currentStock" > 0) OR ("minStock" > 0 AND "currentStock" > "minStock"))`
      );
    }
    const idRows = await prisma.$queryRawUnsafe(
      `SELECT id FROM ingredients WHERE ${clauses.join(' AND ')} ORDER BY name ASC`,
      ...params
    );
    const ids = idRows.map((r) => r.id);
    const total = ids.length;
    const pageIds = ids.slice(skip, skip + limit);
    if (!pageIds.length) return paginatedResult([], total, page, limit);
    const rows = await prisma.ingredient.findMany({
      where: { id: { in: pageIds } },
      include: itemInclude,
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    const ordered = pageIds.map((id) => byId[id]).filter(Boolean);
    return paginatedResult(
      ordered.map((r) => serializeDecimals(presentIngredient(r))),
      total,
      page,
      limit
    );
  }

  const [total, rows] = await Promise.all([
    prisma.ingredient.count({ where }),
    prisma.ingredient.findMany({
      where,
      include: itemInclude,
      orderBy: { name: 'asc' },
      skip,
      take: limit,
    }),
  ]);
  return paginatedResult(
    rows.map((r) => serializeDecimals(presentIngredient(r))),
    total,
    page,
    limit
  );
}

async function getItem(id) {
  const row = await prisma.ingredient.findFirst({
    where: { id, deletedAt: null },
    include: itemInclude,
  });
  if (!row) throw new AppError('Inventory item not found', 404);
  return serializeDecimals(presentIngredient(row));
}

async function createItem(data) {
  await assertCategory(data.categoryId);
  await assertUnit(data.unitId);
  await assertSupplier(data.supplierId);
  await assertUniqueName(data.name);

  const sku = `INV-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const row = await prisma.ingredient.create({
    data: {
      name: data.name.trim(),
      sku,
      description: data.description || null,
      categoryId: data.categoryId,
      unitId: data.unitId,
      supplierId: data.supplierId || null,
      currentStock: data.currentStock ?? 0,
      minStock: data.minStock ?? 0,
      avgCost: data.avgCost ?? 0,
      isActive: data.isActive ?? true,
    },
    include: itemInclude,
  });
  return serializeDecimals(presentIngredient(row));
}

async function updateItem(id, data) {
  const existing = await prisma.ingredient.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new AppError('Inventory item not found', 404);
  if (data.categoryId) await assertCategory(data.categoryId);
  if (data.unitId) await assertUnit(data.unitId);
  if (data.supplierId !== undefined) await assertSupplier(data.supplierId);
  if (data.name) await assertUniqueName(data.name, id);

  const row = await prisma.ingredient.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
      ...(data.unitId !== undefined ? { unitId: data.unitId } : {}),
      ...(data.supplierId !== undefined ? { supplierId: data.supplierId || null } : {}),
      ...(data.minStock !== undefined ? { minStock: data.minStock } : {}),
      ...(data.avgCost !== undefined ? { avgCost: data.avgCost } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
    include: itemInclude,
  });
  return serializeDecimals(presentIngredient(row));
}

async function setItemStatus(id, isActive) {
  return updateItem(id, { isActive });
}

async function archiveItem(id) {
  const existing = await prisma.ingredient.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { transactions: true } } },
  });
  if (!existing) throw new AppError('Inventory item not found', 404);
  if (existing._count.transactions > 0 || toNum(existing.currentStock) !== 0) {
    const row = await prisma.ingredient.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
      include: itemInclude,
    });
    return serializeDecimals({
      ...presentIngredient(row),
      archived: true,
      message: 'Item deactivated because it has stock history',
    });
  }
  await prisma.ingredient.delete({ where: { id } });
  return { archived: true, deleted: true, name: existing.name };
}

async function listUnits() {
  const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
  return units.map((u) => ({
    id: u.id,
    name: u.name,
    code: u.code,
    dimension: u.dimension,
    toBaseFactor: u.toBaseFactor,
  }));
}

async function listSuppliersLite() {
  const rows = await prisma.supplier.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return rows;
}

module.exports = {
  listItems,
  getItem,
  createItem,
  updateItem,
  setItemStatus,
  archiveItem,
  listUnits,
  listSuppliersLite,
};
