const AppError = require('../../utils/AppError');

const TERMINAL = new Set(['COMPLETED', 'CANCELLED']);

const BASE_TRANSITIONS = {
  DRAFT: ['PLACED', 'CANCELLED'],
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'COMPLETED', 'OUT_FOR_DELIVERY'],
  SERVED: ['COMPLETED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

function assertTransition(orderType, fromStatus, toStatus) {
  if (fromStatus === toStatus) {
    throw new AppError('Order is already in this status', 409);
  }
  if (TERMINAL.has(fromStatus)) {
    throw new AppError(`Cannot transition from terminal status ${fromStatus}`, 409);
  }

  const allowed = BASE_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new AppError(`Invalid status transition: ${fromStatus} → ${toStatus}`, 409);
  }

  if (toStatus === 'SERVED' && orderType !== 'DINE_IN') {
    throw new AppError('Only dine-in orders can be marked SERVED', 409);
  }
  if (toStatus === 'OUT_FOR_DELIVERY' && orderType !== 'DELIVERY') {
    throw new AppError('Only delivery orders can go OUT_FOR_DELIVERY', 409);
  }
  if (toStatus === 'DELIVERED' && orderType !== 'DELIVERY') {
    throw new AppError('Only delivery orders can be marked DELIVERED', 409);
  }
  if (fromStatus === 'READY' && toStatus === 'COMPLETED' && orderType !== 'TAKEAWAY') {
    throw new AppError('READY → COMPLETED is only allowed for takeaway orders', 409);
  }
  if (fromStatus === 'READY' && toStatus === 'SERVED' && orderType !== 'DINE_IN') {
    throw new AppError('READY → SERVED is only allowed for dine-in orders', 409);
  }
  if (fromStatus === 'READY' && toStatus === 'OUT_FOR_DELIVERY' && orderType !== 'DELIVERY') {
    throw new AppError('READY → OUT_FOR_DELIVERY is only allowed for delivery orders', 409);
  }

  return true;
}

function isTerminal(status) {
  return TERMINAL.has(status);
}

function canCancel(status) {
  return ['DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING'].includes(status);
}

module.exports = {
  assertTransition,
  isTerminal,
  canCancel,
  BASE_TRANSITIONS,
};
