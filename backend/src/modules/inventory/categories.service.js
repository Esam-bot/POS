const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');

async function assertUniqueName(name, excludeId) {
  const existing = await prisma.inventoryCategory.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existing) throw new AppError('Category name already exists', 409);
}

async function listCategories(query) {
  const { page, limit, skip } = parsePagination(query);
  const where = { deletedAt: null };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.isActive !== undefined) {
    where.isActive = query.isActive === true || query.isActive === 'true';
  }

  const [total, rows] = await Promise.all([
    prisma.inventoryCategory.count({ where }),
    prisma.inventoryCategory.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { ingredients: { where: { deletedAt: null } } } },
      },
    }),
  ]);

  const items = rows.map((row) =>
    serializeDecimals({
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      itemCount: row._count.ingredients,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  );
  return paginatedResult(items, total, page, limit);
}

async function getCategory(id) {
  const category = await prisma.inventoryCategory.findFirst({
    where: { id, deletedAt: null },
    include: {
      ingredients: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        include: { unit: true },
      },
    },
  });
  if (!category) throw new AppError('Category not found', 404);
  return serializeDecimals({
    id: category.id,
    name: category.name,
    description: category.description,
    isActive: category.isActive,
    items: category.ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      unitName: i.unit?.name,
      currentStock: i.currentStock,
      minStock: i.minStock,
      isActive: i.isActive,
    })),
  });
}

async function createCategory(data) {
  await assertUniqueName(data.name);
  const row = await prisma.inventoryCategory.create({
    data: {
      name: data.name.trim(),
      description: data.description || null,
      isActive: data.isActive ?? true,
    },
  });
  return serializeDecimals({
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    itemCount: 0,
  });
}

async function updateCategory(id, data) {
  const existing = await prisma.inventoryCategory.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new AppError('Category not found', 404);
  if (data.name) await assertUniqueName(data.name, id);
  const row = await prisma.inventoryCategory.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  return serializeDecimals({
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
  });
}

async function setCategoryStatus(id, isActive) {
  return updateCategory(id, { isActive });
}

async function softDeleteCategory(id) {
  const existing = await prisma.inventoryCategory.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { ingredients: { where: { deletedAt: null } } } } },
  });
  if (!existing) throw new AppError('Category not found', 404);
  if (existing._count.ingredients > 0) {
    throw new AppError(
      'Cannot delete category that has ingredients. Move or delete ingredients first, or deactivate the category.',
      409
    );
  }
  await prisma.inventoryCategory.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
  return { deleted: true, id, name: existing.name };
}

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  setCategoryStatus,
  softDeleteCategory,
};
