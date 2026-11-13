function stationRoom(stationId) {
  return stationId ? `kitchen:station:${stationId}` : 'kitchen:station:UNASSIGNED';
}

function getIo(reqOrApp) {
  if (!reqOrApp) return null;
  if (typeof reqOrApp.get === 'function') {
    return reqOrApp.get('io');
  }
  if (reqOrApp.app && typeof reqOrApp.app.get === 'function') {
    return reqOrApp.app.get('io');
  }
  return null;
}

/** Broadcast to POS + kitchen supervisor rooms (and legacy global). */
function emitEvent(reqOrApp, event, payload) {
  const io = getIo(reqOrApp);
  if (!io) return;
  io.to('pos').emit(event, payload);
  io.to('kitchen').emit(event, payload);
  io.emit(event, payload);
}

/**
 * Emit a kitchen-ticket event to the central kitchen room and the ticket's station room.
 */
function emitKitchenTicket(reqOrApp, event, ticket) {
  const io = getIo(reqOrApp);
  if (!io || !ticket) return;
  const payload = ticket;
  io.to('kitchen').emit(event, payload);
  io.to(stationRoom(ticket.stationId)).emit(event, payload);
  // POS screens still care about order readiness / cancellations
  if (
    event === 'kitchen.ticket.updated' ||
    event === 'kitchen.tickets.created' ||
    event === 'kitchen.order.ready'
  ) {
    io.to('pos').emit(event, payload);
  }
}

function emitKitchenTickets(reqOrApp, event, tickets = []) {
  for (const ticket of tickets) {
    emitKitchenTicket(reqOrApp, event, ticket);
  }
}

module.exports = { emitEvent, emitKitchenTicket, emitKitchenTickets, getIo };
