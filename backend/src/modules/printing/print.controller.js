const printService = require('./print.service');
const { success } = require('../../utils/apiResponse');

async function listJobs(req, res, next) {
  try {
    const data = await printService.getPrintJobs(req.params.id);
    return success(res, 'Print jobs retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function getCustomerSlip(req, res, next) {
  try {
    const data = await printService.getPrintJob(req.params.id, 'CUSTOMER_ORDER_SLIP');
    return success(res, 'Customer order slip retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function getKitchenTicket(req, res, next) {
  try {
    const data = await printService.getPrintJob(req.params.id, 'KITCHEN_TICKET');
    return success(res, 'Kitchen ticket retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function markCustomerPrinted(req, res, next) {
  try {
    const data = await printService.markPrinted(req.params.id, 'CUSTOMER_ORDER_SLIP', {
      reprint: Boolean(req.body?.reprint),
      userId: req.user.id,
      failed: Boolean(req.body?.failed),
      error: req.body?.error || null,
    });
    return success(res, 'Customer slip print recorded', data);
  } catch (err) {
    next(err);
  }
}

async function markKitchenPrinted(req, res, next) {
  try {
    const data = await printService.markPrinted(req.params.id, 'KITCHEN_TICKET', {
      reprint: Boolean(req.body?.reprint),
      userId: req.user.id,
      failed: Boolean(req.body?.failed),
      error: req.body?.error || null,
    });
    return success(res, 'Kitchen ticket print recorded', data);
  } catch (err) {
    next(err);
  }
}

async function getCashierRecord(req, res, next) {
  try {
    const data = await printService.getPrintJob(req.params.id, 'CASHIER_RECORD');
    return success(res, 'Cashier record retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function markCashierPrinted(req, res, next) {
  try {
    const data = await printService.markPrinted(req.params.id, 'CASHIER_RECORD', {
      reprint: Boolean(req.body?.reprint),
      userId: req.user.id,
      failed: Boolean(req.body?.failed),
      error: req.body?.error || null,
    });
    return success(res, 'Cashier record print recorded', data);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const data = await printService.refreshSnapshots(req.params.id);
    return success(res, 'Print snapshots refreshed', data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listJobs,
  getCustomerSlip,
  getKitchenTicket,
  getCashierRecord,
  markCustomerPrinted,
  markKitchenPrinted,
  markCashierPrinted,
  refresh,
};
