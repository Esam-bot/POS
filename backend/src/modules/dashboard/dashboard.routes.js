const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { success } = require('../../utils/apiResponse');

const router = express.Router();

router.get('/overview', authenticate, authorize('reports.view'), (req, res) => {
  return success(res, 'Dashboard overview placeholder', {
    revenue: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    activeTables: 0,
    pendingKitchenOrders: 0,
    completedOrders: 0,
    topSellingItems: [],
    salesTrend: [],
    paymentBreakdown: [],
    lowStockIngredients: [],
    recentTransactions: [],
    note: 'Live aggregates will be implemented in Phase 9',
  });
});

module.exports = router;
