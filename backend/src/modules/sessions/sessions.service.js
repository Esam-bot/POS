const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { serializeDecimals } = require('../../utils/decimal');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { mapTable } = require('../tables/tables.service');

const sessionInclude = {
  openedBy: { select: { id: true, name: true, username: true } },
  tables: {
    where: { isActive: true },
    include: { table: true },
  },
  orders: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      type: true,
      status: true,
      paymentStatus: true,
      grandTotal: true,
      customerName: true,
      customerPhone: true,
      estimatedReadyAt: true,
      createdAt: true,
    },
  },
};

function mapSession(session) {
  if (!session) return session;
  return serializeDecimals({
    ...session,
    tables: (session.tables || []).map((st) => ({
      ...mapTable(st.table),
      joinedAt: st.joinedAt,
      sessionTableId: st.id,
    })),
  });
}

async function lockTables(tx, tableIds) {
  if (!tableIds.length) return;
  const ids = tableIds.map((id) => `'${id}'::uuid`).join(',');
  await tx.$queryRawUnsafe(
    `SELECT id FROM dining_tables WHERE id IN (${ids}) ORDER BY id FOR UPDATE`
  );
}

async function assertTablesSeatable(tx, tableIds) {
  const tables = await tx.diningTable.findMany({
    where: { id: { in: tableIds }, deletedAt: null },
  });
  if (tables.length !== tableIds.length) throw new AppError('One or more tables not found', 404);

  for (const table of tables) {
    if (!table.isActive) throw new AppError(`Table ${table.number} is inactive`, 409);
    if (table.status === 'OCCUPIED') {
      throw new AppError(`Table ${table.number} is already occupied`, 409);
    }
    if (table.status === 'CLEANING') {
      throw new AppError(`Table ${table.number} is being cleaned`, 409);
    }
    if (table.status !== 'AVAILABLE' && table.status !== 'RESERVED') {
      throw new AppError(`Table ${table.number} is not available`, 409);
    }
  }

  const busy = await tx.sessionTable.findFirst({
    where: { tableId: { in: tableIds }, isActive: true },
  });
  if (busy) throw new AppError('One or more tables already belong to an active session', 409);

  return tables;
}

async function listSessions(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  else where.status = 'OPEN';

  const [total, rows] = await Promise.all([
    prisma.tableSession.count({ where }),
    prisma.tableSession.findMany({
      where,
      skip,
      take: limit,
      orderBy: { openedAt: 'desc' },
      include: sessionInclude,
    }),
  ]);

  return paginatedResult(rows.map(mapSession), total, page, limit);
}

async function getSession(id) {
  const session = await prisma.tableSession.findUnique({
    where: { id },
    include: sessionInclude,
  });
  if (!session) throw new AppError('Table session not found', 404);
  return mapSession(session);
}

async function openSession(data, userId) {
  const tableIds = [...new Set(data.tableIds)];

  return prisma.$transaction(async (tx) => {
    await lockTables(tx, tableIds);
    await assertTablesSeatable(tx, tableIds);

    const session = await tx.tableSession.create({
      data: {
        openedById: userId,
        guestCount: data.guestCount || null,
        notes: data.notes || null,
        status: 'OPEN',
        tables: {
          create: tableIds.map((tableId) => ({ tableId, isActive: true })),
        },
      },
      include: sessionInclude,
    });

    await tx.diningTable.updateMany({
      where: { id: { in: tableIds } },
      data: { status: 'OCCUPIED', cleaningStartedAt: null },
    });

    return mapSession(
      await tx.tableSession.findUnique({ where: { id: session.id }, include: sessionInclude })
    );
  });
}

/**
 * Guests left: close session and put tables into CLEANING (auto-AVAILABLE via worker).
 * Does not require orders to be COMPLETED — payment/food stay independent.
 */
async function closeSession(sessionId, { userId = null } = {}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.tableSession.findUnique({
      where: { id: sessionId },
      include: { tables: { where: { isActive: true } } },
    });
    if (!existing) throw new AppError('Table session not found', 404);
    if (existing.status === 'CLOSED') throw new AppError('Session is already closed', 409);

    const tableIds = existing.tables.map((t) => t.tableId);
    await lockTables(tx, tableIds);

    await tx.sessionTable.updateMany({
      where: { sessionId, isActive: true },
      data: { isActive: false, leftAt: new Date() },
    });

    const now = new Date();
    if (tableIds.length) {
      await tx.diningTable.updateMany({
        where: { id: { in: tableIds } },
        data: { status: 'CLEANING', cleaningStartedAt: now },
      });
    }

    const session = await tx.tableSession.update({
      where: { id: sessionId },
      data: { status: 'CLOSED', closedAt: now },
      include: sessionInclude,
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'SESSION_CLOSE_GUESTS_LEFT',
        entityType: 'TableSession',
        entityId: sessionId,
        after: { tableIds, tableStatus: 'CLEANING' },
      },
    });

    const tables = tableIds.length
      ? await tx.diningTable.findMany({ where: { id: { in: tableIds } } })
      : [];

    return {
      session: mapSession(session),
      tables: tables.map((t) => serializeDecimals(t)),
    };
  });
}

async function addTables(sessionId, tableIds) {
  const ids = [...new Set(tableIds)];
  return prisma.$transaction(async (tx) => {
    const session = await tx.tableSession.findUnique({
      where: { id: sessionId },
      include: { tables: { where: { isActive: true } } },
    });
    if (!session || session.status !== 'OPEN') {
      throw new AppError('Open table session not found', 404);
    }

    await lockTables(tx, ids);
    await assertTablesSeatable(tx, ids);

    await tx.sessionTable.createMany({
      data: ids.map((tableId) => ({ sessionId, tableId, isActive: true })),
    });
    await tx.diningTable.updateMany({
      where: { id: { in: ids } },
      data: { status: 'OCCUPIED', cleaningStartedAt: null },
    });

    return mapSession(
      await tx.tableSession.findUnique({ where: { id: sessionId }, include: sessionInclude })
    );
  });
}

async function transferSession(sessionId, { fromTableId, toTableId }) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.tableSession.findUnique({
      where: { id: sessionId },
      include: { tables: { where: { isActive: true } } },
    });
    if (!session || session.status !== 'OPEN') {
      throw new AppError('Open table session not found', 404);
    }

    await lockTables(tx, [fromTableId, toTableId]);

    const fromLink = session.tables.find((t) => t.tableId === fromTableId);
    if (!fromLink) throw new AppError('Source table is not part of this session', 409);

    await assertTablesSeatable(tx, [toTableId]);

    await tx.sessionTable.update({
      where: { id: fromLink.id },
      data: { isActive: false, leftAt: new Date() },
    });
    await tx.sessionTable.create({
      data: { sessionId, tableId: toTableId, isActive: true },
    });

    await tx.diningTable.update({
      where: { id: fromTableId },
      data: { status: 'CLEANING', cleaningStartedAt: new Date() },
    });
    await tx.diningTable.update({
      where: { id: toTableId },
      data: { status: 'OCCUPIED', cleaningStartedAt: null },
    });

    await tx.order.updateMany({
      where: { tableSessionId: sessionId, diningTableId: fromTableId },
      data: { diningTableId: toTableId },
    });

    return mapSession(
      await tx.tableSession.findUnique({ where: { id: sessionId }, include: sessionInclude })
    );
  });
}

module.exports = {
  listSessions,
  getSession,
  openSession,
  closeSession,
  addTables,
  transferSession,
};
