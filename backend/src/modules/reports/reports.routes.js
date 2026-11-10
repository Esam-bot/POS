const express = require('express');
const controller = require('./reports.controller');
const { authenticate, authorizeAny } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get(
  '/financial',
  authorizeAny('reports.financial', 'reports.view'),
  controller.financial
);

module.exports = router;
