const { randomUUID } = require('crypto');
const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { serializeDecimals } = require('../../utils/decimal');
const billing = require('../billing/billing.service');

const orderPrintInclude = {
  diningTable: { select: { number: true, section: true } },
  createdBy: { select: { name: true } },
  customer: { select: { name: true, phone: true } },
  items: {
    where: { status: { not: 'CANCELLED' } },
    include: {
      modifiers: true,
    },
    orderBy: { createdAt: 'asc' },
  },
  discounts: true,
  payments: {
    where: { status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
    include: { method: true },
  },
};

function orderTypeLabel(type) {
  if (type === 'DINE_IN') return 'DINE IN';
  if (type === 'TAKEAWAY') return 'TAKEAWAY';
  if (type === 'DELIVERY') return 'DELIVERY';
  return type || '';
}

async function loadRestaurant() {
  return prisma.restaurant.findFirst({
    where: { isActive: true },
    include: { settings: true },
  });
}

async function loadStationsMap(stationIds) {
  const ids = [...new Set(stationIds.filter(Boolean))];
  if (!ids.length) return {};
  const rows = await prisma.kitchenStation.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, code: true },
  });
  return Object.fromEntries(rows.map((s) => [s.id, s]));
}

async function buildSnapshots(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderPrintInclude,
  });
  if (!order) throw new AppError('Order not found', 404);
  if (order.status === 'DRAFT') {
    throw new AppError('Draft orders cannot be printed', 409);
  }

  const restaurant = await loadRestaurant();
  const settings = await billing.getSettings();
  const bill = billing.computeBillBreakdown(order, settings);
  const stations = await loadStationsMap(order.items.map((i) => i.kitchenStationId));

  const guestName =
    order.customerName ||
    order.deliveryAddressSnapshot?.name ||
    order.customer?.name ||
    null;
  const guestPhone =
    order.customerPhone ||
    order.deliveryAddressSnapshot?.phone ||
    order.customer?.phone ||
    null;

  const baseMeta = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    typeLabel: orderTypeLabel(order.type),
    paymentStatus: order.paymentStatus,
    table: order.diningTable?.number || null,
    tableSection: order.diningTable?.section || null,
    cashier: order.createdBy?.name || null,
    placedAt: order.placedAt || order.createdAt,
    notes: order.notes || null,
    deliveryAddress: order.deliveryAddressSnapshot || null,
    customerName: guestName,
    customerPhone: guestPhone,
  };

  const restaurantInfo = {
    name: restaurant?.name || 'Restaurant',
    address: restaurant?.address || null,
    phone: restaurant?.phone || null,
    logoUrl: null,
    footer: restaurant?.settings?.receiptFooter || null,
  };

  const items = order.items.map((item) => ({
    id: item.id,
    name: item.nameSnapshot,
    variantName: item.variantNameSnapshot || null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    specialInstructions: item.specialInstructions || null,
    stationName: item.kitchenStationId
      ? stations[item.kitchenStationId]?.name || null
      : 'Unassigned',
    modifiers: (item.modifiers || []).map((m) => ({
      name: m.nameSnapshot,
      quantity: m.quantity,
      priceDelta: m.priceDelta,
    })),
  }));

  const paidSummary = billing.sumSuccessfulPayments(order.payments || []);
  const outstandingPreTax = billing.getOutstandingPreTax(bill, order.payments || []);
  const paymentLines = (order.payments || []).map((p) => ({
    methodName: p.method?.name || 'Payment',
    preTaxAmount: p.preTaxAmount,
    taxAmount: p.taxAmount,
    amount: p.amount,
  }));

  let paymentNote = null;
  if (order.paymentStatus === 'UNPAID') {
    paymentNote = 'UNPAID — select a payment method before printing';
  } else if (order.paymentStatus === 'PARTIALLY_PAID') {
    paymentNote = 'PARTIALLY PAID — remaining balance is still due';
  } else if (order.paymentStatus === 'PAID') {
    paymentNote = 'PAID IN FULL';
  }

  const customerSlip = serializeDecimals({
    documentType: 'CUSTOMER_ORDER_SLIP',
    restaurant: restaurantInfo,
    order: baseMeta,
    items,
    bill: {
      subtotal: bill.subtotal,
      discount: bill.discount,
      serviceCharge: bill.serviceCharge,
      deliveryFee: bill.deliveryFee,
      taxableBase: bill.taxableBase,
      nonTaxable: bill.nonTaxable,
      preTaxTotal: bill.preTaxTotal,
      taxTotal: order.taxTotal,
      grandTotal: order.grandTotal,
      amountPaidGross: paidSummary.gross,
      amountPaidTax: paidSummary.tax,
      remainingPreTax: outstandingPreTax,
    },
    payments: paymentLines,
    paymentNote,
  });

  const kitchenTicket = serializeDecimals({
    documentType: 'KITCHEN_TICKET',
    restaurant: { name: restaurantInfo.name },
    order: {
      orderNumber: baseMeta.orderNumber,
      typeLabel: baseMeta.typeLabel,
      table: baseMeta.table,
      tableSection: baseMeta.tableSection,
      placedAt: baseMeta.placedAt,
      notes: baseMeta.notes,
      customerName: guestName,
    },
    items: items.map((item) => ({
      name: item.name,
      variantName: item.variantName,
      quantity: item.quantity,
      specialInstructions: item.specialInstructions,
      stationName: item.stationName,
      modifiers: item.modifiers.map((m) => ({
        name: m.name,
        quantity: m.quantity,
      })),
    })),
  });

  const cashierRecord = serializeDecimals({
    documentType: 'CASHIER_RECORD',
    restaurant: restaurantInfo,
    order: baseMeta,
    items,
    bill: customerSlip.bill,
    payments: paymentLines,
    paymentNote,
  });

  return { order, customerSlip, kitchenTicket, cashierRecord };
}

/**
 * Idempotent: creates CUSTOMER_ORDER_SLIP + KITCHEN_TICKET + CASHIER_RECORD once per order.
 * Returns { jobs, createdNew } — createdNew is true only when at least one job was inserted.
 */
async function ensurePrintJobsForOrder(orderId, tx = prisma) {
  const { customerSlip, kitchenTicket, cashierRecord } = await buildSnapshots(orderId);

  const jobs = [];
  let createdNew = false;
  for (const [type, snapshot] of [
    ['KITCHEN_TICKET', kitchenTicket],
    ['CUSTOMER_ORDER_SLIP', customerSlip],
    ['CASHIER_RECORD', cashierRecord],
  ]) {
    const existing = await tx.printJob.findUnique({
      where: { orderId_type: { orderId, type } },
    });
    if (existing) {
      // Keep kitchen snapshot stable after first create; refresh money slips until first print.
      if (
        (type === 'CUSTOMER_ORDER_SLIP' || type === 'CASHIER_RECORD') &&
        existing.printCount === 0
      ) {
        const updated = await tx.printJob.update({
          where: { id: existing.id },
          data: { snapshot },
        });
        jobs.push(updated);
      } else {
        jobs.push(existing);
      }
      continue;
    }
    const created = await tx.printJob.create({
      data: {
        id: randomUUID(),
        orderId,
        type,
        status: 'READY',
        documentKey: `${type}-${orderId}`,
        snapshot,
        printCount: 0,
      },
    });
    createdNew = true;
    jobs.push(created);
  }

  return {
    jobs: jobs.map((j) => serializeDecimals(j)),
    createdNew,
  };
}

function guestFromOrder(order) {
  return {
    customerName:
      order.customerName ||
      order.deliveryAddressSnapshot?.name ||
      order.customer?.name ||
      null,
    customerPhone:
      order.customerPhone ||
      order.deliveryAddressSnapshot?.phone ||
      order.customer?.phone ||
      null,
  };
}

/** Ensure stored print snapshots include guest name (and phone on customer slip). */
async function enrichJobSnapshotsWithGuest(order, jobs) {
  const guest = guestFromOrder(order);
  if (!guest.customerName && !guest.customerPhone) return jobs;

  const next = [];
  for (const job of jobs) {
    const snap = job.snapshot && typeof job.snapshot === 'object' ? job.snapshot : null;
    const orderMeta = snap?.order || {};
    const needsName = guest.customerName && !orderMeta.customerName;
    const needsPhone =
      (job.type === 'CUSTOMER_ORDER_SLIP' || job.type === 'CASHIER_RECORD') &&
      guest.customerPhone &&
      !orderMeta.customerPhone;

    if (!snap || (!needsName && !needsPhone)) {
      next.push(job);
      continue;
    }

    const updatedOrder =
      job.type === 'KITCHEN_TICKET'
        ? {
            ...orderMeta,
            ...(guest.customerName ? { customerName: guest.customerName } : {}),
          }
        : {
            ...orderMeta,
            ...(guest.customerName ? { customerName: guest.customerName } : {}),
            ...(guest.customerPhone ? { customerPhone: guest.customerPhone } : {}),
          };

    const snapshot = { ...snap, order: updatedOrder };
    const updated = await prisma.printJob.update({
      where: { id: job.id },
      data: { snapshot },
    });
    next.push(updated);
  }
  return next;
}

async function getPrintJobs(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: { select: { name: true, phone: true } } },
  });
  if (!order) throw new AppError('Order not found', 404);
  if (order.status === 'DRAFT') throw new AppError('Draft orders cannot be printed', 409);

  let jobs = await prisma.printJob.findMany({
    where: { orderId },
    orderBy: { type: 'asc' },
  });

  if (jobs.length < 3) {
    const ensured = await ensurePrintJobsForOrder(orderId);
    jobs = ensured.jobs;
  } else {
    jobs = await enrichJobSnapshotsWithGuest(order, jobs);
    jobs = jobs.map((j) => serializeDecimals(j));
  }

  return jobs;
}

async function getPrintJob(orderId, type) {
  const jobs = await getPrintJobs(orderId);
  const job = jobs.find((j) => j.type === type);
  if (!job) throw new AppError('Print job not found', 404);
  return job;
}

async function markPrinted(orderId, type, { reprint = false, userId = null, failed = false, error = null } = {}) {
  const job = await prisma.printJob.findUnique({
    where: { orderId_type: { orderId, type } },
  });
  if (!job) throw new AppError('Print job not found', 404);

  const updated = await prisma.printJob.update({
    where: { id: job.id },
    data: failed
      ? {
          status: 'FAILED',
          lastError: error || 'Print failed',
        }
      : {
          status: 'PRINTED',
          printCount: { increment: 1 },
          lastPrintedAt: new Date(),
          lastError: null,
        },
  });

  if (userId) {
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: failed
          ? 'PRINT_FAILED'
          : reprint || job.printCount > 0
            ? 'PRINT_REPRINT'
            : 'PRINT_SUCCESS',
        entityType: 'PrintJob',
        entityId: job.id,
        after: { type, orderId, reprint: Boolean(reprint || job.printCount > 0) },
      },
    });
  }

  return serializeDecimals({
    ...updated,
    isReprint: !failed && (reprint || job.printCount > 0),
  });
}

async function refreshSnapshots(orderId) {
  const { customerSlip, kitchenTicket, cashierRecord } = await buildSnapshots(orderId);
  await ensurePrintJobsForOrder(orderId);

  await prisma.printJob.update({
    where: { orderId_type: { orderId, type: 'CUSTOMER_ORDER_SLIP' } },
    data: { snapshot: customerSlip },
  });
  await prisma.printJob.update({
    where: { orderId_type: { orderId, type: 'CASHIER_RECORD' } },
    data: { snapshot: cashierRecord },
  });
  const kitchen = await prisma.printJob.findUnique({
    where: { orderId_type: { orderId, type: 'KITCHEN_TICKET' } },
  });
  if (kitchen && kitchen.printCount === 0) {
    await prisma.printJob.update({
      where: { id: kitchen.id },
      data: { snapshot: kitchenTicket },
    });
  }

  return getPrintJobs(orderId);
}

/**
 * Called after a successful payment. Creates print jobs once.
 * initiatePrint is true only when jobs are newly created (first payment that triggers print).
 * Later partial payments / idempotent replays do not auto-print again.
 */
async function initiatePrintAfterPayment(orderId) {
  const { jobs, createdNew } = await ensurePrintJobsForOrder(orderId);
  return {
    printJobs: jobs,
    initiatePrint: createdNew,
  };
}

module.exports = {
  ensurePrintJobsForOrder,
  getPrintJobs,
  getPrintJob,
  markPrinted,
  refreshSnapshots,
  initiatePrintAfterPayment,
  buildSnapshots,
};
