const { emitEvent } = require('./emit');

/** Emit session/table/order events after a successful auto-release commit. */
function emitAutoReleaseEvents(req, autoRelease) {
  if (!autoRelease || !autoRelease.released) return;
  if (autoRelease.session) {
    emitEvent(req, 'session.closed', autoRelease.session);
  }
  (autoRelease.tables || []).forEach((table) => {
    emitEvent(req, 'table.status.updated', table);
  });
  (autoRelease.completedOrders || []).forEach((order) => {
    emitEvent(req, 'order.status.updated', order);
  });
}

module.exports = { emitAutoReleaseEvents };
