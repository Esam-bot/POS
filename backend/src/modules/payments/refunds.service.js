const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { serializeDecimals } = require('../../utils/decimal');
const { hashPayload } = require('../../utils/moneyMath');
const billing = require('../billing/billing.service');
const { D, money2 } = billing;
const { lockOrder, refreshSettlement } = require('./payments.service');

const refundInclude = {
  payment: { include: { method: true } },
  authorizedBy: { select: { id: true, name: true, username: true } },
  processedBy: { select: { id: true, name: true, username: true } },
};

function remainingRefundable(payment) {
  const refundedGross = (payment.refunds || []).reduce(
    (acc, r) => acc.plus(r.amount || 0),
    D(0)
  );
  const refundedPreTax = (payment.refunds || []).reduce(
    (acc, r) => acc.plus(r.preTaxAmount || 0),
    D(0)
  );
  const refundedTax = (payment.refunds || []).reduce(
    (acc, r) => acc.plus(r.taxAmount || 0),
    D(0)
  );
  return {
    gross: money2(D(payment.amount).minus(refundedGross)),
    preTax: money2(D(payment.preTaxAmount).minus(refundedPreTax)),
    tax: money2(D(payment.taxAmount).minus(refundedTax)),
  };
}

/**
 * Proportional reverse of pre-tax and tax for a gross refund amount.
 * Final refund on a payment absorbs remaining rounding difference.
 */
function allocateRefundComponents(payment, remaining, refundGross, isFinalRefund) {
  const gross = money2(refundGross);
  if (gross.lte(0)) throw new AppError('Refund amount must be greater than zero', 400);
  if (gross.gt(remaining.gross)) {
    throw new AppError('Refund exceeds remaining refundable amount', 400);
  }

  if (isFinalRefund || gross.eq(remaining.gross)) {
    return {
      amount: remaining.gross,
      preTaxAmount: remaining.preTax,
      taxAmount: remaining.tax,
    };
  }

  // Proportional split based on original payment composition
  const originalGross = D(payment.amount);
  const ratio = originalGross.eq(0) ? D(0) : gross.div(originalGross);
  let preTax = money2(D(payment.preTaxAmount).times(ratio));
  let tax = money2(gross.minus(preTax));

  // Prefer tax computed from rate when possible
  const rate = D(payment.taxRateSnapshot).div(100);
  if (rate.gt(0) && D(payment.taxAmount).gt(0)) {
    const taxableRatio = D(payment.taxAmount).div(
      D(payment.preTaxAmount).eq(0) ? 1 : D(payment.preTaxAmount)
    );
    // Keep proportional to original preTax/tax split
    preTax = money2(D(payment.preTaxAmount).times(ratio));
    tax = money2(gross.minus(preTax));
    if (tax.lt(0)) {
      tax = D(0);
      preTax = gross;
    }
  }

  // Ensure components sum to gross
  const sum = money2(preTax.plus(tax));
  if (!sum.eq(gross)) {
    tax = money2(gross.minus(preTax));
  }

  return { amount: gross, preTaxAmount: preTax, taxAmount: tax };
}

async function createRefund(paymentId, body, userId, canApprove) {
  const key = body.idempotencyKey;
  if (!key) throw new AppError('Idempotency-Key is required', 400);

  const canonical = {
    paymentId,
    amount: Number(body.amount),
    type: body.type,
    reason: body.reason,
    reference: body.reference || null,
  };
  const requestHash = hashPayload(canonical);

  const existing = await prisma.refund.findUnique({
    where: { idempotencyKey: key },
    include: refundInclude,
  });
  if (existing) {
    if (existing.requestHash && existing.requestHash !== requestHash) {
      throw new AppError('Idempotency key reused with a different payload', 422);
    }
    return serializeDecimals({ refund: existing, replayed: true });
  }

  if (!canApprove && body.type !== 'PAYMENT_CORRECTION') {
    // Sales returns / voids require approve permission; caller checks permissions.approve_refund
  }

  try {
    const refund = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { refunds: true, method: true, shift: true },
      });
      if (!payment) throw new AppError('Payment not found', 404);
      if (payment.status !== 'COMPLETED' && payment.status !== 'PARTIALLY_REFUNDED') {
        throw new AppError('Payment is not refundable', 409);
      }

      await lockOrder(tx, payment.orderId);

      const remaining = remainingRefundable(payment);
      const isFinal = money2(body.amount).gte(remaining.gross);
      const components = allocateRefundComponents(payment, remaining, body.amount, isFinal);

      const created = await tx.refund.create({
        data: {
          paymentId,
          orderId: payment.orderId,
          type: body.type,
          amount: components.amount,
          preTaxAmount: components.preTaxAmount,
          taxAmount: components.taxAmount,
          reason: body.reason,
          authorizedById: userId,
          processedById: userId,
          idempotencyKey: key,
          requestHash,
          reference: body.reference || null,
        },
        include: refundInclude,
      });

      const newRemaining = money2(remaining.gross.minus(components.amount));
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: newRemaining.eq(0) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });

      if (payment.method.isCash && payment.shiftId) {
        await tx.employeeShift.update({
          where: { id: payment.shiftId },
          data: { cashRefunds: { increment: components.amount } },
        });
      }

      await refreshSettlement(tx, payment.orderId);

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'PAYMENT_REFUND',
          entityType: 'Refund',
          entityId: created.id,
          after: {
            paymentId,
            type: body.type,
            amount: String(components.amount),
            reason: body.reason,
          },
        },
      });

      return { refund: created };
    });

    return serializeDecimals({
      refund: refund.refund,
      replayed: false,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const again = await prisma.refund.findUnique({
        where: { idempotencyKey: key },
        include: refundInclude,
      });
      if (again) {
        if (again.requestHash && again.requestHash !== requestHash) {
          throw new AppError('Idempotency key reused with a different payload', 422);
        }
        return serializeDecimals({
          refund: again,
          replayed: true,
        });
      }
    }
    throw err;
  }
}

async function listPaymentRefunds(paymentId) {
  const refunds = await prisma.refund.findMany({
    where: { paymentId },
    include: refundInclude,
    orderBy: { createdAt: 'asc' },
  });
  return serializeDecimals(refunds);
}

async function listRefunds(query = {}) {
  const where = {};
  if (query.type) where.type = query.type;
  if (query.orderId) where.orderId = query.orderId;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }

  const refunds = await prisma.refund.findMany({
    where,
    include: refundInclude,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(query.limit) || 100, 500),
  });
  return serializeDecimals(refunds);
}

module.exports = {
  createRefund,
  listPaymentRefunds,
  listRefunds,
  remainingRefundable,
  allocateRefundComponents,
};
