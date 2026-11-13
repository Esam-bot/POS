const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { toDecimal, serializeDecimals } = require('../../utils/decimal');

const itemInclude = {
  category: true,
  kitchenStation: true,
  variants: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  },
  modifierGroups: {
    orderBy: { sortOrder: 'asc' },
    include: {
      modifierGroup: {
        include: {
          modifiers: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
      },
    },
  },
};

async function assertActiveCategory(categoryId) {
  const category = await prisma.menuCategory.findFirst({
    where: { id: categoryId, deletedAt: null },
  });
  if (!category) throw new AppError('Category not found', 404);
  if (!category.isActive) {
    throw new AppError('Cannot use an inactive category', 400);
  }
  return category;
}

async function assertActiveStation(stationId) {
  if (!stationId) return null;
  const station = await prisma.kitchenStation.findFirst({
    where: { id: stationId, deletedAt: null },
  });
  if (!station) throw new AppError('Kitchen station not found', 404);
  if (!station.isActive) {
    throw new AppError('Cannot assign an inactive kitchen station', 400);
  }
  return station;
}

async function assertUniqueSku(sku, excludeId) {
  const existing = await prisma.menuItem.findFirst({
    where: {
      sku: { equals: sku, mode: 'insensitive' },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existing) throw new AppError('SKU already exists', 409);
}

function mapItem(item, { forPos = false } = {}) {
  if (!item) return item;
  let links = item.modifierGroups || [];
  if (forPos) {
    links = links.filter(
      (link) => link.modifierGroup && link.modifierGroup.isActive && !link.modifierGroup.deletedAt
    );
  }
  const mapped = {
    ...item,
    variants: item.variants || [],
    modifierGroups: links.map((link) => ({
      sortOrder: link.sortOrder,
      ...link.modifierGroup,
      modifiers: (link.modifierGroup?.modifiers || []).filter((m) =>
        forPos ? m.isActive && !m.deletedAt : true
      ),
    })),
  };
  return serializeDecimals(mapped);
}

async function listItems(query) {
  const { page, limit, skip } = parsePagination(query);
  const forPos = query.forPos === true || query.forPos === 'true';
  const where = {};

  if (forPos) {
    where.deletedAt = null;
    where.isActive = true;
    where.isAvailable = true;
    where.category = { isActive: true, deletedAt: null };
  } else {
    const archived = query.archived === true || query.archived === 'true';
    if (query.archived !== undefined) {
      where.deletedAt = archived ? { not: null } : null;
    } else {
      where.deletedAt = null;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive === true || query.isActive === 'true';
    }
    if (query.isAvailable !== undefined) {
      where.isAvailable = query.isAvailable === true || query.isAvailable === 'true';
    }
  }

  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.kitchenStationId) where.kitchenStationId = query.kitchenStationId;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { sku: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.menuItem.count({ where }),
    prisma.menuItem.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ name: 'asc' }],
      include: {
        category: true,
        kitchenStation: true,
        variants: {
          where: forPos
            ? { deletedAt: null, isActive: true }
            : { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        _count: { select: { variants: { where: { deletedAt: null } } } },
      },
    }),
  ]);

  const items = rows.map((row) =>
    serializeDecimals({
      ...row,
      variantCount: row._count.variants,
      _count: undefined,
      modifierGroups: undefined,
    })
  );

  return paginatedResult(items, total, page, limit);
}

async function getItem(id, { forPos = false } = {}) {
  const item = await prisma.menuItem.findFirst({
    where: {
      id,
      ...(forPos
        ? {
            deletedAt: null,
            isActive: true,
            isAvailable: true,
            category: { isActive: true, deletedAt: null },
          }
        : {}),
    },
    include: itemInclude,
  });
  if (!item || (item.deletedAt && forPos)) throw new AppError('Menu item not found', 404);
  return mapItem(item, { forPos });
}

async function createItem(data) {
  await assertActiveCategory(data.categoryId);
  await assertActiveStation(data.kitchenStationId);
  await assertUniqueSku(data.sku);

  const item = await prisma.menuItem.create({
    data: {
      categoryId: data.categoryId,
      kitchenStationId: data.kitchenStationId || null,
      name: data.name,
      description: data.description || null,
      sku: data.sku,
      imageUrl: data.imageUrl || null,
      basePrice: toDecimal(data.basePrice),
      prepTimeMinutes: data.prepTimeMinutes ?? 5,
      isAvailable: data.isAvailable ?? true,
      isActive: data.isActive ?? true,
      trackInventory: data.trackInventory ?? false,
    },
    include: itemInclude,
  });
  return mapItem(item, {});
}

async function updateItem(id, data) {
  const existing = await prisma.menuItem.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Menu item not found', 404);

  if (data.categoryId) await assertActiveCategory(data.categoryId);
  if (data.kitchenStationId !== undefined) await assertActiveStation(data.kitchenStationId);
  if (data.sku && data.sku.toLowerCase() !== existing.sku.toLowerCase()) {
    await assertUniqueSku(data.sku, id);
  }

  const item = await prisma.menuItem.update({
    where: { id },
    data: {
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
      ...(data.kitchenStationId !== undefined
        ? { kitchenStationId: data.kitchenStationId || null }
        : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.sku !== undefined ? { sku: data.sku } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl || null } : {}),
      ...(data.basePrice !== undefined ? { basePrice: toDecimal(data.basePrice) } : {}),
      ...(data.prepTimeMinutes !== undefined ? { prepTimeMinutes: data.prepTimeMinutes } : {}),
      ...(data.isAvailable !== undefined ? { isAvailable: data.isAvailable } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.trackInventory !== undefined ? { trackInventory: data.trackInventory } : {}),
    },
    include: itemInclude,
  });
  return mapItem(item);
}

async function setAvailability(id, isAvailable) {
  return updateItem(id, { isAvailable });
}

async function setArchive(id, archived) {
  const existing = await prisma.menuItem.findUnique({ where: { id } });
  if (!existing) throw new AppError('Menu item not found', 404);

  if (archived) {
    if (existing.deletedAt) throw new AppError('Menu item is already archived', 400);
    const item = await prisma.menuItem.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, isAvailable: false },
      include: itemInclude,
    });
    return mapItem(item);
  }

  if (!existing.deletedAt) throw new AppError('Menu item is not archived', 400);
  await assertActiveCategory(existing.categoryId);
  if (existing.kitchenStationId) await assertActiveStation(existing.kitchenStationId);
  await assertUniqueSku(existing.sku, id);

  const item = await prisma.menuItem.update({
    where: { id },
    data: { deletedAt: null, isActive: true },
    include: itemInclude,
  });
  return mapItem(item);
}

async function getOverview() {
  const [
    totalCategories,
    totalItems,
    activeItems,
    inactiveItems,
    modifierGroups,
    kitchenStations,
  ] = await Promise.all([
    prisma.menuCategory.count({ where: { deletedAt: null } }),
    prisma.menuItem.count({ where: { deletedAt: null } }),
    prisma.menuItem.count({ where: { deletedAt: null, isActive: true } }),
    prisma.menuItem.count({ where: { deletedAt: null, isActive: false } }),
    prisma.modifierGroup.count({ where: { deletedAt: null } }),
    prisma.kitchenStation.count({ where: { deletedAt: null } }),
  ]);

  return {
    totalCategories,
    totalItems,
    activeItems,
    inactiveItems,
    modifierGroups,
    kitchenStations,
  };
}

module.exports = {
  listItems,
  getItem,
  createItem,
  updateItem,
  setAvailability,
  setArchive,
  getOverview,
  assertActiveCategory,
  assertActiveStation,
};
