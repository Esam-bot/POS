const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');

async function assertUniqueCategoryName(name, excludeId) {
  const existing = await prisma.menuCategory.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existing) {
    throw new AppError('Category name already exists', 409);
  }
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
    prisma.menuCategory.count({ where }),
    prisma.menuCategory.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    }),
  ]);

  const items = rows.map((row) =>
    serializeDecimals({
      ...row,
      itemCount: row._count.items,
      _count: undefined,
    })
  );

  return paginatedResult(items, total, page, limit);
}

async function getCategory(id) {
  const category = await prisma.menuCategory.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { items: { where: { deletedAt: null } } } } },
  });
  if (!category) throw new AppError('Category not found', 404);
  return serializeDecimals({
    ...category,
    itemCount: category._count.items,
    _count: undefined,
  });
}

async function createCategory(data) {
  await assertUniqueCategoryName(data.name);
  const category = await prisma.menuCategory.create({
    data: {
      name: data.name,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  });
  return serializeDecimals(category);
}

async function updateCategory(id, data) {
  const existing = await prisma.menuCategory.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Category not found', 404);
  if (data.name && data.name !== existing.name) {
    await assertUniqueCategoryName(data.name, id);
  }
  const category = await prisma.menuCategory.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl || null } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  return serializeDecimals(category);
}

async function setCategoryStatus(id, isActive) {
  return updateCategory(id, { isActive });
}

async function softDeleteCategory(id) {
  const existing = await prisma.menuCategory.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { items: { where: { deletedAt: null } } } } },
  });
  if (!existing) throw new AppError('Category not found', 404);
  if (existing._count.items > 0) {
    throw new AppError('Cannot delete category that has menu items. Deactivate it instead.', 409);
  }
  await prisma.menuCategory.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
  return true;
}

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  setCategoryStatus,
  softDeleteCategory,
};
