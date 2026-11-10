const authService = require('./auth.service');
const { success } = require('../../utils/apiResponse');

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    return success(res, 'Login successful', result);
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id);
    return success(res, 'Current user', user);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.user?.id);
    return success(res, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = { login, me, logout };
