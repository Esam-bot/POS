const tablesService = require('./tables.service');
const { success } = require('../../utils/apiResponse');
const { emitEvent } = require('../../sockets/emit');

async function list(req, res, next) {
  try {
    const data = await tablesService.listTables(req.query);
    return success(res, 'Tables retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const data = await tablesService.getTable(req.params.id);
    return success(res, 'Table retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = await tablesService.createTable(req.body);
    emitEvent(req, 'table.status.updated', data);
    return success(res, 'Table created', data, 201);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = await tablesService.updateTable(req.params.id, req.body);
    emitEvent(req, 'table.status.updated', data);
    return success(res, 'Table updated', data);
  } catch (err) {
    next(err);
  }
}

async function setStatus(req, res, next) {
  try {
    const data = await tablesService.setTableStatus(req.params.id, req.body.status, {
      userId: req.user.id,
    });
    emitEvent(req, 'table.status.updated', data);
    return success(res, 'Table status updated', data);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const data = await tablesService.softDeleteTable(req.params.id);
    emitEvent(req, 'table.status.updated', { id: req.params.id, deleted: true });
    return success(res, 'Table deleted', data);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, setStatus, remove };
