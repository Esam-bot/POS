const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { serializeDecimals } = require('../../utils/decimal');
const { parsePagination, paginatedResult } = require('../../utils/pagination');

async function getDefaultRestaurantId() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true, deletedAt: null },
  });
  if (!restaurant) throw new AppError('Restaurant not found', 404);
  return restaurant.id;
}

function mapTable(table) {
  if (!table) return table;
  const activeSessionLink = (table.sessionTables || []).find((st) => st.isActive);
  return serializeDecimals({
    ...table,
    sessionTables: undefined,
    activeSession: activeSessionLink
      ? {
          id: activeSessionLink.session.id,
          status: activeSessionLink.session.status,
          openedAt: activeSessionLink.session.openedAt,
        }
      : null,
  });
}

const tableInclude = {
  sessionTables: {
    where: { isActive: true },
    include: {
      session: { select: { id: true, status: true, openedAt: true } },
    },
    take: 1,
  },
};

async function listTables(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const where = { deletedAt: null };
  if (query.status) where.status = query.status;
  if (query.section) where.section = query.section;
  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;
  if (query.search) {
    where.number = { contains: query.search, mode: 'insensitive' };
  }

  const [total, rows] = await Promise.all([
    prisma.diningTable.count({ where }),
    prisma.diningTable.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ section: 'asc' }, { number: 'asc' }],
      include: tableInclude,
    }),
  ]);

  return paginatedResult(rows.map(mapTable), total, page, limit);
}

async function getTable(id) {
  const table = await prisma.diningTable.findFirst({
    where: { id, deletedAt: null },
    include: tableInclude,
  });
  if (!table) throw new AppError('Table not found', 404);
  return mapTable(table);
}

async function createTable(data) {
  const restaurantId = await getDefaultRestaurantId();
  const number = String(data.number).trim();
  const existing = await prisma.diningTable.findFirst({
    where: { restaurantId, number: { equals: number, mode: 'insensitive' }, deletedAt: null },
  });
  if (existing) throw new AppError('Table number already exists', 409);

  const table = await prisma.diningTable.create({
    data: {
      restaurantId,
      number,
      capacity: data.capacity || 4,
      section: data.section || null,
      notes: data.notes || null,
      isActive: data.isActive !== false,
      status: 'AVAILABLE',
    },
    include: tableInclude,
  });
  return mapTable(table);
}

async function updateTable(id, data) {
  const existing = await prisma.diningTable.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Table not found', 404);

  if (data.number && data.number.trim().toLowerCase() !== existing.number.toLowerCase()) {
    const dup = await prisma.diningTable.findFirst({
      where: {
        restaurantId: existing.restaurantId,
        number: { equals: data.number.trim(), mode: 'insensitive' },
        deletedAt: null,
        NOT: { id },
      },
    });
    if (dup) throw new AppError('Table number already exists', 409);
  }

  if (data.isActive === false) {
    const active = await prisma.sessionTable.findFirst({
      where: { tableId: id, isActive: true },
    });
    if (active) throw new AppError('Cannot deactivate a table with an active session', 409);
  }

  const table = await prisma.diningTable.update({
    where: { id },
    data: {
      ...(data.number !== undefined ? { number: data.number.trim() } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
      ...(data.section !== undefined ? { section: data.section } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
    include: tableInclude,
  });
  return mapTable(table);
}

/**
 * Manual status changes. OCCUPIED is normally set by opening a session.
 * CLEANING → AVAILABLE can be manual (clears timer) or via worker.
 */
async function setTableStatus(id, status, { userId = null } = {}) {
  const existing = await prisma.diningTable.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Table not found', 404);

  if (!existing.isActive && status !== 'INACTIVE') {
    throw new AppError('Cannot change status of an inactive table', 409);
  }

  if (existing.status === 'OCCUPIED' && status === 'AVAILABLE') {
    throw new AppError(
      'Cannot mark an occupied table as AVAILABLE. Mark guests left (CLEANING) first.',
      409
    );
  }

  if (status === 'OCCUPIED') {
    throw new AppError('Seat guests by opening a table session instead', 400);
  }

  if (status === 'INACTIVE' || status === 'DISABLED') {
    const active = await prisma.sessionTable.findFirst({
      where: { tableId: id, isActive: true },
    });
    if (active) throw new AppError('Cannot deactivate a table with an active session', 409);
  }

  const data = {
    status,
    ...(status === 'CLEANING' ? { cleaningStartedAt: new Date() } : {}),
    ...(status === 'AVAILABLE' ? { cleaningStartedAt: null, isActive: true } : {}),
    ...(status === 'INACTIVE' || status === 'DISABLED' ? { isActive: false, cleaningStartedAt: null } : {}),
  };

  const table = await prisma.diningTable.update({
    where: { id },
    data,
    include: tableInclude,
  });

  if (existing.status !== status) {
    await prisma.auditLog.create({
      data: {
        actorId: userId || null,
        action: 'TABLE_STATUS',
        entityType: 'DiningTable',
        entityId: id,
        before: { status: existing.status },
        after: { status },
      },
    });
  }

  return mapTable(table);
}

async function softDeleteTable(id) {
  const existing = await prisma.diningTable.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Table not found', 404);

  const active = await prisma.sessionTable.findFirst({
    where: { tableId: id, isActive: true },
  });
  if (active) {
    throw new AppError('Cannot delete a table with an active session. Close the session first.', 409);
  }

  if (existing.status === 'OCCUPIED' || existing.status === 'CLEANING') {
    throw new AppError('Cannot delete a table that is occupied or cleaning. Mark it available first.', 409);
  }

  await prisma.diningTable.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      status: 'INACTIVE',
      cleaningStartedAt: null,
      // Free unique (restaurantId, number) for reuse
      number: `${existing.number}__deleted_${Date.now()}`,
    },
  });
  return { deleted: true, id, number: existing.number };
}

module.exports = {
  listTables,
  getTable,
  createTable,
  updateTable,
  setTableStatus,
  softDeleteTable,
  getDefaultRestaurantId,
  mapTable,
};
