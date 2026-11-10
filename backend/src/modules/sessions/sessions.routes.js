const express = require('express');
const controller = require('./sessions.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, authorizeAny } = require('../../middleware/auth');
const schemas = require('./sessions.schemas');

const router = express.Router();

router.use(authenticate);

const manage = authorizeAny('sessions.manage', 'tables.manage', 'orders.create');

router.get('/', authorizeAny('sessions.manage', 'tables.view', 'orders.view'), controller.list);
router.get('/:id', authorizeAny('sessions.manage', 'tables.view', 'orders.view'), controller.getOne);
router.post('/', manage, validate(schemas.openSession), controller.open);
router.post('/:id/add-tables', manage, validate(schemas.tablesBody), controller.addTables);
router.post('/:id/remove-tables', manage, validate(schemas.tablesBody), controller.removeTables);
router.post('/:id/transfer', manage, validate(schemas.transferBody), controller.transfer);
router.post('/:id/close', manage, controller.close);

module.exports = router;
