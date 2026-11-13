const sessionsService = require('./sessions.service');
const { success } = require('../../utils/apiResponse');
const { emitEvent } = require('../../sockets/emit');

async function list(req, res, next) {
  try {
    const data = await sessionsService.listSessions(req.query);
    return success(res, 'Sessions retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const data = await sessionsService.getSession(req.params.id);
    return success(res, 'Session retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function open(req, res, next) {
  try {
    const data = await sessionsService.openSession(req.body, req.user.id);
    emitEvent(req, 'session.opened', data);
    (data.tables || []).forEach((table) => emitEvent(req, 'table.status.updated', table));
    return success(res, 'Session opened', data, 201);
  } catch (err) {
    next(err);
  }
}

async function close(req, res, next) {
  try {
    const data = await sessionsService.closeSession(req.params.id, { userId: req.user.id });
    emitEvent(req, 'session.closed', data.session);
    (data.tables || []).forEach((table) => emitEvent(req, 'table.status.updated', table));
    return success(res, 'Guests left — table set to cleaning', data);
  } catch (err) {
    next(err);
  }
}

async function addTables(req, res, next) {
  try {
    const data = await sessionsService.addTables(req.params.id, req.body.tableIds);
    emitEvent(req, 'session.updated', data);
    (data.tables || []).forEach((table) => emitEvent(req, 'table.status.updated', table));
    return success(res, 'Tables added to session', data);
  } catch (err) {
    next(err);
  }
}

async function transfer(req, res, next) {
  try {
    const data = await sessionsService.transferSession(req.params.id, req.body);
    emitEvent(req, 'session.updated', data);
    return success(res, 'Session transferred', data);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, open, close, addTables, transfer };
