const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');
const { nextOrderNumber } = require('../../utils/orderNumber');
const { assertTransition, isTerminal, canCancel } = require('./orderStateMachine');
const { buildPricedLines, sumSubtotal, D } = require('./orders.pricing');
const kitchenService = require('../kitchen/kitchen.service');
const inventoryDeduction = require('../inventory/deduction.service');

const SETTLED_PAYMENT_STATUSES = new Set([
  'PAID',
  'COMPLIMENTARY',
  'WRITTEN_OFF',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

const orderInclude = {
  createdBy: { select: { id: true, name: true, username: true } },
  diningTable: true,
  tableSession: {
    select: { id: true, status: true, openedAt: true },
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

async function validateDineInContext(tx, { type, tableSessionId, diningTableId }) {
  if (type !== 'DINE_IN') {
    return { tableSessionId: null, diningTableId: null };
  }
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

/** Stamp prep timers on items that do not have them yet; roll up order ETA. */
async function startPreparationTimers(tx, orderId, { userId = null, reason = null } = {}) {
  const now = new Date();
  const items = await tx.orderItem.findMany({
    where: { orderId, status: { not: 'CANCELLED' } },
  });
  if (!items.length) return null;

  let maxReady = null;
  for (const item of items) {
    if (item.prepCompletedAt) continue;
    const mins = item.prepTimeMinutesSnapshot ?? 5;
    const started = item.prepStartedAt || now;
    const ready = item.estimatedReadyAt || new Date(started.getTime() + mins * 60 * 1000);
    if (!item.prepStartedAt || !item.estimatedReadyAt) {
      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          prepStartedAt: started,
          estimatedReadyAt: ready,
          status: item.status === 'PENDING' ? 'PREPARING' : item.status,
        },
      });
    }
    if (!maxReady || ready > maxReady) maxReady = ready;
  }

  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order || order.status === 'CANCELLED' || order.status === 'COMPLETED') return null;

  const data = {
    prepStartedAt: order.prepStartedAt || now,
    estimatedReadyAt: maxReady,
  };

  if (order.status === 'PLACED' || order.status === 'CONFIRMED' || order.status === 'DRAFT') {
    // Caller should already be past DRAFT; defensive
  }
  if (['PLACED', 'CONFIRMED'].includes(order.status)) {
    data.status = 'PREPARING';
    data.statusHistory = {
      create: {
        fromStatus: order.status,
        toStatus: 'PREPARING',
        changedById: userId,
        reason: reason || 'preparation started',
      },
    };
  }

  return tx.order.update({
    where: { id: orderId },
    data,
    include: orderInclude,
  });
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

async function createItemRows(tx, orderId, lines, { startPrep = false } = {}) {
  const now = new Date();
  for (const line of lines) {
    const mins = line.prepTimeMinutesSnapshot ?? 5;
    const prepStartedAt = startPrep ? now : null;
    const estimatedReadyAt = startPrep ? new Date(now.getTime() + mins * 60 * 1000) : null;
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
        prepTimeMinutesSnapshot: mins,
        prepStartedAt,
        estimatedReadyAt,
        status: startPrep ? 'PREPARING' : 'PENDING',
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

async function listOrders(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (query.type) where.type = query.type;
  if (query.activeOnly === 'true') {
    where.status = { notIn: ['COMPLETED', 'CANCELLED'] };
  }

  // Section tabs (server-side) — combine with optional status / paymentStatus filters via AND
  const and = [];
  if (query.paidOnly === 'true' || query.section === 'paid') {
    and.push({ paymentStatus: 'PAID' });
    and.push({ status: { not: 'CANCELLED' } });
  } else if (query.section === 'open') {
    and.push({ paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } });
    and.push({ status: { notIn: ['CANCELLED'] } });
  }

  if (query.status) {
    const statuses = String(query.status)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    and.push({ status: statuses.length > 1 ? { in: statuses } : statuses[0] });
  }
  if (query.paymentStatus && query.section !== 'paid') {
    const payments = String(query.paymentStatus)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    and.push({ paymentStatus: payments.length > 1 ? { in: payments } : payments[0] });
  }
  if (and.length) where.AND = and;

  if (query.search) {
    where.OR = [
      { orderNumber: { contains: query.search, mode: 'insensitive' } },
      { customerName: { contains: query.search, mode: 'insensitive' } },
      { customerPhone: { contains: query.search, mode: 'insensitive' } },
    ];
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
        diningTable: { select: { id: true, number: true, section: true } },
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
  const customerName = String(data.customerName || '').trim();
  const customerPhone = String(data.customerPhone || '').trim();
  if (!customerName) throw new AppError('Customer name is required', 400);

  if (data.type === 'DELIVERY') {
    if (!customerPhone || customerPhone.length < 7) {
      throw new AppError('Phone number is required', 400);
    }
    const line1 = String(data.deliveryAddressSnapshot?.line1 || '').trim();
    const city = String(data.deliveryAddressSnapshot?.city || '').trim();
    if (!line1) throw new AppError('Complete delivery address is required', 400);
    if (!city) throw new AppError('Nearby location / area is required', 400);
  }

  const customersService = require('../customers/customers.service');

  const order = await prisma.$transaction(async (tx) => {
    const ctx = await validateDineInContext(tx, data);
    const lines = await buildPricedLines(tx, data.items);
    const subtotal = sumSubtotal(lines);
    let deliveryFee = D(0);
    if (data.type === 'DELIVERY') {
      if (data.deliveryFee !== undefined && data.deliveryFee !== null) {
        deliveryFee = D(data.deliveryFee);
      } else {
        const settings = await tx.restaurantSettings.findFirst();
        deliveryFee = D(settings?.deliveryFeeDefault || 0);
      }
    }
    const grandTotal = subtotal.plus(deliveryFee).toDecimalPlaces(2);
    const orderNumber = await nextOrderNumber(tx);

    const guestCustomer = await customersService.upsertGuestCustomer(
      { name: customerName, phone: customerPhone || null },
      tx
    );

    const deliverySnapshot =
      data.type === 'DELIVERY'
        ? {
            name: customerName,
            phone: customerPhone,
            line1: String(data.deliveryAddressSnapshot?.line1 || '').trim(),
            city: String(data.deliveryAddressSnapshot?.city || '').trim(),
            ...(data.deliveryAddressSnapshot?.notes
              ? { notes: String(data.deliveryAddressSnapshot.notes).trim() }
              : {}),
          }
        : null;

    if (data.type === 'DELIVERY' && data.saveDeliveryAddress) {
      await customersService.saveDefaultDeliveryAddress(
        {
          customerId: guestCustomer.id,
          line1: deliverySnapshot.line1,
          city: deliverySnapshot.city,
        },
        tx
      );
    }

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
        customerPhone: customerPhone || null,
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
    if (existing.status === 'COMPLETED') {
      throw new AppError('Cannot add items to a completed order', 409);
    }
    if (existing.status === 'CANCELLED') {
      throw new AppError('Cannot add items to a cancelled order', 409);
    }
    if (!['DRAFT', 'PLACED', 'CONFIRMED'].includes(existing.status)) {
      throw new AppError(
        'Cannot add items after preparation has started (inventory already locked)',
        409
      );
    }

    const lines = await buildPricedLines(tx, items);
    await createItemRows(tx, orderId, lines, { startPrep: false });
    await recalculateOrderTotals(tx, orderId);

    return tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
  });

  return mapOrder(order);
}

async function transitionOrder(orderId, toStatus, userId, reason, options = {}) {
  const allowNegativeStock = Boolean(options.allowNegativeStock);
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
      if (!SETTLED_PAYMENT_STATUSES.has(existing.paymentStatus)) {
        throw new AppError(
          'Order cannot be completed while an amount remains outstanding',
          409
        );
      }
    }

    const now = new Date();
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: toStatus,
        ...(toStatus === 'PLACED' ? { placedAt: now } : {}),
        ...(toStatus === 'READY' ? { readyNotifiedAt: existing.readyNotifiedAt || now } : {}),
        ...(toStatus === 'COMPLETED' ? { completedAt: now } : {}),
        ...(toStatus === 'CANCELLED'
          ? { cancelledAt: now, cancellationReason: reason, estimatedReadyAt: null }
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

    if (toStatus === 'PREPARING') {
      // Deduct inventory atomically with PREPARING — rolls back status if stock fails.
      await inventoryDeduction.deductForOrder({
        orderId,
        userId,
        allowNegative: allowNegativeStock,
        tx,
      });
      await startPreparationTimers(tx, orderId, { userId, reason: reason || 'manual preparing' });
    }

    if (toStatus === 'READY') {
      await tx.orderItem.updateMany({
        where: { orderId, status: { not: 'CANCELLED' }, prepCompletedAt: null },
        data: { prepCompletedAt: now, status: 'READY' },
      });
    }

    let cancelledTickets = [];
    let kitchenTickets = [];
    if (toStatus === 'CANCELLED') {
      cancelledTickets = await kitchenService.cancelTicketsForOrder(tx, orderId);
      await tx.orderItem.updateMany({
        where: { orderId, status: { not: 'CANCELLED' } },
        data: { status: 'CANCELLED' },
      });
      // After prep: do not restock — record wastage once for consumed ingredients.
      if (['PREPARING', 'READY', 'SERVED'].includes(existing.status)) {
        await inventoryDeduction.recordCancelWastage({
          orderId,
          userId,
          reason: reason || 'Order cancelled after preparation',
          tx,
        });
      }
    }

    // KDS tickets when order enters preparation (draft never appears on kitchen).
    if (toStatus === 'PREPARING') {
      kitchenTickets = await kitchenService.createTicketsForOrder(tx, orderId);
    }

    const fresh = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
    return { order: fresh || updated, cancelledTickets, kitchenTickets };
  });

  if (toStatus === 'PREPARING') {
    try {
      const { syncLowStockNotification } = require('../inventory/lowStockNotify');
      const consumes = await prisma.inventoryTransaction.findMany({
        where: { referenceType: 'Order', referenceId: orderId, type: 'CONSUME' },
        select: { ingredientId: true },
      });
      for (const c of consumes) {
        await syncLowStockNotification(null, c.ingredientId);
      }
    } catch {
      /* ignore notify failures */
    }
  }

  const mapped = mapOrder(result.order);
  mapped._cancelledKitchenTickets = (result.cancelledTickets || []).map(kitchenService.mapTicket);
  mapped._kitchenTickets = (result.kitchenTickets || []).map(kitchenService.mapTicket);
  return mapped;
}

async function submitOrder(orderId, userId, options = {}) {
  const placed = await transitionOrder(orderId, 'PLACED', userId, 'Submitted from POS', options);
  // Prep + inventory deduct; payment remains independent.
  const preparing = await transitionOrder(
    orderId,
    'PREPARING',
    userId,
    'preparation started on submit',
    options
  );
  preparing.previousStatus = placed.status;
  return preparing;
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
        customerId: source.customerId,
        customerName: source.customerName,
        customerPhone: source.customerPhone,
        tableSessionId: source.tableSessionId,
        diningTableId: source.diningTableId,
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
  startPreparationTimers,
  SETTLED_PAYMENT_STATUSES,
};
