const express = require('express');
const controller = require('./tables.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const schemas = require('./tables.schemas');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('tables.view'), controller.list);
router.get('/:id', authorize('tables.view'), controller.getOne);
router.post('/', authorize('tables.manage'), validate(schemas.createTable), controller.create);
router.patch('/:id', authorize('tables.manage'), validate(schemas.updateTable), controller.update);
router.patch(
  '/:id/status',
  authorize('tables.manage'),
  validate(schemas.statusBody),
  controller.setStatus
);
router.delete('/:id', authorize('tables.manage'), controller.remove);

module.exports = router;
