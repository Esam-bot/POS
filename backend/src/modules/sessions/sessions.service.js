const { Prisma } = require('@prisma/client');
const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');
const { isTerminal } = require('../orders/orderStateMachine');

const sessionInclude = {
  openedBy: { select: { id: true, name: true, username: true } },
  tables: {
    where: { isActive: true },
    include: {
      table: true,
    },
  },
  orders: {
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { items: true } },
    },
  },
};

function mapSession(session) {
  return serializeDecimals({
    ...session,
    tables: (session.tables || []).map((link) => ({
      ...link.table,
      joinedAt: link.joinedAt,
      sessionTableId: link.id,
    })),
    orders: (session.orders || []).map((o) => ({
      ...o,
      itemCount: o._count?.items,
      _count: undefined,
    })),
  });
}

async function lockTables(tx, tableIds) {
  if (!tableIds.length) return [];
  const rows = await tx.$queryRawUnsafe(
    `SELECT id, number, status, "isActive", "deletedAt"
     FROM dining_tables
     WHERE id = ANY($1::uuid[])
     FOR UPDATE`,
    tableIds
  );
  return rows;
}

async function assertTablesAvailable(tx, tableIds) {
  const tables = await lockTables(tx, tableIds);
  if (tables.length !== tableIds.length) {
    throw new AppError('One or more tables were not found', 404);
  }
  for (const table of tables) {
    if (table.deletedAt || table.isActive === false) {
      throw new AppError(`Table ${table.number} is inactive`, 409);
    }
    if (table.status === 'OCCUPIED') {
      throw new AppError(`Table ${table.number} is already occupied`, 409);
    }
    if (table.status === 'CLEANING') {
      throw new AppError(`Table ${table.number} is being cleaned`, 409);
    }
    if (table.status === 'INACTIVE' || table.status === 'DISABLED') {
      throw new AppError(`Table ${table.number} is not available`, 409);
    }
  }

  const conflicting = await tx.sessionTable.findMany({
    where: { tableId: { in: tableIds }, isActive: true },
  });
  if (conflicting.length) {
    throw new AppError('One or more tables already belong to an active session', 409);
  }

  return tables;
}

async function listSessions(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  else if (query.activeOnly !== 'false') where.status = 'OPEN';

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

  try {
    const session = await prisma.$transaction(async (tx) => {
      await assertTablesAvailable(tx, tableIds);

      const created = await tx.tableSession.create({
        data: {
          openedById: userId,
          guestCount: data.guestCount || null,
          notes: data.notes || null,
          tables: {
            create: tableIds.map((tableId) => ({ tableId, isActive: true })),
          },
        },
        include: sessionInclude,
      });

      await tx.diningTable.updateMany({
        where: { id: { in: tableIds } },
        data: { status: 'OCCUPIED' },
      });

      return created;
    });

    return mapSession(session);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('One or more tables already belong to an active session', 409);
    }
    throw err;
  }
}

async function addTables(sessionId, tableIds, userId) {
  const uniqueIds = [...new Set(tableIds)];

  try {
    const session = await prisma.$transaction(async (tx) => {
      const existing = await tx.tableSession.findUnique({ where: { id: sessionId } });
      if (!existing || existing.status !== 'OPEN') {
        throw new AppError('Open session not found', 404);
      }

      await assertTablesAvailable(tx, uniqueIds);

      await tx.sessionTable.createMany({
        data: uniqueIds.map((tableId) => ({
          sessionId,
          tableId,
          isActive: true,
        })),
      });

      await tx.diningTable.updateMany({
        where: { id: { in: uniqueIds } },
        data: { status: 'OCCUPIED' },
      });

      return tx.tableSession.findUnique({
        where: { id: sessionId },
        include: sessionInclude,
      });
    });

    return mapSession(session);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('One or more tables already belong to an active session', 409);
    }
    throw err;
  }
}

async function removeTables(sessionId, tableIds) {
  const uniqueIds = [...new Set(tableIds)];

  return prisma.$transaction(async (tx) => {
    const existing = await tx.tableSession.findUnique({
      where: { id: sessionId },
      include: { tables: { where: { isActive: true } } },
    });
    if (!existing || existing.status !== 'OPEN') {
      throw new AppError('Open session not found', 404);
    }

    const remaining = existing.tables.filter((t) => !uniqueIds.includes(t.tableId));
    if (remaining.length === 0) {
      throw new AppError('Cannot remove all tables from a session. Close the session instead.', 409);
    }

    await lockTables(tx, uniqueIds);

    await tx.sessionTable.updateMany({
      where: { sessionId, tableId: { in: uniqueIds }, isActive: true },
      data: { isActive: false, leftAt: new Date() },
    });

    await tx.diningTable.updateMany({
      where: { id: { in: uniqueIds } },
      data: { status: 'CLEANING' },
    });

    const session = await tx.tableSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });
    return mapSession(session);
  });
}

async function transferSession(sessionId, fromTableId, toTableId) {
  if (fromTableId === toTableId) {
    throw new AppError('Source and destination tables must differ', 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.tableSession.findUnique({
        where: { id: sessionId },
        include: { tables: { where: { isActive: true } } },
      });
      if (!existing || existing.status !== 'OPEN') {
        throw new AppError('Open session not found', 404);
      }

      const sourceLink = existing.tables.find((t) => t.tableId === fromTableId);
      if (!sourceLink) {
        throw new AppError('Source table is not part of this session', 409);
      }

      await assertTablesAvailable(tx, [toTableId]);
      await lockTables(tx, [fromTableId]);

      await tx.sessionTable.update({
        where: { id: sourceLink.id },
        data: { isActive: false, leftAt: new Date() },
      });

      await tx.sessionTable.create({
        data: { sessionId, tableId: toTableId, isActive: true },
      });

      await tx.diningTable.update({
        where: { id: fromTableId },
        data: { status: 'CLEANING' },
      });
      await tx.diningTable.update({
        where: { id: toTableId },
        data: { status: 'OCCUPIED' },
      });

      await tx.order.updateMany({
        where: { tableSessionId: sessionId, diningTableId: fromTableId },
        data: { diningTableId: toTableId },
      });

      const session = await tx.tableSession.findUnique({
        where: { id: sessionId },
        include: sessionInclude,
      });
      return mapSession(session);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('Destination table already belongs to an active session', 409);
    }
    throw err;
  }
}

async function closeSession(sessionId) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        tables: { where: { isActive: true } },
        orders: true,
      },
    });
    if (!existing) throw new AppError('Table session not found', 404);
    if (existing.status === 'CLOSED') {
      throw new AppError('Session is already closed', 409);
    }

    const openOrders = existing.orders.filter((o) => !isTerminal(o.status));
    if (openOrders.length) {
      throw new AppError(
        'Cannot close session while orders are still open. Complete or cancel all orders first.',
        409
      );
    }

    const tableIds = existing.tables.map((t) => t.tableId);
    await lockTables(tx, tableIds);

    await tx.sessionTable.updateMany({
      where: { sessionId, isActive: true },
      data: { isActive: false, leftAt: new Date() },
    });

    await tx.diningTable.updateMany({
      where: { id: { in: tableIds } },
      data: { status: 'CLEANING' },
    });

    const session = await tx.tableSession.update({
      where: { id: sessionId },
      data: { status: 'CLOSED', closedAt: new Date() },
      include: sessionInclude,
    });

    return mapSession(session);
  });
}

const SETTLED_PAYMENT_STATUSES = new Set([
  'PAID',
  'COMPLIMENTARY',
  'WRITTEN_OFF',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]);

function isIgnorableDraft(order) {
  if (order.status !== 'DRAFT') return false;
  const itemCount = order._count?.items ?? (order.items ? order.items.length : 0);
  return itemCount === 0;
}

function orderBlocksAutoRelease(order) {
  if (isIgnorableDraft(order)) return false;
  if (order.status === 'CANCELLED') return false;
  if (order.status === 'COMPLETED') return false;
  if (SETTLED_PAYMENT_STATUSES.has(order.paymentStatus)) return false;
  return true;
}

/**
 * Auto-complete settled dine-in orders, close the session, and free tables.
 * Must run inside the caller's Prisma transaction. Concurrent-safe via session FOR UPDATE.
 */
async function tryAutoRelease(tx, sessionId, { userId = null } = {}) {
  if (!sessionId) return { released: false };

  const locked = await tx.$queryRawUnsafe(
    `SELECT id, status FROM table_sessions WHERE id = $1::uuid FOR UPDATE`,
    sessionId
  );
  if (!locked.length) return { released: false };
  if (locked[0].status === 'CLOSED') return { released: false };

  const restaurant = await tx.restaurant.findFirst({
    where: { isActive: true, deletedAt: null },
    include: { settings: true },
  });
  const settings = restaurant?.settings || null;
  if (settings && settings.autoReleaseTableOnPayment === false) {
    return { released: false };
  }
  const useCleaning = Boolean(settings?.useCleaningStatus);

  const session = await tx.tableSession.findUnique({
    where: { id: sessionId },
    include: {
      tables: { where: { isActive: true }, include: { table: true } },
      orders: {
        include: { _count: { select: { items: true } } },
      },
    },
  });
  if (!session || session.status !== 'OPEN') return { released: false };

  const relevantOrders = session.orders.filter((o) => !isIgnorableDraft(o));
  if (!relevantOrders.length) return { released: false };

  if (relevantOrders.some(orderBlocksAutoRelease)) {
    return { released: false };
  }

  const tableIds = session.tables.map((t) => t.tableId);
  if (tableIds.length) {
    await lockTables(tx, tableIds);
  }

  const completedOrders = [];
  for (const order of relevantOrders) {
    if (order.status === 'CANCELLED' || order.status === 'COMPLETED') continue;
    if (!SETTLED_PAYMENT_STATUSES.has(order.paymentStatus)) continue;

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        statusHistory: {
          create: {
            fromStatus: order.status,
            toStatus: 'COMPLETED',
            changedById: userId,
            reason: 'auto-completed on payment',
          },
        },
      },
    });
    completedOrders.push(updated);
  }

  await tx.sessionTable.updateMany({
    where: { sessionId, isActive: true },
    data: { isActive: false, leftAt: new Date() },
  });

  const nextTableStatus = useCleaning ? 'CLEANING' : 'AVAILABLE';
  if (tableIds.length) {
    await tx.diningTable.updateMany({
      where: { id: { in: tableIds } },
      data: { status: nextTableStatus },
    });
  }

  const closed = await tx.tableSession.update({
    where: { id: sessionId },
    data: { status: 'CLOSED', closedAt: new Date() },
    include: sessionInclude,
  });

  await tx.auditLog.create({
    data: {
      actorId: userId || null,
      action: 'SESSION_AUTO_RELEASE',
      entityType: 'TableSession',
      entityId: sessionId,
      after: {
        tableStatus: nextTableStatus,
        completedOrderIds: completedOrders.map((o) => o.id),
      },
    },
  });

  const tables = tableIds.length
    ? await tx.diningTable.findMany({ where: { id: { in: tableIds } } })
    : [];

  return {
    released: true,
    session: mapSession(closed),
    tables: tables.map((t) => serializeDecimals(t)),
    completedOrderIds: completedOrders.map((o) => o.id),
    completedOrders: completedOrders.map((o) => serializeDecimals(o)),
  };
}

module.exports = {
  listSessions,
  getSession,
  openSession,
  addTables,
  removeTables,
  transferSession,
  closeSession,
  tryAutoRelease,
  SETTLED_PAYMENT_STATUSES,
};
