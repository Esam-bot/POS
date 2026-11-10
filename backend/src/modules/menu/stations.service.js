const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');

async function assertUniqueStation(name, code, excludeId) {
  const existing = await prisma.kitchenStation.findFirst({
    where: {
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        ...(code ? [{ code: { equals: code, mode: 'insensitive' } }] : []),
      ],
    },
  });
  if (existing) {
    if (code && existing.code.toLowerCase() === code.toLowerCase()) {
      throw new AppError('Station code already exists', 409);
    }
    throw new AppError('Station name already exists', 409);
  }
}

async function listStations(query) {
  const { page, limit, skip } = parsePagination(query);
  const where = { deletedAt: null };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { code: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.isActive !== undefined) {
    where.isActive = query.isActive === true || query.isActive === 'true';
  }

  const [total, rows] = await Promise.all([
    prisma.kitchenStation.count({ where }),
    prisma.kitchenStation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: { _count: { select: { menuItems: { where: { deletedAt: null } } } } },
    }),
  ]);

  const items = rows.map((row) =>
    serializeDecimals({
      ...row,
      itemCount: row._count.menuItems,
      _count: undefined,
    })
  );
  return paginatedResult(items, total, page, limit);
}

async function getStation(id) {
  const station = await prisma.kitchenStation.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { menuItems: { where: { deletedAt: null } } } } },
  });
  if (!station) throw new AppError('Kitchen station not found', 404);
  return serializeDecimals({
    ...station,
    itemCount: station._count.menuItems,
    _count: undefined,
  });
}

async function createStation(data) {
  await assertUniqueStation(data.name, data.code);
  const station = await prisma.kitchenStation.create({
    data: {
      name: data.name,
      code: data.code,
      description: data.description || null,
      isActive: data.isActive ?? true,
    },
  });
  return serializeDecimals(station);
}

async function updateStation(id, data) {
  const existing = await prisma.kitchenStation.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Kitchen station not found', 404);
  if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
    await assertUniqueStation(data.name, null, id);
  }
  const station = await prisma.kitchenStation.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  return serializeDecimals(station);
}

async function setStationStatus(id, isActive) {
  return updateStation(id, { isActive });
}

async function softDeleteStation(id) {
  const existing = await prisma.kitchenStation.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: {
          menuItems: { where: { deletedAt: null } },
          tickets: true,
        },
      },
    },
  });
  if (!existing) throw new AppError('Kitchen station not found', 404);
  if (existing._count.menuItems > 0 || existing._count.tickets > 0) {
    throw new AppError(
      'Cannot delete station referenced by menu items or kitchen tickets. Deactivate it instead.',
      409
    );
  }
  await prisma.kitchenStation.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
  return true;
}

module.exports = {
  listStations,
  getStation,
  createStation,
  updateStation,
  setStationStatus,
  softDeleteStation,
};
