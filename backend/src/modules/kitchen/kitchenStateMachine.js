const AppError = require('../../utils/AppError');

/** Kitchen ticket workflow (separate from order payment status). COMPLETED = Served. */
const TICKET_TRANSITIONS = {
  NEW: ['PREPARING', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const ITEM_TRANSITIONS = {
  NEW: ['PREPARING', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const ACTIVE = new Set(['NEW', 'ACCEPTED', 'PREPARING', 'READY']);

function assertTicketTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) {
    throw new AppError('Ticket is already in this status', 409);
  }
  const allowed = TICKET_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new AppError(`Invalid kitchen ticket transition: ${fromStatus} → ${toStatus}`, 409);
  }
  return true;
}

function assertItemTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) {
    throw new AppError('Item is already in this status', 409);
  }
  const allowed = ITEM_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new AppError(`Invalid kitchen item transition: ${fromStatus} → ${toStatus}`, 409);
  }
  return true;
}

function isActiveStatus(status) {
  return ACTIVE.has(status);
}

module.exports = {
  TICKET_TRANSITIONS,
  ITEM_TRANSITIONS,
  assertTicketTransition,
  assertItemTransition,
  isActiveStatus,
};
