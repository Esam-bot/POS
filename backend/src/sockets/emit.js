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

function emitEvent(reqOrApp, event, payload) {
  const io = getIo(reqOrApp);
  if (!io) return;
  io.to('pos').emit(event, payload);
  io.to('kitchen').emit(event, payload);
  io.emit(event, payload);
}

module.exports = { emitEvent, getIo };
