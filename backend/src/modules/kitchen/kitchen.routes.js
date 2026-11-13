const express = require('express');
const controller = require('./kitchen.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorizeAny } = require('../../middleware/auth');
const { z } = require('zod');

const router = express.Router();

const statusBody = z.object({
  status: z.enum(['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']),
});

router.use(authenticate);

router.get('/board', authorizeAny('kitchen.view', 'kitchen.manage', 'orders.view'), controller.board);
router.get(
  '/delayed',
  authorizeAny('kitchen.view', 'kitchen.manage', 'orders.view'),
  controller.delayed
);
router.get(
  '/history',
  authorizeAny('kitchen.view', 'kitchen.manage', 'orders.view'),
  controller.history
);
router.get(
  '/stations',
  authorizeAny('kitchen.view', 'kitchen.manage', 'menu.view'),
  controller.stations
);
router.get(
  '/workload',
  authorizeAny('kitchen.view', 'kitchen.manage', 'orders.view'),
  controller.workload
);
router.get(
  '/tickets/:id',
  authorizeAny('kitchen.view', 'kitchen.manage', 'orders.view'),
  controller.getOne
);
router.patch(
  '/tickets/:id/status',
  authorizeAny('kitchen.update', 'kitchen.manage'),
  validate(statusBody),
  controller.updateTicket
);
router.patch(
  '/items/:itemId/status',
  authorizeAny('kitchen.update', 'kitchen.manage'),
  validate(statusBody),
  controller.updateItem
);

module.exports = router;
