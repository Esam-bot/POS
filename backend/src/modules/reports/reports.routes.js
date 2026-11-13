const express = require('express');
const controller = require('./reports.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorizeAny } = require('../../middleware/auth');
const { financialQuery } = require('../expenses/expenses.schemas');

const router = express.Router();

router.use(authenticate);
router.get(
  '/financial',
  authorizeAny('reports.financial', 'reports.view'),
  validate(financialQuery, 'query'),
  controller.financial
);

module.exports = router;
