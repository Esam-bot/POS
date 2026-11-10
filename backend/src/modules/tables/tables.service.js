const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');

async function getDefaultRestaurantId() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!restaurant) throw new AppError('No restaurant configured', 500);
  return restaurant.id;
}

async function assertUniqueNumber(restaurantId, number, excludeId) {
  const existing = await prisma.diningTable.findFirst({
    where: {
      restaurantId,
      number: { equals: number, mode: 'insensitive' },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existing) throw new AppError('Table number already exists', 409);
}

function mapTable(table) {
  if (!table) return table;
  const activeSessionLink = (table.sessionTables || []).find((s) => s.isActive);
  return serializeDecimals({
    ...table,
    activeSession: activeSessionLink
      ? {
          id: activeSessionLink.session.id,
          status: activeSessionLink.session.status,
          openedAt: activeSessionLink.session.openedAt,
          guestCount: activeSessionLink.session.guestCount,
          tableCount: activeSessionLink.session._count?.tables,
          orderCount: activeSessionLink.session._count?.orders,
        }
      : null,
    sessionTables: undefined,
  });
}

async function listTables(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const where = { deletedAt: null };
  if (query.search) {
    where.OR = [
      { number: { contains: query.search, mode: 'insensitive' } },
      { section: { contains: query.search, mode: 'insensitive' } },
      { notes: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.status) where.status = query.status;
  if (query.isActive !== undefined) {
    where.isActive = query.isActive === true || query.isActive === 'true';
  }

  const include = {
    sessionTables: {
      where: { isActive: true },
      include: {
        session: {
          include: {
            _count: {
              select: {
                tables: { where: { isActive: true } },
                orders: true,
              },
            },
          },
        },
      },
    },
  };

  const [total, rows] = await Promise.all([
    prisma.diningTable.count({ where }),
    prisma.diningTable.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ section: 'asc' }, { number: 'asc' }],
      include,
    }),
  ]);

  return paginatedResult(rows.map(mapTable), total, page, limit);
}

async function getTable(id) {
  const table = await prisma.diningTable.findFirst({
    where: { id, deletedAt: null },
    include: {
      sessionTables: {
        where: { isActive: true },
        include: {
          session: {
            include: {
              _count: {
                select: {
                  tables: { where: { isActive: true } },
                  orders: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!table) throw new AppError('Table not found', 404);
  return mapTable(table);
}

async function createTable(data) {
  const restaurantId = await getDefaultRestaurantId();
  if (!data.capacity || data.capacity < 1) {
    throw new AppError('Capacity must be a positive integer', 400);
  }
  await assertUniqueNumber(restaurantId, data.number);

  const table = await prisma.diningTable.create({
    data: {
      restaurantId,
      number: data.number,
      capacity: data.capacity,
      section: data.section || null,
      notes: data.notes || null,
      isActive: data.isActive ?? true,
      status: data.isActive === false ? 'INACTIVE' : 'AVAILABLE',
    },
  });
  return serializeDecimals(table);
}

async function updateTable(id, data) {
  const existing = await prisma.diningTable.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Table not found', 404);

  if (data.number && data.number.toLowerCase() !== existing.number.toLowerCase()) {
    await assertUniqueNumber(existing.restaurantId, data.number, id);
  }

  if (data.isActive === false) {
    const active = await prisma.sessionTable.findFirst({
      where: { tableId: id, isActive: true },
    });
    if (active) {
      throw new AppError('Cannot deactivate a table with an active session', 409);
    }
  }

  const table = await prisma.diningTable.update({
    where: { id },
    data: {
      ...(data.number !== undefined ? { number: data.number } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
      ...(data.section !== undefined ? { section: data.section } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.isActive !== undefined
        ? {
            isActive: data.isActive,
            status: data.isActive ? existing.status === 'INACTIVE' ? 'AVAILABLE' : existing.status : 'INACTIVE',
          }
        : {}),
    },
  });
  return serializeDecimals(table);
}

async function setTableStatus(id, status, { force = false, userId = null } = {}) {
  const existing = await prisma.diningTable.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Table not found', 404);

  if (!existing.isActive && status !== 'INACTIVE') {
    throw new AppError('Cannot change status of an inactive table', 409);
  }

  if (existing.status === 'OCCUPIED' && status === 'AVAILABLE' && !force) {
    throw new AppError(
      'Cannot mark an occupied table as AVAILABLE. Close the session or mark CLEANING first.',
      409
    );
  }

  if (status === 'AVAILABLE' && existing.status === 'OCCUPIED') {
    throw new AppError('Occupied tables cannot be set AVAILABLE directly', 409);
  }

  if (status === 'INACTIVE' || status === 'DISABLED') {
    const active = await prisma.sessionTable.findFirst({
      where: { tableId: id, isActive: true },
    });
    if (active) {
      throw new AppError('Cannot deactivate a table with an active session', 409);
    }
  }

  const table = await prisma.diningTable.update({
    where: { id },
    data: {
      status,
      ...(status === 'INACTIVE' || status === 'DISABLED' ? { isActive: false } : {}),
      ...(status === 'AVAILABLE' ? { isActive: true } : {}),
    },
  });

  if (existing.status === 'CLEANING' && status === 'AVAILABLE') {
    await prisma.auditLog.create({
      data: {
        actorId: userId || null,
        action: 'TABLE_MARK_AVAILABLE',
        entityType: 'DiningTable',
        entityId: id,
        before: { status: existing.status },
        after: { status },
      },
    });
  }

  return serializeDecimals(table);
}

module.exports = {
  listTables,
  getTable,
  createTable,
  updateTable,
  setTableStatus,
  getDefaultRestaurantId,
};
