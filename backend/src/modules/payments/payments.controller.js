const paymentsService = require('./payments.service');
const refundsService = require('./refunds.service');
const billing = require('../billing/billing.service');
const AppError = require('../../utils/AppError');
const { success } = require('../../utils/apiResponse');
const { emitEvent } = require('../../sockets/emit');
const { emitAutoReleaseEvents } = require('../../sockets/emitAutoRelease');

async function quote(req, res, next) {
  try {
    const data = await billing.buildOrderQuote(req.params.id, req.body?.portions);
    return success(res, 'Payment quote', data);
  } catch (err) {
    next(err);
  }
}

async function createPayments(req, res, next) {
  try {
    const key = req.headers['idempotency-key'] || req.body.idempotencyKey;
    const allowNegativeStock =
      Boolean(req.body?.allowNegativeStock) &&
      (req.user.roles.includes('ADMIN') ||
        req.user.permissions.includes('inventory.allow_negative'));
    const data = await paymentsService.createPayments(
      req.params.id,
      req.body,
      req.user.id,
      key,
      { allowNegativeStock }
    );
    emitEvent(req, 'payment.created', { orderId: req.params.id, ...data });
    if (data.initiatePrint && data.printJobs?.length) {
      emitEvent(req, 'print.jobs.ready', {
        orderId: req.params.id,
        jobs: data.printJobs,
      });
    }
    emitAutoReleaseEvents(req, data.autoRelease);
    return success(
      res,
      data.replayed ? 'Payment already recorded' : 'Payment recorded',
      data,
      data.replayed ? 200 : 201
    );
  } catch (err) {
    next(err);
  }
}

async function listOrderPayments(req, res, next) {
  try {
    const data = await paymentsService.listOrderPayments(req.params.id);
    return success(res, 'Payments retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function getPayment(req, res, next) {
  try {
    const data = await paymentsService.getPayment(req.params.id);
    return success(res, 'Payment retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function createRefund(req, res, next) {
  try {
    const key = req.headers['idempotency-key'] || req.body.idempotencyKey;
    const isAdmin = req.user.roles.includes('ADMIN');
    const canApprove =
      isAdmin || req.user.permissions.includes('payments.approve_refund');

    if (
      ['SALES_RETURN', 'VOID_AFTER_PAYMENT'].includes(req.body.type) &&
      !canApprove
    ) {
      throw new AppError('Refund approval permission required for this refund type', 403);
    }

    const data = await refundsService.createRefund(
      req.params.id,
      { ...req.body, idempotencyKey: key },
      req.user.id,
      canApprove
    );
    emitEvent(req, 'payment.refunded', data);
    emitAutoReleaseEvents(req, data.autoRelease);
    return success(
      res,
      data.replayed ? 'Refund already recorded' : 'Refund recorded',
      data,
      data.replayed ? 200 : 201
    );
  } catch (err) {
    next(err);
  }
}

async function listPaymentRefunds(req, res, next) {
  try {
    const data = await refundsService.listPaymentRefunds(req.params.id);
    return success(res, 'Refunds retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function listRefunds(req, res, next) {
  try {
    const data = await refundsService.listRefunds(req.query);
    return success(res, 'Refunds retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function applyDiscount(req, res, next) {
  try {
    const data = await paymentsService.applyDiscount(req.params.id, req.body, req.user.id);
    emitEvent(req, 'order.updated', data);
    return success(res, 'Discount applied', data);
  } catch (err) {
    next(err);
  }
}

async function settle(req, res, next) {
  try {
    const isAdmin = req.user.roles.includes('ADMIN');
    if (req.body.status === 'COMPLIMENTARY') {
      if (!isAdmin && !req.user.permissions.includes('billing.complimentary')) {
        throw new AppError('Complimentary settlement permission required', 403);
      }
    }
    if (req.body.status === 'WRITTEN_OFF') {
      if (!isAdmin && !req.user.permissions.includes('billing.write_off')) {
        throw new AppError('Write-off permission required', 403);
      }
    }

    const data = await paymentsService.settleWithoutPayment(
      req.params.id,
      req.body.status,
      req.body.reason,
      req.user.id
    );
    emitEvent(req, 'order.settled', data);
    emitAutoReleaseEvents(req, data.autoRelease);
    return success(res, `Order marked ${req.body.status}`, data);
  } catch (err) {
    next(err);
  }
}

async function createReceipt(req, res, next) {
  try {
    const data = await paymentsService.createReceipt(req.params.id, req.user.id);
    return success(res, 'Receipt ready', data);
  } catch (err) {
    next(err);
  }
}

async function getReceipt(req, res, next) {
  try {
    const data = await paymentsService.getReceipt(req.params.id);
    return success(res, 'Receipt retrieved', data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  quote,
  createPayments,
  listOrderPayments,
  getPayment,
  createRefund,
  listPaymentRefunds,
  listRefunds,
  applyDiscount,
  settle,
  createReceipt,
  getReceipt,
};
