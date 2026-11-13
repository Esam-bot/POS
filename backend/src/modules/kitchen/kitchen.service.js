const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');
const {
  assertTicketTransition,
  assertItemTransition,
  isActiveStatus,
} = require('./kitchenStateMachine');

const UNASSIGNED_KEY = 'UNASSIGNED';

const ticketInclude = {
  station: { select: { id: true, name: true, code: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      type: true,
      status: true,
      notes: true,
      customerName: true,
      customerPhone: true,
      placedAt: true,
      prepStartedAt: true,
      estimatedReadyAt: true,
      readyNotifiedAt: true,
      createdAt: true,
      diningTable: { select: { id: true, number: true, section: true } },
    },
  },
  items: {
    include: {
      orderItem: {
        include: {
          modifiers: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
};

function stationKeyFor(stationId) {
  return stationId || UNASSIGNED_KEY;
}

function stationRoom(stationId) {
  return stationId ? `kitchen:station:${stationId}` : 'kitchen:station:UNASSIGNED';
}

function mapTicket(ticket) {
  if (!ticket) return null;
  const mapped = serializeDecimals(ticket);
  mapped.stationName = ticket.station?.name || 'Unassigned';
  mapped.stationCode = ticket.station?.code || null;
  mapped.isUnassigned = !ticket.stationId;
  mapped.orderNumber = ticket.order?.orderNumber || null;
  mapped.orderType = ticket.order?.type || null;
  mapped.orderStatus = ticket.order?.status || null;
  mapped.customerName = ticket.order?.customerName || null;
  mapped.orderNotes = ticket.order?.notes || null;
  mapped.tableNumber = ticket.order?.diningTable?.number || null;
  mapped.tableSection = ticket.order?.diningTable?.section || null;
  mapped.placedAt = ticket.order?.placedAt || ticket.order?.createdAt || ticket.createdAt;
  mapped.orderEstimatedReadyAt = ticket.order?.estimatedReadyAt || null;

  mapped.items = (ticket.items || []).map((ti) => {
    const oi = ti.orderItem || {};
    const prepMins = oi.prepTimeMinutesSnapshot ?? 5;
    const startedAt = ti.preparingAt || oi.prepStartedAt || null;
    const estimatedReadyAt =
      oi.estimatedReadyAt ||
      (startedAt ? new Date(new Date(startedAt).getTime() + prepMins * 60 * 1000) : null);
    const isDelayed =
      ['PREPARING', 'NEW', 'ACCEPTED'].includes(ti.status) &&
      estimatedReadyAt &&
      new Date(estimatedReadyAt) < new Date() &&
      !ti.readyAt;

    return serializeDecimals({
      id: ti.id,
      ticketId: ti.ticketId,
      orderItemId: ti.orderItemId,
      status: ti.status,
      acceptedAt: ti.acceptedAt,
      preparingAt: ti.preparingAt,
      readyAt: ti.readyAt,
      completedAt: ti.completedAt,
      name: oi.nameSnapshot,
      variantName: oi.variantNameSnapshot || null,
      quantity: oi.quantity,
      specialInstructions: oi.specialInstructions || null,
      prepTimeMinutes: prepMins,
      prepStartedAt: startedAt,
      estimatedReadyAt,
      isDelayed: Boolean(isDelayed),
      modifiers: (oi.modifiers || []).map((m) => ({
        name: m.nameSnapshot,
        quantity: m.quantity,
      })),
    });
  });

  mapped.hasDelayedItems = mapped.items.some((i) => i.isDelayed);
  return mapped;
}

function ticketTimestampPatch(toStatus, now = new Date()) {
  if (toStatus === 'PREPARING') return { preparingAt: now };
  if (toStatus === 'READY') return { readyAt: now };
  if (toStatus === 'COMPLETED') return { servedAt: now, completedAt: now };
  if (toStatus === 'ACCEPTED') return { acceptedAt: now };
  return {};
}

function itemTimestampPatch(toStatus, now = new Date()) {
  if (toStatus === 'PREPARING') return { preparingAt: now };
  if (toStatus === 'READY') return { readyAt: now };
  if (toStatus === 'COMPLETED') return { completedAt: now };
  if (toStatus === 'ACCEPTED') return { acceptedAt: now };
  return {};
}

/**
 * Create kitchen tickets for a submitted order (idempotent per order+station).
 * Draft orders are skipped. Call inside an existing transaction when possible.
 */
async function createTicketsForOrder(tx, orderId) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        where: { status: { not: 'CANCELLED' } },
      },
    },
  });
  if (!order) throw new AppError('Order not found', 404);
  if (order.status === 'DRAFT') {
    return [];
  }

  const groups = new Map();
  for (const item of order.items) {
    const key = stationKeyFor(item.kitchenStationId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const created = [];
  for (const [key, items] of groups.entries()) {
    const stationId = key === UNASSIGNED_KEY ? null : key;
    const existing = await tx.kitchenTicket.findUnique({
      where: { orderId_stationKey: { orderId, stationKey: key } },
      include: { items: true },
    });

    if (existing) {
      const existingItemIds = new Set(existing.items.map((i) => i.orderItemId));
      const missing = items.filter((i) => !existingItemIds.has(i.id));
      if (missing.length && isActiveStatus(existing.status)) {
        await tx.kitchenTicketItem.createMany({
          data: missing.map((i) => ({
            ticketId: existing.id,
            orderItemId: i.id,
            status: 'NEW',
          })),
          skipDuplicates: true,
        });
        // Re-open ticket to NEW if it was READY/COMPLETED but new work arrived
        if (['READY', 'COMPLETED'].includes(existing.status)) {
          await tx.kitchenTicket.update({
            where: { id: existing.id },
            data: { status: 'NEW', readyAt: null, completedAt: null, servedAt: null },
          });
        }
      }
      // Idempotent: always return the current ticket for this station
      const refreshed = await tx.kitchenTicket.findUnique({
        where: { id: existing.id },
        include: ticketInclude,
      });
      if (refreshed) created.push(refreshed);
      continue;
    }

    let stationCode = 'UNASSIGNED';
    if (stationId) {
      const station = await tx.kitchenStation.findUnique({ where: { id: stationId } });
      stationCode = station?.code || 'STN';
    }

    const ticketNumber = `${order.orderNumber}-${stationCode}`;
    const ticket = await tx.kitchenTicket.create({
      data: {
        orderId,
        stationId,
        stationKey: key,
        ticketNumber,
        status: 'NEW',
        items: {
          create: items.map((i) => ({
            orderItemId: i.id,
            status: 'NEW',
          })),
        },
      },
      include: ticketInclude,
    });
    created.push(ticket);
  }

  return created;
}

async function cancelTicketsForOrder(tx, orderId) {
  const tickets = await tx.kitchenTicket.findMany({
    where: {
      orderId,
      status: { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] },
    },
  });

  const updated = [];
  for (const ticket of tickets) {
    const next = await tx.kitchenTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'CANCELLED',
        items: {
          updateMany: {
            where: { status: { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] } },
            data: { status: 'CANCELLED' },
          },
        },
      },
      include: ticketInclude,
    });
    updated.push(next);
  }
  return updated;
}

/**
 * When all non-cancelled kitchen items for an order are READY/COMPLETED,
 * promote the restaurant order to READY once (payment stays independent).
 */
async function promoteOrderReadyIfKitchenDone(tx, orderId, { userId = null } = {}) {
  const tickets = await tx.kitchenTicket.findMany({
    where: { orderId, status: { not: 'CANCELLED' } },
    include: { items: true },
  });
  if (!tickets.length) return null;

  const activeItems = tickets.flatMap((t) =>
    (t.items || []).filter((i) => i.status !== 'CANCELLED')
  );
  if (!activeItems.length) return null;
  if (!activeItems.every((i) => ['READY', 'COMPLETED'].includes(i.status))) {
    return null;
  }

  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      diningTable: { select: { id: true, number: true, section: true } },
    },
  });
  if (!order) return null;
  if (!['PREPARING', 'CONFIRMED', 'PLACED'].includes(order.status)) return null;
  if (order.readyNotifiedAt && order.status === 'READY') return null;

  const now = new Date();
  await tx.orderItem.updateMany({
    where: { orderId, status: { not: 'CANCELLED' }, prepCompletedAt: null },
    data: { prepCompletedAt: now, status: 'READY' },
  });

  const updated = await tx.order.update({
    where: { id: orderId },
    data: {
      status: 'READY',
      readyNotifiedAt: order.readyNotifiedAt || now,
      statusHistory: {
        create: {
          fromStatus: order.status,
          toStatus: 'READY',
          changedById: userId,
          reason: 'all kitchen stations ready',
        },
      },
    },
    include: {
      diningTable: { select: { id: true, number: true, section: true } },
    },
  });

  return updated;
}

function deriveKitchenOverallStatus(items) {
  const active = (items || []).filter((i) => i.status !== 'CANCELLED');
  if (!active.length) return 'CANCELLED';
  if (active.every((i) => i.status === 'COMPLETED')) return 'COMPLETED';
  if (active.every((i) => ['READY', 'COMPLETED'].includes(i.status))) return 'READY';
  if (active.some((i) => ['PREPARING', 'READY', 'COMPLETED'].includes(i.status))) {
    return 'PREPARING';
  }
  return 'NEW';
}

/** Flatten mapped tickets into one card per order, with station sections. */
function groupTicketsByOrder(mappedTickets) {
  const byOrder = new Map();

  for (const ticket of mappedTickets) {
    const orderId = ticket.orderId || ticket.order?.id;
    if (!orderId) continue;

    if (!byOrder.has(orderId)) {
      byOrder.set(orderId, {
        orderId,
        orderNumber: ticket.orderNumber,
        orderType: ticket.orderType,
        orderStatus: ticket.orderStatus,
        customerName: ticket.customerName,
        orderNotes: ticket.orderNotes,
        tableNumber: ticket.tableNumber,
        tableSection: ticket.tableSection,
        placedAt: ticket.placedAt,
        orderEstimatedReadyAt: ticket.orderEstimatedReadyAt,
        createdAt: ticket.createdAt,
        stations: [],
        items: [],
      });
    }

    const card = byOrder.get(orderId);
    const stationItems = (ticket.items || []).filter((i) => i.status !== 'CANCELLED');
    card.stations.push({
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketStatus: ticket.status,
      stationId: ticket.stationId,
      stationName: ticket.stationName,
      stationCode: ticket.stationCode,
      isUnassigned: ticket.isUnassigned,
      items: stationItems,
    });
    card.items.push(...stationItems);
  }

  const cards = [];
  for (const card of byOrder.values()) {
    // Stable station order by name
    card.stations.sort((a, b) =>
      String(a.stationName || '').localeCompare(String(b.stationName || ''))
    );
    card.status = deriveKitchenOverallStatus(card.items);
    card.hasDelayedItems = card.items.some((i) => i.isDelayed);
    card.itemCount = card.items.length;
    cards.push(card);
  }

  cards.sort((a, b) => {
    const ta = new Date(a.placedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.placedAt || b.createdAt || 0).getTime();
    return ta - tb;
  });

  return cards;
}

async function listTickets(query = {}) {
  const where = {};

  if (query.stationId === 'UNASSIGNED' || query.unassigned === 'true') {
    where.stationId = null;
  } else if (query.stationId) {
    where.stationId = query.stationId;
  }

  if (query.status) {
    const statuses = String(query.status)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
  } else if (query.includeCompleted === 'true') {
    where.status = { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'] };
  } else {
    where.status = { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] };
  }

  where.order = { status: { not: 'DRAFT' } };

  const tickets = await prisma.kitchenTicket.findMany({
    where,
    include: ticketInclude,
    orderBy: { createdAt: 'asc' },
  });

  return tickets.map(mapTicket);
}

/** KDS board: one card per order, products grouped by station. */
async function listBoard(query = {}) {
  const tickets = await listTickets(query);
  const cards = groupTicketsByOrder(tickets);
  if (query.status) {
    const statuses = String(query.status)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return cards.filter((c) => statuses.includes(c.status));
  }
  return cards;
}

async function listDelayed(query = {}) {
  const board = await listBoard({
    ...query,
    status: undefined,
    includeCompleted: 'false',
  });
  return board.filter((c) => c.hasDelayedItems && ['NEW', 'PREPARING'].includes(c.status));
}

async function listHistory(query = {}) {
  const { skip, take, page, limit } = parsePagination(query);
  const where = {
    status: { in: ['COMPLETED', 'CANCELLED'] },
  };
  if (query.stationId === 'UNASSIGNED') {
    where.stationId = null;
  } else if (query.stationId) {
    where.stationId = query.stationId;
  }

  const [total, rows] = await Promise.all([
    prisma.kitchenTicket.count({ where }),
    prisma.kitchenTicket.findMany({
      where,
      include: ticketInclude,
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
    }),
  ]);

  return paginatedResult(rows.map(mapTicket), total, page, limit);
}

async function getTicket(id) {
  const ticket = await prisma.kitchenTicket.findUnique({
    where: { id },
    include: ticketInclude,
  });
  if (!ticket) throw new AppError('Kitchen ticket not found', 404);
  return mapTicket(ticket);
}

async function updateTicketStatus(id, toStatus, { userId = null } = {}) {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.kitchenTicket.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) throw new AppError('Kitchen ticket not found', 404);

    assertTicketTransition(existing.status, toStatus);

    const now = new Date();
    const data = {
      status: toStatus,
      ...ticketTimestampPatch(toStatus, now),
    };

    if (['PREPARING', 'READY', 'COMPLETED', 'CANCELLED'].includes(toStatus)) {
      const itemFrom =
        toStatus === 'PREPARING'
          ? ['NEW', 'ACCEPTED']
          : toStatus === 'READY'
            ? ['NEW', 'ACCEPTED', 'PREPARING']
            : toStatus === 'COMPLETED'
              ? ['NEW', 'ACCEPTED', 'PREPARING', 'READY']
              : ['NEW', 'ACCEPTED', 'PREPARING', 'READY'];

      const itemStatus = toStatus === 'CANCELLED' ? 'CANCELLED' : toStatus;
      await tx.kitchenTicketItem.updateMany({
        where: { ticketId: id, status: { in: itemFrom } },
        data: {
          status: itemStatus,
          ...itemTimestampPatch(itemStatus, now),
        },
      });

      if (toStatus === 'PREPARING' || toStatus === 'READY') {
        const items = await tx.kitchenTicketItem.findMany({
          where: { ticketId: id, status: itemStatus },
          select: { orderItemId: true },
        });
        const orderItemIds = items.map((i) => i.orderItemId);
        if (orderItemIds.length) {
          if (toStatus === 'PREPARING') {
            await tx.orderItem.updateMany({
              where: { id: { in: orderItemIds }, prepStartedAt: null },
              data: { prepStartedAt: now, status: 'PREPARING' },
            });
          }
          if (toStatus === 'READY') {
            await tx.orderItem.updateMany({
              where: { id: { in: orderItemIds }, status: { not: 'CANCELLED' } },
              data: { prepCompletedAt: now, status: 'READY' },
            });
          }
        }
      }
    }

    const ticket = await tx.kitchenTicket.update({
      where: { id },
      data,
      include: ticketInclude,
    });

    let orderReady = null;
    if (toStatus === 'READY') {
      orderReady = await promoteOrderReadyIfKitchenDone(tx, existing.orderId, { userId });
    }

    return { ticket, orderReady };
  });

  return {
    ticket: mapTicket(result.ticket),
    orderReady: result.orderReady ? serializeDecimals(result.orderReady) : null,
  };
}

async function updateItemStatus(itemId, toStatus, { userId = null } = {}) {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.kitchenTicketItem.findUnique({
      where: { id: itemId },
      include: { ticket: { include: { items: true } } },
    });
    if (!item) throw new AppError('Kitchen ticket item not found', 404);
    if (['COMPLETED', 'CANCELLED'].includes(item.ticket.status)) {
      throw new AppError('Cannot update items on a closed kitchen ticket', 409);
    }

    assertItemTransition(item.status, toStatus);

    const now = new Date();
    const updatedItem = await tx.kitchenTicketItem.update({
      where: { id: itemId },
      data: {
        status: toStatus,
        ...itemTimestampPatch(toStatus, now),
      },
    });

    if (toStatus === 'PREPARING') {
      await tx.orderItem.updateMany({
        where: { id: item.orderItemId, prepStartedAt: null },
        data: { prepStartedAt: now, status: 'PREPARING' },
      });
    }
    if (toStatus === 'READY') {
      await tx.orderItem.update({
        where: { id: item.orderItemId },
        data: { prepCompletedAt: now, status: 'READY' },
      });
    }
    if (toStatus === 'CANCELLED') {
      await tx.orderItem.update({
        where: { id: item.orderItemId },
        data: { status: 'CANCELLED' },
      });
    }

    const siblings = await tx.kitchenTicketItem.findMany({ where: { ticketId: item.ticketId } });
    let ticketStatus = item.ticket.status;
    const active = siblings.filter((s) => s.status !== 'CANCELLED');
    if (!active.length) {
      ticketStatus = 'CANCELLED';
    } else if (active.every((s) => s.status === 'COMPLETED')) {
      ticketStatus = 'COMPLETED';
    } else if (active.every((s) => ['READY', 'COMPLETED'].includes(s.status))) {
      ticketStatus = 'READY';
    } else if (active.some((s) => ['PREPARING', 'READY', 'COMPLETED'].includes(s.status))) {
      ticketStatus = 'PREPARING';
    } else {
      ticketStatus = 'NEW';
    }

    if (ticketStatus !== item.ticket.status) {
      await tx.kitchenTicket.update({
        where: { id: item.ticketId },
        data: {
          status: ticketStatus,
          ...ticketTimestampPatch(ticketStatus, now),
        },
      });
    }

    let orderReady = null;
    if (toStatus === 'READY' || ticketStatus === 'READY') {
      orderReady = await promoteOrderReadyIfKitchenDone(tx, item.ticket.orderId, { userId });
    }

    const ticket = await tx.kitchenTicket.findUnique({
      where: { id: item.ticketId },
      include: ticketInclude,
    });

    return { item: updatedItem, ticket, orderReady };
  });

  return {
    item: serializeDecimals(result.item),
    ticket: mapTicket(result.ticket),
    orderReady: result.orderReady ? serializeDecimals(result.orderReady) : null,
  };
}

async function listStations() {
  const stations = await prisma.kitchenStation.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  });
  return stations;
}

async function getWorkload() {
  const stations = await listStations();
  const active = await prisma.kitchenTicket.groupBy({
    by: ['stationId', 'status'],
    where: { status: { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] } },
    _count: { _all: true },
  });

  const byStation = stations.map((s) => {
    const rows = active.filter((r) => r.stationId === s.id);
    const countFor = (status) =>
      rows.filter((r) => r.status === status).reduce((n, r) => n + r._count._all, 0);
    return {
      ...s,
      new: countFor('NEW') + countFor('ACCEPTED'),
      preparing: countFor('PREPARING'),
      ready: countFor('READY'),
      total: rows.reduce((n, r) => n + r._count._all, 0),
    };
  });

  const unassignedRows = active.filter((r) => r.stationId == null);
  if (unassignedRows.length) {
    byStation.push({
      id: null,
      name: 'Unassigned',
      code: 'UNASSIGNED',
      new: unassignedRows
        .filter((r) => ['NEW', 'ACCEPTED'].includes(r.status))
        .reduce((n, r) => n + r._count._all, 0),
      preparing: unassignedRows
        .filter((r) => r.status === 'PREPARING')
        .reduce((n, r) => n + r._count._all, 0),
      ready: unassignedRows
        .filter((r) => r.status === 'READY')
        .reduce((n, r) => n + r._count._all, 0),
      total: unassignedRows.reduce((n, r) => n + r._count._all, 0),
    });
  }

  return { stations: byStation };
}

module.exports = {
  UNASSIGNED_KEY,
  createTicketsForOrder,
  cancelTicketsForOrder,
  promoteOrderReadyIfKitchenDone,
  listTickets,
  listBoard,
  listDelayed,
  listHistory,
  getTicket,
  updateTicketStatus,
  updateItemStatus,
  listStations,
  getWorkload,
  mapTicket,
  groupTicketsByOrder,
  deriveKitchenOverallStatus,
  ticketInclude,
  stationRoom,
};
