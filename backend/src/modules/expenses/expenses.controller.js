const expensesService = require('./expenses.service');
const recurringService = require('./recurring.service');
const { success } = require('../../utils/apiResponse');

async function listCategories(req, res, next) {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    return success(
      res,
      'Expense categories',
      await expensesService.listCategories({ includeInactive })
    );
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    return success(
      res,
      'Expense category created',
      await expensesService.createCategory(req.body),
      201
    );
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    return success(
      res,
      'Expense category updated',
      await expensesService.updateCategory(req.params.id, req.body)
    );
  } catch (err) {
    next(err);
  }
}

async function archiveCategory(req, res, next) {
  try {
    return success(
      res,
      'Expense category archived',
      await expensesService.archiveCategory(req.params.id)
    );
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    return success(res, 'Expenses retrieved', await expensesService.listExpenses(req.query));
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    return success(res, 'Expense retrieved', await expensesService.getExpense(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = await expensesService.createExpense(req.body, req.user.id);
    return success(res, 'Expense created', data, 201);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = await expensesService.updateExpense(req.params.id, req.body, req.user.id);
    return success(res, 'Expense updated', data);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    return success(res, 'Expense deleted', await expensesService.deleteExpense(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function listRecurring(req, res, next) {
  try {
    return success(
      res,
      'Recurring expenses retrieved',
      await recurringService.listRecurring(req.query)
    );
  } catch (err) {
    next(err);
  }
}

async function getRecurring(req, res, next) {
  try {
    return success(
      res,
      'Recurring expense retrieved',
      await recurringService.getRecurring(req.params.id)
    );
  } catch (err) {
    next(err);
  }
}

async function createRecurring(req, res, next) {
  try {
    const data = await recurringService.createRecurring(req.body, req.user.id);
    return success(res, 'Recurring expense created', data, 201);
  } catch (err) {
    next(err);
  }
}

async function updateRecurring(req, res, next) {
  try {
    const data = await recurringService.updateRecurring(req.params.id, req.body, req.user.id);
    return success(res, 'Recurring expense updated', data);
  } catch (err) {
    next(err);
  }
}

async function pauseRecurring(req, res, next) {
  try {
    return success(
      res,
      'Recurring expense paused',
      await recurringService.pauseRecurring(req.params.id, req.user.id)
    );
  } catch (err) {
    next(err);
  }
}

async function resumeRecurring(req, res, next) {
  try {
    return success(
      res,
      'Recurring expense resumed',
      await recurringService.resumeRecurring(req.params.id, req.user.id)
    );
  } catch (err) {
    next(err);
  }
}

async function deactivateRecurring(req, res, next) {
  try {
    return success(
      res,
      'Recurring expense deactivated',
      await recurringService.deactivateRecurring(req.params.id, req.user.id)
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  list,
  getOne,
  create,
  update,
  remove,
  listRecurring,
  getRecurring,
  createRecurring,
  updateRecurring,
  pauseRecurring,
  resumeRecurring,
  deactivateRecurring,
};
