const express = require('express');
const controller = require('./inventory.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const schemas = require('./inventory.schemas');

const router = express.Router();

router.use(authenticate);

router.get('/dashboard', authorize('inventory.view'), controller.getDashboard);
router.get('/units', authorize('inventory.view'), controller.listUnits);
router.get('/suppliers', authorize('inventory.view'), controller.listSuppliers);
router.get('/menu-products', authorize('inventory.view'), controller.listMenuProducts);

router.get(
  '/categories',
  authorize('inventory.view'),
  validate(schemas.paginationQuery, 'query'),
  controller.listCategories
);
router.get('/categories/:id', authorize('inventory.view'), controller.getCategory);
router.post(
  '/categories',
  authorize('inventory.update'),
  validate(schemas.categoryCreate),
  controller.createCategory
);
router.patch(
  '/categories/:id',
  authorize('inventory.update'),
  validate(schemas.categoryUpdate),
  controller.updateCategory
);
router.patch(
  '/categories/:id/status',
  authorize('inventory.update'),
  validate(schemas.statusBody),
  controller.setCategoryStatus
);

router.get(
  '/items',
  authorize('inventory.view'),
  validate(schemas.paginationQuery, 'query'),
  controller.listItems
);
router.get('/items/:id', authorize('inventory.view'), controller.getItem);
router.post(
  '/items',
  authorize('inventory.update'),
  validate(schemas.itemCreate),
  controller.createItem
);
router.patch(
  '/items/:id',
  authorize('inventory.update'),
  validate(schemas.itemUpdate),
  controller.updateItem
);
router.patch(
  '/items/:id/status',
  authorize('inventory.update'),
  validate(schemas.statusBody),
  controller.setItemStatus
);
router.post('/items/:id/archive', authorize('inventory.update'), controller.archiveItem);

router.post(
  '/stock/add',
  authorize('inventory.update'),
  validate(schemas.stockAdd),
  controller.addStock
);
router.post(
  '/stock/adjust',
  authorize('inventory.update'),
  validate(schemas.stockAdjust),
  controller.adjustStock
);
router.post(
  '/stock/waste',
  authorize('inventory.update'),
  validate(schemas.stockWaste),
  controller.recordWastage
);
router.get(
  '/movements',
  authorize('inventory.view'),
  validate(schemas.paginationQuery, 'query'),
  controller.listMovements
);

router.get(
  '/recipes',
  authorize('inventory.view'),
  validate(schemas.paginationQuery, 'query'),
  controller.listRecipes
);
router.get('/recipes/:id', authorize('inventory.view'), controller.getRecipe);
router.post(
  '/recipes',
  authorize('inventory.update'),
  validate(schemas.recipeUpsert),
  controller.upsertRecipe
);
router.patch('/recipes/:id/deactivate', authorize('inventory.update'), controller.deactivateRecipe);

router.get(
  '/modifiers/:modifierId/ingredients',
  authorize('inventory.view'),
  controller.getModifierIngredients
);
router.put(
  '/modifiers/:modifierId/ingredients',
  authorize('inventory.update'),
  validate(schemas.modifierIngredientUpsert),
  controller.upsertModifierIngredients
);

router.get(
  '/orders/:orderId/deduction-preview',
  authorize('inventory.view'),
  controller.previewDeduction
);

module.exports = router;
