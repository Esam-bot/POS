const kitchenService = require('./kitchen.service');
const { success } = require('../../utils/apiResponse');
const { emitEvent, emitKitchenTicket } = require('../../sockets/emit');

function emitOrderReady(req, orderReady) {
  if (!orderReady) return;
  emitEvent(req, 'order.status.updated', orderReady);
  emitEvent(req, 'order.ready', {
    orderId: orderReady.id,
    orderNumber: orderReady.orderNumber,
    type: orderReady.type,
    customerName: orderReady.customerName,
    table: orderReady.diningTable?.number || null,
    tableSection: orderReady.diningTable?.section || null,
    readyAt: orderReady.readyNotifiedAt,
    message: orderReady.diningTable?.number
      ? `Order ${orderReady.orderNumber} for Table ${orderReady.diningTable.number} is ready to serve!`
      : `Order ${orderReady.orderNumber} (${orderReady.type}) is ready!`,
  });
  emitEvent(req, 'kitchen.order.ready', {
    orderId: orderReady.id,
    orderNumber: orderReady.orderNumber,
  });
}

async function board(req, res, next) {
  try {
    const data = await kitchenService.listBoard(req.query);
    return success(res, 'Kitchen board', data);
  } catch (err) {
    next(err);
  }
}

async function delayed(req, res, next) {
  try {
    const data = await kitchenService.listDelayed(req.query);
    return success(res, 'Delayed kitchen tickets', data);
  } catch (err) {
    next(err);
  }
}

async function history(req, res, next) {
  try {
    const data = await kitchenService.listHistory(req.query);
    return success(res, 'Kitchen history', data);
  } catch (err) {
    next(err);
  }
}

async function stations(req, res, next) {
  try {
    const data = await kitchenService.listStations();
    return success(res, 'Kitchen stations', data);
  } catch (err) {
    next(err);
  }
}

async function workload(req, res, next) {
  try {
    const data = await kitchenService.getWorkload();
    return success(res, 'Kitchen workload', data);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const data = await kitchenService.getTicket(req.params.id);
    return success(res, 'Kitchen ticket', data);
  } catch (err) {
    next(err);
  }
}

async function updateTicket(req, res, next) {
  try {
    const { ticket, orderReady } = await kitchenService.updateTicketStatus(
      req.params.id,
      req.body.status,
      { userId: req.user.id }
    );
    emitKitchenTicket(req, 'kitchen.ticket.updated', ticket);
    if (req.body.status === 'PREPARING') {
      emitKitchenTicket(req, 'kitchen.prep.started', ticket);
    }
    if (req.body.status === 'READY') {
      emitKitchenTicket(req, 'kitchen.ticket.ready', ticket);
    }
    emitOrderReady(req, orderReady);
    return success(res, 'Kitchen ticket updated', { ticket, orderReady });
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const { item, ticket, orderReady } = await kitchenService.updateItemStatus(
      req.params.itemId,
      req.body.status,
      { userId: req.user.id }
    );
    emitKitchenTicket(req, 'kitchen.ticket.updated', ticket);
    if (req.body.status === 'PREPARING') {
      emitKitchenTicket(req, 'kitchen.item.prep.started', { item, ticket });
    }
    if (req.body.status === 'READY') {
      emitKitchenTicket(req, 'kitchen.item.ready', { item, ticket });
    }
    if (req.body.status === 'CANCELLED') {
      emitKitchenTicket(req, 'kitchen.item.cancelled', { item, ticket });
    }
    emitOrderReady(req, orderReady);
    return success(res, 'Kitchen item updated', { item, ticket, orderReady });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  board,
  delayed,
  history,
  stations,
  workload,
  getOne,
  updateTicket,
  updateItem,
};
