const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { serializeDecimals } = require('../../utils/decimal');
const { D, money2 } = require('../../utils/moneyMath');
const { expenseTotalsForRange } = require('../expenses/expenses.service');

/**
 * Inclusive calendar-day filter on createdAt (timestamptz).
 * From = start of day; To = end of day.
 * No dates → empty filter (existing default: all records).
 */
function dateFilter(query) {
  if (!query.from && !query.to) return {};
  if (query.from && query.to && query.from > query.to) {
    throw new AppError('From date must not be later than To date', 400);
  }
  const range = {};
  if (query.from) {
    const start = new Date(query.from);
    start.setHours(0, 0, 0, 0);
    range.gte = start;
  }
  if (query.to) {
    const end = new Date(query.to);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return { createdAt: range };
}

async function financialSummary(query = {}) {
  const paymentWhere = {
    status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
    ...dateFilter(query),
  };

  const payments = await prisma.payment.findMany({
    where: paymentWhere,
    include: {
      method: true,
      refunds: true,
      order: { select: { id: true, discountTotal: true, subtotal: true, paymentStatus: true } },
    },
  });

  const refundWhere = { ...dateFilter(query) };
  const refunds = await prisma.refund.findMany({
    where: refundWhere,
    include: { payment: { include: { method: true } } },
  });

  // Gross sales = sum of order item pre-tax (use payment order subtotals uniquely)
  const orderIds = [...new Set(payments.map((p) => p.orderId))];
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: {
          id: { in: orderIds },
          paymentStatus: { notIn: ['COMPLIMENTARY', 'WRITTEN_OFF'] },
        },
      })
    : [];

  // For date-scoped sales, also load orders completed/created in range with payments
  const ordersInRange = await prisma.order.findMany({
    where: {
      ...dateFilter(query),
      paymentStatus: { notIn: ['COMPLIMENTARY', 'WRITTEN_OFF', 'UNPAID'] },
      status: { not: 'CANCELLED' },
    },
  });

  const salesOrders = ordersInRange.length ? ordersInRange : orders;

  let grossSales = D(0);
  let discounts = D(0);
  for (const o of salesOrders) {
    grossSales = grossSales.plus(o.subtotal || 0);
    discounts = discounts.plus(o.discountTotal || 0);
  }

  let salesReturns = D(0);
  let voids = D(0);
  let paymentCorrections = D(0);
  let refundTotal = D(0);

  const refundsByType = {
    PAYMENT_CORRECTION: D(0),
    SALES_RETURN: D(0),
    VOID_AFTER_PAYMENT: D(0),
  };

  for (const r of refunds) {
    refundTotal = refundTotal.plus(r.amount || 0);
    refundsByType[r.type] = refundsByType[r.type].plus(r.amount || 0);
    // Sales impact uses pre-tax of sales-reducing refunds
    if (r.type === 'SALES_RETURN') {
      salesReturns = salesReturns.plus(r.preTaxAmount || 0);
    } else if (r.type === 'VOID_AFTER_PAYMENT') {
      voids = voids.plus(r.preTaxAmount || 0);
    } else {
      paymentCorrections = paymentCorrections.plus(r.amount || 0);
    }
  }

  const netSales = money2(grossSales.minus(discounts).minus(salesReturns).minus(voids));

  // Tax by method and rate
  const taxByMethod = {};
  const taxByRate = {};
  let totalTax = D(0);
  const collectionsByMethod = {};
  let totalCollections = D(0);

  for (const p of payments) {
    const code = p.method?.code || 'UNKNOWN';
    const refundedTax = (p.refunds || []).reduce((a, r) => a.plus(r.taxAmount || 0), D(0));
    const refundedGross = (p.refunds || []).reduce((a, r) => a.plus(r.amount || 0), D(0));
    const netTax = money2(D(p.taxAmount).minus(refundedTax));
    const netGross = money2(D(p.amount).minus(refundedGross));

    totalTax = totalTax.plus(netTax.lt(0) ? D(0) : netTax);
    totalCollections = totalCollections.plus(netGross.lt(0) ? D(0) : netGross);

    if (!taxByMethod[code]) taxByMethod[code] = D(0);
    taxByMethod[code] = taxByMethod[code].plus(netTax.lt(0) ? D(0) : netTax);

    const rateKey = String(p.taxRateSnapshot);
    if (!taxByRate[rateKey]) taxByRate[rateKey] = D(0);
    taxByRate[rateKey] = taxByRate[rateKey].plus(netTax.lt(0) ? D(0) : netTax);

    if (!collectionsByMethod[code]) collectionsByMethod[code] = D(0);
    collectionsByMethod[code] = collectionsByMethod[code].plus(netGross.lt(0) ? D(0) : netGross);
  }

  const outstandingOrders = await prisma.order.findMany({
    where: {
      paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
      status: { notIn: ['CANCELLED'] },
    },
    select: {
      id: true,
      orderNumber: true,
      subtotal: true,
      discountTotal: true,
      serviceCharge: true,
      deliveryFee: true,
      taxTotal: true,
      grandTotal: true,
      paymentStatus: true,
    },
  });

  const outstandingBalance = outstandingOrders.reduce(
    (a, o) => a.plus(o.grandTotal || 0),
    D(0)
  );

  const expenseTotals = await expenseTotalsForRange(query);
  const remainingAfterExpenses = money2(D(totalCollections).minus(expenseTotals.total));

  return serializeDecimals({
    sales: {
      grossSales,
      discounts,
      salesReturns,
      voids,
      netSales,
    },
    tax: {
      byMethod: taxByMethod,
      byRate: taxByRate,
      totalTax,
    },
    payments: {
      byMethod: collectionsByMethod,
      totalCollections,
      outstandingBalance,
      outstandingCount: outstandingOrders.length,
    },
    refunds: {
      paymentCorrections: refundsByType.PAYMENT_CORRECTION,
      salesReturns: refundsByType.SALES_RETURN,
      voids: refundsByType.VOID_AFTER_PAYMENT,
      total: refundTotal,
    },
    expenses: {
      total: expenseTotals.total,
      byCategory: expenseTotals.byCategory,
    },
    overview: {
      grossSales,
      discounts,
      netSales,
      taxCollected: totalTax,
      netPaymentsCollected: totalCollections,
      totalRefunds: refundTotal,
      totalExpenses: expenseTotals.total,
      remainingAfterExpenses,
    },
  });
}

module.exports = { financialSummary, dateFilter };
