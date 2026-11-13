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

async function saveDefaultAddress(req, res, next) {
  try {
    const address = await customersService.saveDefaultDeliveryAddress({
      customerId: req.params.id,
      line1: req.body.line1,
      city: req.body.city,
    });
    return success(res, 'Delivery address saved', address);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  search,
  saveDefaultAddress,
};
