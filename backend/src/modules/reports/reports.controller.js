const reportsService = require('./reports.service');
const { success } = require('../../utils/apiResponse');

async function financial(req, res, next) {
  try {
    const data = await reportsService.financialSummary(req.query);
    return success(res, 'Financial report', data);
  } catch (err) {
    next(err);
  }
}

module.exports = { financial };
