const express = require('express');
const controller = require('./settings.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, authorizeAny } = require('../../middleware/auth');
const { methodUpdate, methodCreate, settingsUpdate } = require('../payments/payments.schemas');

const router = express.Router();

// Unauthenticated branding for login shell
router.get('/public', controller.getPublicBranding);

router.use(authenticate);

router.get('/', authorizeAny('settings.manage', 'billing.view', 'payments.manage_methods', 'reports.view', 'pos.access'), controller.getSettings);
router.patch('/', authorize('settings.manage'), validate(settingsUpdate), controller.updateSettings);
router.get(
  '/payment-methods',
  authorizeAny('payments.view', 'payments.manage_methods', 'settings.manage', 'expenses.manage'),
  controller.listMethods
);
router.post(
  '/payment-methods',
  authorizeAny('payments.manage_methods', 'settings.manage'),
  validate(methodCreate),
  controller.createMethod
);
router.patch(
  '/payment-methods/:id',
  authorizeAny('payments.manage_methods', 'settings.manage'),
  validate(methodUpdate),
  controller.updateMethod
);
router.delete(
  '/payment-methods/:id',
  authorizeAny('payments.manage_methods', 'settings.manage'),
  controller.deleteMethod
);

module.exports = router;
