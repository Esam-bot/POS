const express = require('express');
const controller = require('./settings.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, authorizeAny } = require('../../middleware/auth');
const { methodUpdate, settingsUpdate } = require('../payments/payments.schemas');

const router = express.Router();

router.use(authenticate);

router.get('/', authorizeAny('settings.manage', 'billing.view', 'payments.manage_methods'), controller.getSettings);
router.patch('/', authorize('settings.manage'), validate(settingsUpdate), controller.updateSettings);
router.get(
  '/payment-methods',
  authorizeAny('payments.view', 'payments.manage_methods', 'settings.manage'),
  controller.listMethods
);
router.patch(
  '/payment-methods/:id',
  authorizeAny('payments.manage_methods', 'settings.manage'),
  validate(methodUpdate),
  controller.updateMethod
);

module.exports = router;
