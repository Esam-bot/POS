const express = require('express');
const controller = require('./inventory.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, authorizeAny } = require('../../middleware/auth');
const schemas = require('./inventory.schemas');

const router = express.Router();

router.use(authenticate);

router.get('/dashboard', authorize('inventory.view'), controller.getDashboard);
router.get('/units', authorize('inventory.view'), controller.listUnits);
router.get('/menu-products', authorize('inventory.view'), controller.listMenuProducts);

router.get(
  '/suppliers',
  authorizeAny('inventory.view', 'suppliers.manage'),
  validate(schemas.paginationQuery, 'query'),
  controller.listSuppliers
);
router.get('/suppliers/:id', authorizeAny('inventory.view', 'suppliers.manage'), controller.getSupplier);
router.post(
  '/suppliers',
  authorize('suppliers.manage'),
  validate(schemas.supplierCreate),
  controller.createSupplier
);
router.patch(
  '/suppliers/:id',
  authorize('suppliers.manage'),
  validate(schemas.supplierUpdate),
  controller.updateSupplier
);
router.post('/suppliers/:id/archive', authorize('suppliers.manage'), controller.archiveSupplier);

router.get(
  '/purchases',
  authorizeAny('inventory.view', 'purchases.manage'),
  validate(schemas.paginationQuery, 'query'),
  controller.listPurchases
);
router.get('/purchases/:id', authorizeAny('inventory.view', 'purchases.manage'), controller.getPurchase);
router.post(
  '/purchases',
  authorize('purchases.manage'),
  validate(schemas.purchaseCreate),
  controller.createPurchase
);
router.patch(
  '/purchases/:id',
  authorize('purchases.manage'),
  validate(schemas.purchaseUpdate),
  controller.updatePurchase
);
router.post(
  '/purchases/:id/receive',
  authorize('purchases.manage'),
  validate(schemas.purchaseReceive),
  controller.receivePurchase
);

router.get('/reports/stock', authorize('inventory.view'), controller.reportCurrentStock);
router.get('/reports/low-stock', authorize('inventory.view'), controller.reportLowStock);
router.get('/reports/consumption', authorize('inventory.view'), controller.reportConsumption);
router.get('/reports/purchases', authorize('inventory.view'), controller.reportPurchases);
router.get('/reports/wastage', authorize('inventory.view'), controller.reportWastage);
router.get('/reports/valuation', authorize('inventory.view'), controller.reportValuation);

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
router.delete('/categories/:id', authorize('inventory.update'), controller.deleteCategory);

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
