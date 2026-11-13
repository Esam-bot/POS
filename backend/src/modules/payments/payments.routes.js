const express = require('express');
const controller = require('./payments.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, authorizeAny } = require('../../middleware/auth');
const schemas = require('./payments.schemas');

const router = express.Router();

// Note: do NOT router.use(authenticate) here — this router is mounted at /api and
// would otherwise block unauthenticated routes registered later (e.g. /settings/public).

router.get('/payments/:id', authenticate, authorize('payments.view'), controller.getPayment);
router.post(
  '/payments/:id/refunds',
  authenticate,
  authorize('payments.refund'),
  validate(schemas.refundBody),
  controller.createRefund
);
router.get(
  '/payments/:id/refunds',
  authenticate,
  authorize('payments.view'),
  controller.listPaymentRefunds
);
router.get(
  '/refunds',
  authenticate,
  authorizeAny('payments.view', 'reports.financial', 'reports.view'),
  controller.listRefunds
);

router.post(
  '/orders/:id/payment-quote',
  authenticate,
  authorizeAny('payments.create', 'payments.view', 'billing.view'),
  validate(schemas.quoteBody),
  controller.quote
);
router.post(
  '/orders/:id/payments',
  authenticate,
  authorize('payments.create'),
  validate(schemas.createPayments),
  controller.createPayments
);
router.get(
  '/orders/:id/payments',
  authenticate,
  authorize('payments.view'),
  controller.listOrderPayments
);
router.post(
  '/orders/:id/discount',
  authenticate,
  authorizeAny('billing.discount', 'orders.update'),
  validate(schemas.discountBody),
  controller.applyDiscount
);
router.post(
  '/orders/:id/settle',
  authenticate,
  authorizeAny('billing.complimentary', 'billing.write_off'),
  validate(schemas.settlementBody),
  controller.settle
);
router.post(
  '/orders/:id/receipt',
  authenticate,
  authorizeAny('payments.view', 'orders.view'),
  controller.createReceipt
);
router.get(
  '/orders/:id/receipt',
  authenticate,
  authorizeAny('payments.view', 'orders.view'),
  controller.getReceipt
);

module.exports = router;
