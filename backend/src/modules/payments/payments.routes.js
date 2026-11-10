const express = require('express');
const controller = require('./payments.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, authorizeAny } = require('../../middleware/auth');
const schemas = require('./payments.schemas');

const router = express.Router();

router.use(authenticate);

router.get('/payments/:id', authorize('payments.view'), controller.getPayment);
router.post(
  '/payments/:id/refunds',
  authorize('payments.refund'),
  validate(schemas.refundBody),
  controller.createRefund
);
router.get('/payments/:id/refunds', authorize('payments.view'), controller.listPaymentRefunds);
router.get('/refunds', authorizeAny('payments.view', 'reports.financial', 'reports.view'), controller.listRefunds);

router.post(
  '/orders/:id/payment-quote',
  authorizeAny('payments.create', 'payments.view', 'billing.view'),
  validate(schemas.quoteBody),
  controller.quote
);
router.post(
  '/orders/:id/payments',
  authorize('payments.create'),
  validate(schemas.createPayments),
  controller.createPayments
);
router.get('/orders/:id/payments', authorize('payments.view'), controller.listOrderPayments);
router.post(
  '/orders/:id/discount',
  authorizeAny('billing.discount', 'orders.update'),
  validate(schemas.discountBody),
  controller.applyDiscount
);
router.post(
  '/orders/:id/settle',
  authorizeAny('billing.complimentary', 'billing.write_off'),
  validate(schemas.settlementBody),
  controller.settle
);
router.post('/orders/:id/receipt', authorizeAny('payments.view', 'orders.view'), controller.createReceipt);
router.get('/orders/:id/receipt', authorizeAny('payments.view', 'orders.view'), controller.getReceipt);

module.exports = router;
