const settingsService = require('./settings.service');
const { success } = require('../../utils/apiResponse');

async function getPublicBranding(req, res, next) {
  try {
    const data = await settingsService.getPublicBranding();
    return success(res, 'Restaurant branding', data);
  } catch (err) {
    next(err);
  }
}

async function getSettings(req, res, next) {
  try {
    const data = await settingsService.getRestaurantSettings();
    return success(res, 'Settings retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const data = await settingsService.updateSettings(req.body, req.user.id);
    return success(res, 'Settings updated', data);
  } catch (err) {
    next(err);
  }
}

async function listMethods(req, res, next) {
  try {
    const data = await settingsService.listPaymentMethods();
    return success(res, 'Payment methods retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function updateMethod(req, res, next) {
  try {
    const data = await settingsService.updatePaymentMethod(
      req.params.id,
      req.body,
      req.user.id
    );
    return success(res, 'Payment method updated', data);
  } catch (err) {
    next(err);
  }
}

async function createMethod(req, res, next) {
  try {
    const data = await settingsService.createPaymentMethod(req.body, req.user.id);
    return success(res, 'Payment method created', data, 201);
  } catch (err) {
    next(err);
  }
}

async function deleteMethod(req, res, next) {
  try {
    const data = await settingsService.softDeletePaymentMethod(req.params.id, req.user.id);
    return success(res, 'Payment method deleted', data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPublicBranding,
  getSettings,
  updateSettings,
  listMethods,
  updateMethod,
  createMethod,
  deleteMethod,
};
