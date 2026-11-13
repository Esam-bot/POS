const dashboardService = require('./dashboard.service');
const { success } = require('../../utils/apiResponse');

async function overview(req, res, next) {
  try {
    const data = await dashboardService.getOverview();
    return success(res, 'Dashboard overview', data);
  } catch (err) {
    next(err);
  }
}

module.exports = { overview };
