const sessionsService = require('./sessions.service');
const { success } = require('../../utils/apiResponse');
const { emitEvent } = require('../../sockets/emit');

async function list(req, res, next) {
  try {
    const data = await sessionsService.listSessions(req.query);
    return success(res, 'Table sessions retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const data = await sessionsService.getSession(req.params.id);
    return success(res, 'Table session retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function open(req, res, next) {
  try {
    const data = await sessionsService.openSession(req.body, req.user.id);
    emitEvent(req, 'session.opened', data);
    data.tables.forEach((t) => emitEvent(req, 'table.status.updated', t));
    return success(res, 'Table session opened', data, 201);
  } catch (err) {
    next(err);
  }
}

async function addTables(req, res, next) {
  try {
    const data = await sessionsService.addTables(req.params.id, req.body.tableIds, req.user.id);
    emitEvent(req, 'session.updated', data);
    return success(res, 'Tables added to session', data);
  } catch (err) {
    next(err);
  }
}

async function removeTables(req, res, next) {
  try {
    const data = await sessionsService.removeTables(req.params.id, req.body.tableIds);
    emitEvent(req, 'session.updated', data);
    return success(res, 'Tables removed from session', data);
  } catch (err) {
    next(err);
  }
}

async function transfer(req, res, next) {
  try {
    const data = await sessionsService.transferSession(
      req.params.id,
      req.body.fromTableId,
      req.body.toTableId
    );
    emitEvent(req, 'session.updated', data);
    return success(res, 'Session transferred', data);
  } catch (err) {
    next(err);
  }
}

async function close(req, res, next) {
  try {
    const data = await sessionsService.closeSession(req.params.id);
    emitEvent(req, 'session.closed', data);
    return success(res, 'Session closed', data);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, open, addTables, removeTables, transfer, close };
