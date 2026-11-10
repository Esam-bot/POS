const express = require('express');
const controller = require('./customers.controller');
const { authenticate, authorizeAny } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get(
  '/search',
  authorizeAny('customers.view', 'customers.manage', 'pos.access', 'orders.create'),
  controller.search
);

module.exports = router;
