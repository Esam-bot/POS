const customersService = require('./customers.service');
const { success } = require('../../utils/apiResponse');

async function search(req, res, next) {
  try {
    const items = await customersService.searchCustomers(req.query.q, {
      limit: req.query.limit,
    });
    return success(res, 'Customers retrieved', { items });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  search,
};
