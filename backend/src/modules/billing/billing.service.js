const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { D, roundPkr, money2 } = require('../../utils/moneyMath');
const { serializeDecimals } = require('../../utils/decimal');

async function getSettings() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true, deletedAt: null },
    include: { settings: true },
  });
  if (!restaurant?.settings) {
    return {
      taxServiceCharge: false,
      taxDeliveryFee: false,
      allowPartialPayments: true,
      autoReleaseTableOnPayment: true,
      useCleaningStatus: false,
      serviceChargeValue: D(0),
      serviceChargeType: 'PERCENT',
    };
  }
  return restaurant.settings;
}

/**
 * Bill breakdown from order snapshots (never current menu prices).
 */
function computeBillBreakdown(order, settings) {
  const subtotal = D(order.subtotal);
  const discount = D(order.discountTotal || 0);
  const serviceCharge = D(order.serviceCharge || 0);
  const deliveryFee = D(order.deliveryFee || 0);

  const afterDiscount = money2(subtotal.minus(discount));
  if (afterDiscount.lt(0)) {
    throw new AppError('Discount cannot exceed subtotal', 400);
  }

  let taxableBase = afterDiscount;
  let nonTaxable = D(0);

  if (settings.taxServiceCharge) {
    taxableBase = taxableBase.plus(serviceCharge);
  } else {
    nonTaxable = nonTaxable.plus(serviceCharge);
  }

  if (settings.taxDeliveryFee) {
    taxableBase = taxableBase.plus(deliveryFee);
  } else {
    nonTaxable = nonTaxable.plus(deliveryFee);
  }

  taxableBase = money2(taxableBase);
  nonTaxable = money2(nonTaxable);
  const preTaxTotal = money2(taxableBase.plus(nonTaxable));

  return {
    subtotal,
    discount,
    taxableBase,
    nonTaxable,
    serviceCharge,
    deliveryFee,
    preTaxTotal,
  };
}

function sumSuccessfulPayments(payments) {
  return (payments || [])
    .filter((p) => ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status))
    .reduce(
      (acc, p) => ({
        preTax: acc.preTax.plus(p.preTaxAmount || 0),
        tax: acc.tax.plus(p.taxAmount || 0),
        gross: acc.gross.plus(p.amount || 0),
      }),
      { preTax: D(0), tax: D(0), gross: D(0) }
    );
}

function sumRefunds(payments, types = null) {
  let preTax = D(0);
  let tax = D(0);
  let gross = D(0);
  for (const p of payments || []) {
    for (const r of p.refunds || []) {
      if (types && !types.includes(r.type)) continue;
      preTax = preTax.plus(r.preTaxAmount || 0);
      tax = tax.plus(r.taxAmount || 0);
      gross = gross.plus(r.amount || 0);
    }
  }
  return { preTax, tax, gross };
}

/**
 * Outstanding pre-tax = bill pre-tax - paid pre-tax + refunded pre-tax (sales returns restore? no - refunds free up refundable on payment but outstanding for order settlement)
 *
 * Spec: remaining pre-tax = original pre-tax - successfully paid pre-tax portions.
 * Refunds of type PAYMENT_CORRECTION should restore outstanding.
 * SALES_RETURN / VOID reduce sales but also restore ability to... actually after refund the order may still be PAID if they paid then refunded partially.
 *
 * Outstanding for new payments:
 * paidNetPreTax = paidPreTax - refundedPreTax (all refund types return money, so restore outstanding)
 */
function getOutstandingPreTax(bill, payments) {
  const paid = sumSuccessfulPayments(payments);
  const refunded = sumRefunds(payments);
  const netPaid = money2(paid.preTax.minus(refunded.preTax));
  const outstanding = money2(bill.preTaxTotal.minus(netPaid));
  return outstanding.lt(0) ? D(0) : outstanding;
}

function allocateTaxableShare(portionPreTax, bill, remainingTaxable, remainingNonTaxable) {
  // Prefer consuming taxable base first, then non-taxable
  let taxableShare = D(0);
  let nonTaxableShare = D(0);
  let left = D(portionPreTax);

  if (remainingTaxable.gt(0) && left.gt(0)) {
    taxableShare = left.lte(remainingTaxable) ? left : remainingTaxable;
    left = left.minus(taxableShare);
  }
  if (remainingNonTaxable.gt(0) && left.gt(0)) {
    nonTaxableShare = left.lte(remainingNonTaxable) ? left : remainingNonTaxable;
    left = left.minus(nonTaxableShare);
  }

  return {
    taxableShare: money2(taxableShare),
    nonTaxableShare: money2(nonTaxableShare),
    leftover: money2(left),
  };
}

/**
 * Calculate tax for a payment portion.
 * Tax applies only to the taxable share of the portion.
 */
function calculatePortionTax(taxableShare, taxRatePercent, isLastPortion, expectedTotalTax, taxAllocatedSoFar) {
  const rate = D(taxRatePercent).div(100);
  let tax = roundPkr(taxableShare.times(rate));

  if (isLastPortion && expectedTotalTax !== null) {
    // Absorb rounding remainder into final portion
    const remainder = expectedTotalTax.minus(taxAllocatedSoFar);
    if (remainder.gte(0)) {
      tax = remainder;
    }
  }

  return tax;
}

async function buildOrderQuote(orderId, proposedPortions = null) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payments: {
        where: { status: 'COMPLETED' },
        include: { refunds: true, method: true },
      },
      discounts: true,
    },
  });
  if (!order) throw new AppError('Order not found', 404);

  const settings = await getSettings();
  const bill = computeBillBreakdown(order, settings);
  const outstandingPreTax = getOutstandingPreTax(bill, order.payments);
  const methods = await prisma.paymentMethod.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
  });

  const cashMethod = methods.find((m) => m.isCash) || methods.find((m) => m.code === 'CASH');
  const nonCashMethod = methods.find((m) => !m.isCash) || methods[0];

  const allCashTax = roundPkr(bill.taxableBase.times(D(cashMethod?.taxRate || 0).div(100)));
  const allNonCashTax = roundPkr(bill.taxableBase.times(D(nonCashMethod?.taxRate || 0).div(100)));

  let portionPreview = null;
  if (proposedPortions?.length) {
    portionPreview = previewPortions(bill, outstandingPreTax, proposedPortions, methods);
  }

  return serializeDecimals({
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    discountLocked: order.discountLocked,
    subtotal: bill.subtotal,
    discount: bill.discount,
    taxableBase: bill.taxableBase,
    nonTaxable: bill.nonTaxable,
    serviceCharge: bill.serviceCharge,
    deliveryFee: bill.deliveryFee,
    preTaxTotal: bill.preTaxTotal,
    outstandingPreTax,
    allCash: {
      taxRate: cashMethod?.taxRate || 0,
      tax: allCashTax,
      finalAmount: money2(bill.preTaxTotal.plus(allCashTax)),
    },
    allNonCash: {
      taxRate: nonCashMethod?.taxRate || 0,
      tax: allNonCashTax,
      finalAmount: money2(bill.preTaxTotal.plus(allNonCashTax)),
    },
    paymentMethods: methods,
    portionPreview,
  });
}

function previewPortions(bill, outstandingPreTax, portions, methods) {
  const methodMap = Object.fromEntries(methods.map((m) => [m.id, m]));
  let remTaxable = D(bill.taxableBase);
  // Approximate remaining taxable based on outstanding ratio
  const paidPreTaxRatio = bill.preTaxTotal.eq(0)
    ? D(0)
    : D(1).minus(outstandingPreTax.div(bill.preTaxTotal));
  // Simpler: track from full bill for quote only when outstanding == full
  remTaxable = money2(
    bill.taxableBase.times(outstandingPreTax.div(bill.preTaxTotal.eq(0) ? 1 : bill.preTaxTotal))
  );
  let remNonTaxable = money2(
    bill.nonTaxable.times(outstandingPreTax.div(bill.preTaxTotal.eq(0) ? 1 : bill.preTaxTotal))
  );

  const results = [];
  let taxSoFar = D(0);
  const totalPortion = portions.reduce((a, p) => a.plus(p.preTaxAmount || 0), D(0));

  portions.forEach((p, index) => {
    const method = methodMap[p.methodId];
    if (!method) throw new AppError('Invalid payment method', 400);
    const preTax = money2(p.preTaxAmount);
    const { taxableShare, nonTaxableShare } = allocateTaxableShare(
      preTax,
      bill,
      remTaxable,
      remNonTaxable
    );
    remTaxable = remTaxable.minus(taxableShare);
    remNonTaxable = remNonTaxable.minus(nonTaxableShare);

    const isLast = index === portions.length - 1;
    // For preview, don't force remainder unless single full payment
    const tax = roundPkr(taxableShare.times(D(method.taxRate).div(100)));
    taxSoFar = taxSoFar.plus(tax);
    results.push({
      methodId: method.id,
      methodCode: method.code,
      methodName: method.name,
      taxRate: method.taxRate,
      preTaxAmount: preTax,
      taxableShare,
      nonTaxableShare,
      taxAmount: tax,
      grossAmount: money2(preTax.plus(tax)),
      isLast,
    });
  });

  void totalPortion;
  return results;
}

/**
 * Allocate payment portions against remaining taxable/non-taxable for actual settlement.
 */
function buildPaymentAllocations(bill, outstandingPreTax, portions, methods) {
  const methodMap = Object.fromEntries(methods.map((m) => [m.id, m]));
  const ratio = bill.preTaxTotal.eq(0) ? D(0) : outstandingPreTax.div(bill.preTaxTotal);
  let remTaxable = money2(bill.taxableBase.times(ratio));
  let remNonTaxable = money2(bill.nonTaxable.times(ratio));

  const totalRequested = portions.reduce((a, p) => a.plus(p.preTaxAmount || 0), D(0));
  if (totalRequested.lte(0)) throw new AppError('Payment amount must be greater than zero', 400);
  if (totalRequested.gt(outstandingPreTax)) {
    throw new AppError('Payment exceeds outstanding pre-tax balance', 400);
  }

  // Compute exact expected tax for full remaining taxable if paying in full with mixed methods
  // Round each portion; last portion absorbs remainder of sum of rounded taxes vs ideal?
  // Spec: allocate rounding remainder to final payment portion.
  const drafts = [];
  portions.forEach((p, index) => {
    const method = methodMap[p.methodId];
    if (!method || !method.isActive) {
      throw new AppError('Payment method is inactive or invalid', 400);
    }
    const preTax = money2(p.preTaxAmount);
    if (preTax.lte(0)) throw new AppError('Payment portion must be greater than zero', 400);

    const alloc = allocateTaxableShare(preTax, bill, remTaxable, remNonTaxable);
    if (alloc.leftover.gt(0)) {
      throw new AppError('Unable to allocate payment portion against bill components', 400);
    }
    remTaxable = remTaxable.minus(alloc.taxableShare);
    remNonTaxable = remNonTaxable.minus(alloc.nonTaxableShare);

    drafts.push({
      method,
      preTax,
      taxableShare: alloc.taxableShare,
      nonTaxableShare: alloc.nonTaxableShare,
      rawTax: alloc.taxableShare.times(D(method.taxRate).div(100)),
      amountTendered: p.amountTendered,
      reference: p.reference,
      notes: p.notes,
      isLast: index === portions.length - 1,
    });
  });

  const idealTotalTax = roundPkr(drafts.reduce((a, d) => a.plus(d.rawTax), D(0)));
  let taxAllocated = D(0);
  return drafts.map((d, index) => {
    let taxAmount;
    if (index === drafts.length - 1) {
      taxAmount = money2(idealTotalTax.minus(taxAllocated));
      if (taxAmount.lt(0)) taxAmount = D(0);
    } else {
      taxAmount = roundPkr(d.rawTax);
      taxAllocated = taxAllocated.plus(taxAmount);
    }
    const gross = money2(d.preTax.plus(taxAmount));
    let changeReturned = D(0);
    let amountTendered = null;
    if (d.method.isCash) {
      amountTendered = d.amountTendered != null ? money2(d.amountTendered) : gross;
      if (amountTendered.lt(gross)) {
        throw new AppError('Cash tendered is less than amount due', 400);
      }
      changeReturned = money2(amountTendered.minus(gross));
    }

    return {
      methodId: d.method.id,
      method: d.method,
      preTaxAmount: d.preTax,
      taxRateSnapshot: D(d.method.taxRate),
      taxAmount,
      amount: gross,
      amountTendered,
      changeReturned,
      reference: d.reference || null,
      notes: d.notes || null,
    };
  });
}

module.exports = {
  getSettings,
  computeBillBreakdown,
  getOutstandingPreTax,
  sumSuccessfulPayments,
  sumRefunds,
  buildOrderQuote,
  buildPaymentAllocations,
  roundPkr,
  D,
  money2,
};
