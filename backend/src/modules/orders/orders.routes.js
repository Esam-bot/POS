const express = require('express');
const controller = require('./orders.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, authorizeAny } = require('../../middleware/auth');
const schemas = require('./orders.schemas');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('orders.view'), controller.list);
router.get('/:id', authorize('orders.view'), controller.getOne);
router.post('/', authorize('orders.create'), validate(schemas.createOrder), controller.create);
router.post(
  '/:id/items',
  authorize('orders.update'),
  validate(schemas.addItems),
  controller.addItems
);
router.post('/:id/submit', authorize('orders.update'), controller.submit);
router.post(
  '/:id/transition',
  authorize('orders.update'),
  validate(schemas.transitionBody),
  controller.transition
);
router.post(
  '/:id/cancel',
  authorize('orders.cancel'),
  validate(schemas.cancelBody),
  controller.cancel
);
router.post(
  '/:id/split',
  authorizeAny('orders.split', 'orders.update'),
  validate(schemas.splitBody),
  controller.split
);

module.exports = router;
