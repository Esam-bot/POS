const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const controller = require('./dashboard.controller');

const router = express.Router();

router.get('/overview', authenticate, authorize('reports.view'), controller.overview);

module.exports = router;
