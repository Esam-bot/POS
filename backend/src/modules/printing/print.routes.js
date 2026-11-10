const express = require('express');
const controller = require('./print.controller');
const { authenticate, authorize, authorizeAny } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const router = express.Router({ mergeParams: true });

const markBody = z.object({
  reprint: z.boolean().optional(),
  failed: z.boolean().optional(),
  error: z.string().max(500).optional().nullable(),
});

router.use(authenticate);

router.get(
  '/',
  authorizeAny('orders.view', 'pos.access', 'payments.view'),
  controller.listJobs
);
router.get(
  '/customer-slip',
  authorizeAny('orders.view', 'pos.access', 'payments.view'),
  controller.getCustomerSlip
);
router.get(
  '/kitchen-ticket',
  authorizeAny('orders.view', 'pos.access', 'kitchen.view'),
  controller.getKitchenTicket
);
router.post(
  '/customer-slip/printed',
  authorizeAny('orders.update', 'pos.access', 'payments.create'),
  validate(markBody),
  controller.markCustomerPrinted
);
router.post(
  '/kitchen-ticket/printed',
  authorizeAny('orders.update', 'pos.access', 'kitchen.update'),
  validate(markBody),
  controller.markKitchenPrinted
);
router.get(
  '/cashier-record',
  authorizeAny('orders.view', 'pos.access', 'payments.view'),
  controller.getCashierRecord
);
router.post(
  '/cashier-record/printed',
  authorizeAny('orders.update', 'pos.access', 'payments.create'),
  validate(markBody),
  controller.markCashierPrinted
);
router.post(
  '/refresh',
  authorize('orders.update'),
  controller.refresh
);

module.exports = router;
