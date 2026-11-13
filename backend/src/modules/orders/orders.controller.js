const ordersService = require('./orders.service');
const { success } = require('../../utils/apiResponse');
const { emitEvent, emitKitchenTickets } = require('../../sockets/emit');

function stripInternal(data) {
  if (!data || typeof data !== 'object') return data;
  const copy = { ...data };
  delete copy._kitchenTickets;
  delete copy._cancelledKitchenTickets;
  delete copy._printJobs;
  return copy;
}

function emitKitchenSideEffects(req, data) {
  if (data?._kitchenTickets?.length) {
    emitKitchenTickets(req, 'kitchen.tickets.created', data._kitchenTickets);
    emitKitchenTickets(req, 'kitchen.ticket.updated', data._kitchenTickets);
  }
  if (data?._cancelledKitchenTickets?.length) {
    emitKitchenTickets(req, 'kitchen.ticket.cancelled', data._cancelledKitchenTickets);
  }
}

async function list(req, res, next) {
  try {
    const data = await ordersService.listOrders(req.query);
    return success(res, 'Orders retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const data = await ordersService.getOrder(req.params.id);
    return success(res, 'Order retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = await ordersService.createOrder(req.body, req.user.id);
    emitEvent(req, 'order.created', data);
    return success(res, 'Order created successfully', data, 201);
  } catch (err) {
    next(err);
  }
}

async function addItems(req, res, next) {
  try {
    const data = await ordersService.addItems(req.params.id, req.body.items, req.user.id);
    emitEvent(req, 'order.updated', data);
    return success(res, 'Items added to order', data);
  } catch (err) {
    next(err);
  }
}

function allowNegativeFromReq(req) {
  return (
    Boolean(req.body?.allowNegativeStock) &&
    (req.user.roles?.includes('ADMIN') ||
      req.user.permissions?.includes('inventory.allow_negative'))
  );
}

async function submit(req, res, next) {
  try {
    const data = await ordersService.submitOrder(req.params.id, req.user.id, {
      allowNegativeStock: allowNegativeFromReq(req),
    });
    emitKitchenSideEffects(req, data);
    const clean = stripInternal(data);
    emitEvent(req, 'order.status.updated', clean);
    return success(res, 'Order submitted — preparation started', clean);
  } catch (err) {
    next(err);
  }
}

async function transition(req, res, next) {
  try {
    const data = await ordersService.transitionOrder(
      req.params.id,
      req.body.status,
      req.user.id,
      req.body.reason,
      { allowNegativeStock: allowNegativeFromReq(req) }
    );
    emitKitchenSideEffects(req, data);
    const clean = stripInternal(data);
    emitEvent(req, 'order.status.updated', clean);
    return success(res, 'Order status updated', clean);
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const data = await ordersService.cancelOrder(req.params.id, req.user.id, req.body.reason);
    emitKitchenSideEffects(req, data);
    const clean = stripInternal(data);
    emitEvent(req, 'order.status.updated', clean);
    return success(res, 'Order cancelled', clean);
  } catch (err) {
    next(err);
  }
}

async function split(req, res, next) {
  try {
    const data = await ordersService.splitOrder(req.params.id, req.body.items, req.user.id);
    emitEvent(req, 'order.updated', data.source);
    emitEvent(req, 'order.created', data.splitOrder);
    return success(res, 'Order split successfully', data);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, addItems, submit, transition, cancel, split };
