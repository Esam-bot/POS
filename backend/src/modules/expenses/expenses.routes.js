const express = require('express');
const controller = require('./expenses.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, authorizeAny } = require('../../middleware/auth');
const schemas = require('./expenses.schemas');

const router = express.Router();

router.use(authenticate);

router.get(
  '/categories',
  authorizeAny('expenses.manage', 'reports.financial', 'reports.view'),
  controller.listCategories
);
router.post(
  '/categories',
  authorize('expenses.manage'),
  validate(schemas.categoryCreate),
  controller.createCategory
);
router.patch(
  '/categories/:id',
  authorize('expenses.manage'),
  validate(schemas.categoryUpdate),
  controller.updateCategory
);
router.delete(
  '/categories/:id',
  authorize('expenses.manage'),
  controller.archiveCategory
);

// Recurring schedules (must be registered before /:id)
router.get(
  '/recurring',
  authorizeAny('expenses.manage', 'reports.financial', 'reports.view'),
  validate(schemas.recurringListQuery, 'query'),
  controller.listRecurring
);
router.post(
  '/recurring',
  authorize('expenses.manage'),
  validate(schemas.recurringCreate),
  controller.createRecurring
);
router.get(
  '/recurring/:id',
  authorizeAny('expenses.manage', 'reports.financial', 'reports.view'),
  controller.getRecurring
);
router.patch(
  '/recurring/:id',
  authorize('expenses.manage'),
  validate(schemas.recurringUpdate),
  controller.updateRecurring
);
router.post(
  '/recurring/:id/pause',
  authorize('expenses.manage'),
  controller.pauseRecurring
);
router.post(
  '/recurring/:id/resume',
  authorize('expenses.manage'),
  controller.resumeRecurring
);
router.post(
  '/recurring/:id/deactivate',
  authorize('expenses.manage'),
  controller.deactivateRecurring
);

router.get(
  '/',
  authorizeAny('expenses.manage', 'reports.financial', 'reports.view'),
  validate(schemas.listQuery, 'query'),
  controller.list
);

router.get(
  '/:id',
  authorizeAny('expenses.manage', 'reports.financial', 'reports.view'),
  controller.getOne
);

router.post('/', authorize('expenses.manage'), validate(schemas.expenseCreate), controller.create);

router.patch(
  '/:id',
  authorize('expenses.manage'),
  validate(schemas.expenseUpdate),
  controller.update
);

router.delete('/:id', authorize('expenses.manage'), controller.remove);

module.exports = router;
