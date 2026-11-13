const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { serializeDecimals } = require('../../utils/decimal');
const { hashPayload } = require('../../utils/moneyMath');
const billing = require('../billing/billing.service');
const printService = require('../printing/print.service');
const { D, money2 } = billing;

const paymentInclude = {
  method: true,
  createdBy: { select: { id: true, name: true, username: true } },
  refunds: {
    include: {
      authorizedBy: { select: { id: true, name: true } },
      processedBy: { select: { id: true, name: true } },
    },
  },
};

async function lockOrder(tx, orderId) {
  const rows = await tx.$queryRawUnsafe(
    `SELECT id FROM orders WHERE id = $1::uuid FOR UPDATE`,
    orderId
  );
  if (!rows.length) throw new AppError('Order not found', 404);
  return rows[0];
}

async function refreshSettlement(tx, orderId) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      payments: { where: { status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, include: { refunds: true } },
    },
  });
  if (!order) throw new AppError('Order not found', 404);

  if (['COMPLIMENTARY', 'WRITTEN_OFF'].includes(order.paymentStatus)) {
    return order;
  }

  const settings = await billing.getSettings();
  const bill = billing.computeBillBreakdown(order, settings);
  const outstanding = billing.getOutstandingPreTax(bill, order.payments);
  const paid = billing.sumSuccessfulPayments(order.payments);
  const refunded = billing.sumRefunds(order.payments);

  let paymentStatus = 'UNPAID';
  if (outstanding.eq(0)) {
    if (paid.preTax.eq(0) && bill.preTaxTotal.eq(0)) {
      paymentStatus = 'PAID';
    } else if (refunded.gross.gt(0) && money2(paid.gross.minus(refunded.gross)).eq(0)) {
      paymentStatus = 'REFUNDED';
    } else if (refunded.gross.gt(0)) {
      paymentStatus = 'PARTIALLY_REFUNDED';
    } else {
      paymentStatus = 'PAID';
    }
  } else if (outstanding.lt(bill.preTaxTotal)) {
    paymentStatus = 'PARTIALLY_PAID';
  }

  const netTax = money2(paid.tax.minus(refunded.tax));
  const taxTotal = netTax.lt(0) ? D(0) : netTax;
  const grandTotal = money2(bill.preTaxTotal.plus(taxTotal));

  return tx.order.update({
    where: { id: orderId },
    data: {
      paymentStatus,
      taxTotal,
      grandTotal,
      discountLocked: paid.preTax.gt(0) || order.discountLocked,
    },
  });
}

async function findBatchByKey(key, orderId) {
  const exact = await prisma.payment.findUnique({
    where: { idempotencyKey: key },
    include: paymentInclude,
  });
  if (!exact) return null;
  const batch = await prisma.payment.findMany({
    where: {
      orderId: orderId || exact.orderId,
      OR: [{ idempotencyKey: key }, { idempotencyKey: { startsWith: `${key}:` } }],
    },
    include: paymentInclude,
    orderBy: { createdAt: 'asc' },
  });
  return { primary: exact, batch: batch.length ? batch : [exact] };
}

async function createPayments(orderId, body, userId, idempotencyKey, options = {}) {
  const key = idempotencyKey || body.idempotencyKey;
  if (!key) throw new AppError('Idempotency-Key is required', 400);
  const canonical = {
    orderId,
    portions: body.portions.map((p) => ({
      methodId: p.methodId,
      preTaxAmount: Number(p.preTaxAmount),
      amountTendered: p.amountTendered == null ? null : Number(p.amountTendered),
      reference: p.reference || null,
      notes: p.notes || null,
    })),
  };
  const requestHash = hashPayload(canonical);

  const existingBatch = await findBatchByKey(key, orderId);
  if (existingBatch) {
    if (existingBatch.primary.requestHash && existingBatch.primary.requestHash !== requestHash) {
      throw new AppError('Idempotency key reused with a different payload', 422);
    }
    const printMeta = await printService.initiatePrintAfterPayment(orderId);
    return serializeDecimals({
      payments: existingBatch.batch,
      replayed: true,
      printJobs: printMeta.printJobs,
      initiatePrint: printMeta.initiatePrint,
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          payments: {
            where: { status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
            include: { refunds: true },
          },
        },
      });

      if (['CANCELLED'].includes(order.status)) {
        throw new AppError('Cannot pay a cancelled order', 409);
      }
      if (['COMPLIMENTARY', 'WRITTEN_OFF'].includes(order.paymentStatus)) {
        throw new AppError('Order is settled without payment', 409);
      }

      const settings = await billing.getSettings();
      const bill = billing.computeBillBreakdown(order, settings);
      const outstanding = billing.getOutstandingPreTax(bill, order.payments);
      if (outstanding.lte(0)) {
        // Concurrent duplicate: another request may have just paid with this key
        const raced = await tx.payment.findUnique({
          where: { idempotencyKey: key },
          include: paymentInclude,
        });
        if (raced && (!raced.requestHash || raced.requestHash === requestHash)) {
          const batch = await tx.payment.findMany({
            where: {
              orderId,
              OR: [{ idempotencyKey: key }, { idempotencyKey: { startsWith: `${key}:` } }],
            },
            include: paymentInclude,
            orderBy: { createdAt: 'asc' },
          });
          return { __replayed: true, payments: batch.length ? batch : [raced] };
        }
        throw new AppError('Order has no outstanding balance', 409);
      }

      const totalRequested = body.portions.reduce(
        (a, p) => a.plus(p.preTaxAmount || 0),
        D(0)
      );
      if (!settings.allowPartialPayments && !money2(totalRequested).eq(outstanding)) {
        throw new AppError('Partial payments are disabled; pay the full outstanding balance', 400);
      }

      const methods = await tx.paymentMethod.findMany({
        where: { deletedAt: null },
      });

      // Reject client-submitted tax/price fields if present (schema strips them; defend in depth)
      for (const p of body.portions) {
        if (p.taxAmount != null || p.taxRate != null || p.amount != null) {
          throw new AppError('Client-submitted tax or gross amounts are not accepted', 400);
        }
      }

      const allocations = billing.buildPaymentAllocations(
        bill,
        outstanding,
        body.portions,
        methods
      );

      for (const alloc of allocations) {
        if (alloc.reference) {
          const dup = await tx.payment.findFirst({
            where: { reference: alloc.reference },
          });
          if (dup) throw new AppError('Payment reference must be unique', 409);
        }
      }

      const openShift = await tx.employeeShift.findFirst({
        where: { userId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });

      const created = [];
      for (let i = 0; i < allocations.length; i += 1) {
        const alloc = allocations[i];
        const paymentKey = i === 0 ? key : `${key}:${i}`;
        const payment = await tx.payment.create({
          data: {
            orderId,
            methodId: alloc.methodId,
            createdById: userId,
            shiftId: openShift?.id || null,
            preTaxAmount: alloc.preTaxAmount,
            taxRateSnapshot: alloc.taxRateSnapshot,
            taxAmount: alloc.taxAmount,
            amount: alloc.amount,
            amountTendered: alloc.amountTendered,
            changeReturned: alloc.changeReturned,
            idempotencyKey: paymentKey,
            requestHash: i === 0 ? requestHash : `${requestHash}:${i}`,
            reference: alloc.reference,
            notes: alloc.notes,
            status: 'COMPLETED',
          },
          include: paymentInclude,
        });
        created.push(payment);

        if (alloc.method.isCash && openShift) {
          await tx.employeeShift.update({
            where: { id: openShift.id },
            data: { cashReceived: { increment: alloc.amount } },
          });
        }
      }

      await refreshSettlement(tx, orderId);

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'PAYMENT_CREATE',
          entityType: 'Order',
          entityId: orderId,
          after: {
            paymentIds: created.map((p) => p.id),
            preTax: created.reduce((a, p) => a + Number(p.preTaxAmount), 0),
          },
        },
      });

      return { payments: created };
    });

    // Idempotent: initiatePrint only when PrintJobs are newly created (first successful payment).
    // On replay, still call ensure so a crashed first response can recover without duplicating jobs.
    if (result?.__replayed) {
      const printMeta = await printService.initiatePrintAfterPayment(orderId);
      return serializeDecimals({
        payments: result.payments,
        replayed: true,
        printJobs: printMeta.printJobs,
        initiatePrint: printMeta.initiatePrint,
      });
    }

    const printMeta = await printService.initiatePrintAfterPayment(orderId);
    return serializeDecimals({
      payments: result.payments,
      replayed: false,
      printJobs: printMeta.printJobs,
      initiatePrint: printMeta.initiatePrint,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const again = await findBatchByKey(key, orderId);
      if (again) {
        if (again.primary.requestHash && again.primary.requestHash !== requestHash) {
          throw new AppError('Idempotency key reused with a different payload', 422);
        }
        const printMeta = await printService.initiatePrintAfterPayment(orderId);
        return serializeDecimals({
          payments: again.batch,
          replayed: true,
          printJobs: printMeta.printJobs,
          initiatePrint: printMeta.initiatePrint,
        });
      }
    }
    // Last-chance concurrent recovery
    const again = await findBatchByKey(key, orderId);
    if (again && (!again.primary.requestHash || again.primary.requestHash === requestHash)) {
      const printMeta = await printService.initiatePrintAfterPayment(orderId);
      return serializeDecimals({
        payments: again.batch,
        replayed: true,
        printJobs: printMeta.printJobs,
        initiatePrint: printMeta.initiatePrint,
      });
    }
    throw err;
  }
}

async function listOrderPayments(orderId) {
  const payments = await prisma.payment.findMany({
    where: { orderId },
    include: paymentInclude,
    orderBy: { createdAt: 'asc' },
  });
  return serializeDecimals(payments);
}

async function getPayment(id) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { ...paymentInclude, order: true },
  });
  if (!payment) throw new AppError('Payment not found', 404);
  return serializeDecimals(payment);
}

async function applyDiscount(orderId, data, userId) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        payments: { where: { status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } } },
        items: true,
      },
    });
    if (!order) throw new AppError('Order not found', 404);
    if (order.discountLocked || order.payments.length > 0) {
      throw new AppError('Discount is locked after the first payment', 409);
    }

    const subtotal = D(order.subtotal);
    let amount = D(0);
    if (data.type === 'FIXED') {
      amount = money2(data.value);
    } else {
      amount = money2(subtotal.times(D(data.value).div(100)));
    }
    if (amount.gt(subtotal)) throw new AppError('Discount cannot exceed subtotal', 400);

    await tx.orderDiscount.deleteMany({ where: { orderId } });
    await tx.orderDiscount.create({
      data: {
        orderId,
        type: data.type,
        value: D(data.value),
        amount,
        reason: data.reason || null,
      },
    });

    const settings = await billing.getSettings();
    const bill = billing.computeBillBreakdown(
      { ...order, discountTotal: amount },
      settings
    );

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        discountTotal: amount,
        grandTotal: bill.preTaxTotal,
        taxTotal: 0,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'ORDER_DISCOUNT',
        entityType: 'Order',
        entityId: orderId,
        after: { type: data.type, value: data.value, amount: String(amount) },
      },
    });

    return serializeDecimals(updated);
  });
}

async function settleWithoutPayment(orderId, status, reason, userId) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        payments: { where: { status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } } },
      },
    });
    if (!order) throw new AppError('Order not found', 404);
    if (order.payments.length > 0) {
      throw new AppError('Cannot mark complimentary/written-off after payments exist', 409);
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: status,
        settlementReason: reason,
        settlementAt: new Date(),
        settlementById: userId,
        discountLocked: true,
        taxTotal: 0,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: `ORDER_${status}`,
        entityType: 'Order',
        entityId: orderId,
        after: { reason },
      },
    });

    return serializeDecimals(updated);
  });
}

async function createReceipt(orderId, userId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { modifiers: true } },
      createdBy: { select: { id: true, name: true } },
      payments: { include: paymentInclude },
      discounts: true,
      refunds: true,
    },
  });
  if (!order) throw new AppError('Order not found', 404);

  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true },
    include: { settings: true },
  });
  const settings = await billing.getSettings();
  const bill = billing.computeBillBreakdown(order, settings);
  const outstanding = billing.getOutstandingPreTax(bill, order.payments);
  const paid = billing.sumSuccessfulPayments(order.payments);
  const refunded = billing.sumRefunds(order.payments);

  const receiptNumber = `R-${order.orderNumber}`;
  const snapshot = {
    restaurant: {
      name: restaurant?.name,
      address: restaurant?.address,
      phone: restaurant?.phone,
      footer: restaurant?.settings?.receiptFooter,
    },
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      type: order.type,
      status: order.status,
      paymentStatus: order.paymentStatus,
      customerName:
        order.customerName ||
        order.deliveryAddressSnapshot?.name ||
        null,
      customerPhone:
        order.customerPhone ||
        order.deliveryAddressSnapshot?.phone ||
        null,
      cashier: order.createdBy?.name,
      createdAt: order.createdAt,
    },
    bill: serializeDecimals(bill),
    outstandingPreTax: String(outstanding),
    amountPaidGross: String(money2(paid.gross.minus(refunded.gross))),
    items: serializeDecimals(order.items),
    payments: serializeDecimals(order.payments),
    discounts: serializeDecimals(order.discounts),
    refunds: serializeDecimals(order.refunds),
  };

  const existing = await prisma.receipt.findFirst({ where: { orderId } });
  if (existing) {
    const updated = await prisma.receipt.update({
      where: { id: existing.id },
      data: { snapshot, printedAt: new Date() },
    });
    return serializeDecimals({ ...updated, reprinted: true });
  }

  const receipt = await prisma.receipt.create({
    data: {
      orderId,
      receiptNumber,
      snapshot,
      printedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'RECEIPT_CREATE',
      entityType: 'Receipt',
      entityId: receipt.id,
    },
  });

  return serializeDecimals({ ...receipt, reprinted: false });
}

async function getReceipt(orderId) {
  const receipt = await prisma.receipt.findFirst({ where: { orderId } });
  if (!receipt) throw new AppError('Receipt not found', 404);
  return serializeDecimals(receipt);
}

module.exports = {
  createPayments,
  listOrderPayments,
  getPayment,
  applyDiscount,
  settleWithoutPayment,
  createReceipt,
  getReceipt,
  refreshSettlement,
  lockOrder,
  paymentInclude,
};
