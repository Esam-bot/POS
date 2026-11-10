const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');
const { nextOrderNumber } = require('../../utils/orderNumber');
const { assertTransition, isTerminal, canCancel } = require('./orderStateMachine');
const { buildPricedLines, sumSubtotal, D } = require('./orders.pricing');
const kitchenService = require('../kitchen/kitchen.service');

const orderInclude = {
  createdBy: { select: { id: true, name: true, username: true } },
  diningTable: true,
  tableSession: {
    include: {
      tables: {
        where: { isActive: true },
        include: { table: true },
      },
    },
  },
  items: {
    include: { modifiers: true },
    orderBy: { createdAt: 'asc' },
  },
  discounts: true,
  payments: {
    include: {
      method: true,
      refunds: true,
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  statusHistory: {
    orderBy: { createdAt: 'asc' },
    include: { changedBy: { select: { id: true, name: true } } },
  },
};

function mapOrder(order) {
  return serializeDecimals(order);
}

async function recalculateOrderTotals(tx, orderId) {
  const items = await tx.orderItem.findMany({
    where: { orderId, status: { not: 'CANCELLED' } },
  });
  const subtotal = items.reduce((acc, item) => acc.plus(item.lineTotal), D(0)).toDecimalPlaces(2);
  const existing = await tx.order.findUnique({ where: { id: orderId } });
  const discountTotal = D(existing.discountTotal || 0);
  const taxTotal = D(existing.taxTotal || 0);
  const serviceCharge = D(existing.serviceCharge || 0);
  const deliveryFee = D(existing.deliveryFee || 0);
  const grandTotal = subtotal
    .minus(discountTotal)
    .plus(taxTotal)
    .plus(serviceCharge)
    .plus(deliveryFee)
    .toDecimalPlaces(2);

  return tx.order.update({
    where: { id: orderId },
    data: { subtotal, grandTotal },
  });
}

async function createItemRows(tx, orderId, lines) {
  for (const line of lines) {
    await tx.orderItem.create({
      data: {
        orderId,
        menuItemId: line.menuItemId,
        variantId: line.variantId,
        kitchenStationId: line.kitchenStationId,
        nameSnapshot: line.nameSnapshot,
        skuSnapshot: line.skuSnapshot,
        variantNameSnapshot: line.variantNameSnapshot,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        specialInstructions: line.specialInstructions,
        modifiers: {
          create: line.modifiers.map((m) => ({
            modifierId: m.modifierId,
            nameSnapshot: m.nameSnapshot,
            priceDelta: m.priceDelta,
            quantity: m.quantity,
          })),
        },
      },
    });
  }
}

async function validateDineInContext(tx, { type, tableSessionId, diningTableId }) {
  if (type !== 'DINE_IN') return { tableSessionId: tableSessionId || null, diningTableId: diningTableId || null };

  if (!tableSessionId) {
    throw new AppError('Dine-in orders require an open table session', 400);
  }

  const session = await tx.tableSession.findUnique({
    where: { id: tableSessionId },
    include: { tables: { where: { isActive: true } } },
  });
  if (!session || session.status !== 'OPEN') {
    throw new AppError('Open table session not found', 404);
  }

  let tableId = diningTableId || null;
  if (tableId) {
    const belongs = session.tables.some((t) => t.tableId === tableId);
    if (!belongs) throw new AppError('Table does not belong to this session', 409);
  } else if (session.tables[0]) {
    tableId = session.tables[0].tableId;
  }

  return { tableSessionId, diningTableId: tableId };
}

async function listOrders(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  if (query.tableSessionId) where.tableSessionId = query.tableSessionId;
  if (query.activeOnly === 'true') {
    where.status = { notIn: ['COMPLETED', 'CANCELLED'] };
  }
  if (query.search) {
    where.orderNumber = { contains: query.search, mode: 'insensitive' };
  }

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
        diningTable: true,
        _count: { select: { items: true } },
      },
    }),
  ]);

  return paginatedResult(
    rows.map((r) =>
      serializeDecimals({
        ...r,
        itemCount: r._count.items,
        _count: undefined,
      })
    ),
    total,
    page,
    limit
  );
}

async function getOrder(id) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: orderInclude,
  });
  if (!order) throw new AppError('Order not found', 404);
  return mapOrder(order);
}

async function createOrder(data, userId) {
  if (data.type === 'DELIVERY') {
    if (!data.deliveryAddressSnapshot?.line1) {
      throw new AppError('Delivery orders require a delivery address', 400);
    }
  }

  const customerName = String(data.customerName || '').trim();
  const customerPhone = String(data.customerPhone || '').trim();
  if (!customerName) throw new AppError('Customer name is required', 400);
  if (!customerPhone) throw new AppError('Customer phone number is required', 400);

  const customersService = require('../customers/customers.service');

  const order = await prisma.$transaction(async (tx) => {
    const ctx = await validateDineInContext(tx, data);
    const lines = await buildPricedLines(tx, data.items);
    const subtotal = sumSubtotal(lines);
    const deliveryFee = D(data.type === 'DELIVERY' ? data.deliveryFee || 0 : 0);
    const grandTotal = subtotal.plus(deliveryFee).toDecimalPlaces(2);
    const orderNumber = await nextOrderNumber(tx);

    const guestCustomer = await customersService.upsertGuestCustomer(
      { name: customerName, phone: customerPhone },
      tx
    );

    const deliverySnapshot =
      data.type === 'DELIVERY'
        ? {
            ...(data.deliveryAddressSnapshot || {}),
            name: data.deliveryAddressSnapshot?.name || customerName,
            phone: data.deliveryAddressSnapshot?.phone || customerPhone,
          }
        : data.deliveryAddressSnapshot || undefined;

    const created = await tx.order.create({
      data: {
        orderNumber,
        type: data.type,
        status: 'DRAFT',
        createdById: userId,
        tableSessionId: ctx.tableSessionId,
        diningTableId: ctx.diningTableId,
        customerId: data.customerId || guestCustomer.id,
        customerName,
        customerPhone,
        notes: data.notes || null,
        deliveryFee,
        deliveryAddressSnapshot: deliverySnapshot,
        subtotal,
        grandTotal,
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: 'DRAFT',
            changedById: userId,
          },
        },
      },
    });

    await createItemRows(tx, created.id, lines);

    return tx.order.findUnique({ where: { id: created.id }, include: orderInclude });
  });

  return mapOrder(order);
}

async function addItems(orderId, items, userId) {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({ where: { id: orderId } });
    if (!existing) throw new AppError('Order not found', 404);
    if (isTerminal(existing.status)) {
      throw new AppError('Cannot add items to a completed or cancelled order', 409);
    }
    if (!['DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING'].includes(existing.status)) {
      throw new AppError('Cannot add items in the current order status', 409);
    }

    const lines = await buildPricedLines(tx, items);
    await createItemRows(tx, orderId, lines);
    await recalculateOrderTotals(tx, orderId);

    return tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
  });

  return mapOrder(order);
}

async function transitionOrder(orderId, toStatus, userId, reason) {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({ where: { id: orderId } });
    if (!existing) throw new AppError('Order not found', 404);

    assertTransition(existing.type, existing.status, toStatus);

    if (toStatus === 'CANCELLED' && !canCancel(existing.status)) {
      throw new AppError('Order cannot be cancelled in its current status', 409);
    }
    if (toStatus === 'CANCELLED' && (!reason || reason.trim().length < 3)) {
      throw new AppError('Cancellation reason is required', 400);
    }
    if (toStatus === 'COMPLETED') {
      const settled = ['PAID', 'COMPLIMENTARY', 'WRITTEN_OFF', 'PARTIALLY_REFUNDED', 'REFUNDED'];
      if (!settled.includes(existing.paymentStatus)) {
        throw new AppError(
          'Order cannot be completed while an amount remains outstanding',
          409
        );
      }
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: toStatus,
        ...(toStatus === 'PLACED' ? { placedAt: new Date() } : {}),
        ...(toStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
        ...(toStatus === 'CANCELLED'
          ? { cancelledAt: new Date(), cancellationReason: reason }
          : {}),
        statusHistory: {
          create: {
            fromStatus: existing.status,
            toStatus,
            changedById: userId,
            reason: reason || null,
          },
        },
      },
      include: orderInclude,
    });

    let cancelledTickets = [];
    if (toStatus === 'CANCELLED') {
      cancelledTickets = await kitchenService.cancelTicketsForOrder(tx, orderId);
    }

    let autoRelease = { released: false };
    if (toStatus === 'CANCELLED' && existing.tableSessionId) {
      const sessionsService = require('../sessions/sessions.service');
      autoRelease = await sessionsService.tryAutoRelease(tx, existing.tableSessionId, {
        userId,
      });
    }

    return { order: updated, cancelledTickets, autoRelease };
  });

  const mapped = mapOrder(result.order);
  mapped._cancelledKitchenTickets = (result.cancelledTickets || []).map(kitchenService.mapTicket);
  mapped.autoRelease = result.autoRelease || { released: false };
  return mapped;
}

async function submitOrder(orderId, userId) {
  return transitionOrder(orderId, 'PLACED', userId, 'Submitted from POS');
}

async function cancelOrder(orderId, userId, reason) {
  return transitionOrder(orderId, 'CANCELLED', userId, reason);
}

async function splitOrder(orderId, splitItems, userId) {
  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { modifiers: true } },
      },
    });
    if (!source) throw new AppError('Order not found', 404);
    if (isTerminal(source.status)) {
      throw new AppError('Cannot split a completed or cancelled order', 409);
    }
    if (!source.tableSessionId) {
      throw new AppError('Only session orders can be split into another bill', 409);
    }
    if (['PAID', 'PARTIALLY_PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(source.paymentStatus)) {
      throw new AppError('Cannot split an order that has payments', 409);
    }

    const movePlan = [];
    for (const reqItem of splitItems) {
      const item = source.items.find((i) => i.id === reqItem.orderItemId);
      if (!item || item.status === 'CANCELLED') {
        throw new AppError('One or more order items were not found', 404);
      }
      const qty = D(reqItem.quantity);
      if (qty.lte(0) || qty.gt(item.quantity)) {
        throw new AppError('Split quantity exceeds available item quantity', 400);
      }
      movePlan.push({ item, qty });
    }

    const orderNumber = await nextOrderNumber(tx);
    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        type: source.type,
        status: source.status === 'DRAFT' ? 'DRAFT' : 'PLACED',
        createdById: userId,
        tableSessionId: source.tableSessionId,
        diningTableId: source.diningTableId,
        customerId: source.customerId,
        customerName: source.customerName,
        customerPhone: source.customerPhone,
        notes: source.notes,
        placedAt: source.status === 'DRAFT' ? null : new Date(),
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: source.status === 'DRAFT' ? 'DRAFT' : 'PLACED',
            changedById: userId,
            reason: `Split from ${source.orderNumber}`,
          },
        },
      },
    });

    for (const { item, qty } of movePlan) {
      const unitPrice = D(item.unitPrice);
      const remaining = D(item.quantity).minus(qty);
      const movedTotal = unitPrice.times(qty).toDecimalPlaces(2);

      if (remaining.eq(0)) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { orderId: newOrder.id },
        });
      } else {
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            quantity: remaining,
            lineTotal: unitPrice.times(remaining).toDecimalPlaces(2),
          },
        });

        await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            menuItemId: item.menuItemId,
            variantId: item.variantId,
            kitchenStationId: item.kitchenStationId,
            nameSnapshot: item.nameSnapshot,
            skuSnapshot: item.skuSnapshot,
            variantNameSnapshot: item.variantNameSnapshot,
            unitPrice: item.unitPrice,
            quantity: qty,
            lineTotal: movedTotal,
            specialInstructions: item.specialInstructions,
            status: item.status,
            modifiers: {
              create: item.modifiers.map((m) => ({
                modifierId: m.modifierId,
                nameSnapshot: m.nameSnapshot,
                priceDelta: m.priceDelta,
                quantity: m.quantity,
              })),
            },
          },
        });
      }
    }

    await recalculateOrderTotals(tx, source.id);
    await recalculateOrderTotals(tx, newOrder.id);

    const [sourceFresh, targetFresh] = await Promise.all([
      tx.order.findUnique({ where: { id: source.id }, include: orderInclude }),
      tx.order.findUnique({ where: { id: newOrder.id }, include: orderInclude }),
    ]);

    return { source: sourceFresh, splitOrder: targetFresh };
  });

  return {
    source: mapOrder(result.source),
    splitOrder: mapOrder(result.splitOrder),
  };
}

module.exports = {
  listOrders,
  getOrder,
  createOrder,
  addItems,
  transitionOrder,
  submitOrder,
  cancelOrder,
  splitOrder,
};
