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
      placedAt: true,
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

function mapTicket(ticket) {
  if (!ticket) return null;
  const mapped = serializeDecimals(ticket);
  mapped.stationName = ticket.station?.name || 'Unassigned';
  mapped.stationCode = ticket.station?.code || null;
  mapped.isUnassigned = !ticket.stationId;
  mapped.items = (ticket.items || []).map((ti) => {
    const oi = ti.orderItem || {};
    return serializeDecimals({
      id: ti.id,
      ticketId: ti.ticketId,
      orderItemId: ti.orderItemId,
      status: ti.status,
      preparingAt: ti.preparingAt,
      readyAt: ti.readyAt,
      completedAt: ti.completedAt,
      name: oi.nameSnapshot,
      variantName: oi.variantNameSnapshot || null,
      quantity: oi.quantity,
      specialInstructions: oi.specialInstructions || null,
      modifiers: (oi.modifiers || []).map((m) => ({
        name: m.nameSnapshot,
        quantity: m.quantity,
      })),
    });
  });
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
 * Call inside an existing transaction when possible.
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
        const refreshed = await tx.kitchenTicket.findUnique({
          where: { id: existing.id },
          include: ticketInclude,
        });
        created.push(refreshed);
      }
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

async function listBoard(query = {}) {
  const where = {
    status: { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] },
  };

  if (query.stationId === 'UNASSIGNED' || query.unassigned === 'true') {
    where.stationId = null;
  } else if (query.stationId) {
    where.stationId = query.stationId;
  }

  if (query.status) {
    where.status = query.status;
  }

  const tickets = await prisma.kitchenTicket.findMany({
    where,
    include: ticketInclude,
    orderBy: { createdAt: 'asc' },
  });

  return tickets.map(mapTicket);
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

async function updateTicketStatus(id, toStatus) {
  const ticket = await prisma.$transaction(async (tx) => {
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

    // Cascade item statuses when advancing the whole ticket
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
    }

    return tx.kitchenTicket.update({
      where: { id },
      data,
      include: ticketInclude,
    });
  });

  return mapTicket(ticket);
}

async function updateItemStatus(itemId, toStatus) {
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

    // Roll up ticket status from items
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
      // Item-driven rollup may skip intermediate ticket statuses.
      await tx.kitchenTicket.update({
        where: { id: item.ticketId },
        data: {
          status: ticketStatus,
          ...ticketTimestampPatch(ticketStatus, now),
        },
      });
    }

    const ticket = await tx.kitchenTicket.findUnique({
      where: { id: item.ticketId },
      include: ticketInclude,
    });

    return { item: updatedItem, ticket };
  });

  return {
    item: serializeDecimals(result.item),
    ticket: mapTicket(result.ticket),
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

module.exports = {
  UNASSIGNED_KEY,
  createTicketsForOrder,
  cancelTicketsForOrder,
  listBoard,
  listHistory,
  getTicket,
  updateTicketStatus,
  updateItemStatus,
  listStations,
  mapTicket,
  ticketInclude,
};
