const express = require('express');
const controller = require('./menu.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, authorizeAny } = require('../../middleware/auth');
const { singleImage } = require('../../middleware/upload');
const schemas = require('./menu.schemas');

const router = express.Router();

router.use(authenticate);

router.get('/overview', authorize('menu.view'), controller.overview);

router.post(
  '/upload-image',
  authorizeAny('menu.create', 'menu.update'),
  singleImage('image'),
  controller.uploadImage
);

// Categories
router.get('/categories', authorize('menu.view'), controller.listCategories);
router.get('/categories/:id', authorize('menu.view'), controller.getCategory);
router.post(
  '/categories',
  authorize('menu.create'),
  validate(schemas.categoryCreate),
  controller.createCategory
);
router.patch(
  '/categories/:id',
  authorize('menu.update'),
  validate(schemas.categoryUpdate),
  controller.updateCategory
);
router.patch(
  '/categories/:id/status',
  authorize('menu.update'),
  validate(schemas.statusBody),
  controller.setCategoryStatus
);
router.delete('/categories/:id', authorize('menu.delete'), controller.deleteCategory);

// Stations
router.get('/stations', authorize('menu.view'), controller.listStations);
router.get('/stations/:id', authorize('menu.view'), controller.getStation);
router.post(
  '/stations',
  authorize('menu.create'),
  validate(schemas.stationCreate),
  controller.createStation
);
router.patch(
  '/stations/:id',
  authorize('menu.update'),
  validate(schemas.stationUpdate),
  controller.updateStation
);
router.patch(
  '/stations/:id/status',
  authorize('menu.update'),
  validate(schemas.statusBody),
  controller.setStationStatus
);
router.delete('/stations/:id', authorize('menu.delete'), controller.deleteStation);

// Items
router.get('/items', authorize('menu.view'), validate(schemas.itemListQuery, 'query'), controller.listItems);
router.get('/items/:id', authorize('menu.view'), controller.getItem);
router.post('/items', authorize('menu.create'), validate(schemas.itemCreate), controller.createItem);
router.patch(
  '/items/:id',
  authorize('menu.update'),
  validate(schemas.itemUpdate),
  controller.updateItem
);
router.patch(
  '/items/:id/availability',
  authorize('menu.update'),
  validate(schemas.availabilityBody),
  controller.setItemAvailability
);
router.patch(
  '/items/:id/archive',
  authorize('menu.delete'),
  validate(schemas.archiveBody),
  controller.archiveItem
);

router.post(
  '/items/:id/variants',
  authorize('menu.create'),
  validate(schemas.variantCreate),
  controller.createVariant
);
router.get(
  '/items/:id/modifier-groups',
  authorize('menu.view'),
  controller.getItemModifierGroups
);
router.put(
  '/items/:id/modifier-groups',
  authorize('menu.update'),
  validate(schemas.assignGroupsBody),
  controller.setItemModifierGroups
);

router.patch(
  '/variants/:variantId',
  authorize('menu.update'),
  validate(schemas.variantUpdate),
  controller.updateVariant
);
router.patch(
  '/variants/:variantId/status',
  authorize('menu.update'),
  validate(schemas.statusBody),
  controller.setVariantStatus
);

// Modifier groups
router.get('/modifier-groups', authorize('menu.view'), controller.listModifierGroups);
router.get('/modifier-groups/:id', authorize('menu.view'), controller.getModifierGroup);
router.post(
  '/modifier-groups',
  authorize('menu.create'),
  validate(schemas.modifierGroupCreate),
  controller.createModifierGroup
);
router.patch(
  '/modifier-groups/:id',
  authorize('menu.update'),
  validate(schemas.modifierGroupUpdate),
  controller.updateModifierGroup
);
router.post(
  '/modifier-groups/:id/modifiers',
  authorize('menu.create'),
  validate(schemas.modifierCreate),
  controller.createModifier
);

router.patch(
  '/modifiers/:modifierId',
  authorize('menu.update'),
  validate(schemas.modifierUpdate),
  controller.updateModifier
);
router.patch(
  '/modifiers/:modifierId/status',
  authorize('menu.update'),
  validate(schemas.statusBody),
  controller.setModifierStatus
);

module.exports = router;
