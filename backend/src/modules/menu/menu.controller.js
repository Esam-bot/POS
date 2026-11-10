const categoriesService = require('./categories.service');
const stationsService = require('./stations.service');
const itemsService = require('./items.service');
const variantsService = require('./variants.service');
const modifiersService = require('./modifiers.service');
const uploadService = require('../../services/upload.service');
const { success } = require('../../utils/apiResponse');

async function overview(req, res, next) {
  try {
    const data = await itemsService.getOverview();
    return success(res, 'Menu overview', data);
  } catch (err) {
    next(err);
  }
}

async function listCategories(req, res, next) {
  try {
    const data = await categoriesService.listCategories(req.query);
    return success(res, 'Categories retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function getCategory(req, res, next) {
  try {
    const data = await categoriesService.getCategory(req.params.id);
    return success(res, 'Category retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const data = await categoriesService.createCategory(req.body);
    return success(res, 'Category created successfully', data, 201);
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const data = await categoriesService.updateCategory(req.params.id, req.body);
    return success(res, 'Category updated successfully', data);
  } catch (err) {
    next(err);
  }
}

async function setCategoryStatus(req, res, next) {
  try {
    const data = await categoriesService.setCategoryStatus(req.params.id, req.body.isActive);
    return success(res, 'Category status updated', data);
  } catch (err) {
    next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    await categoriesService.softDeleteCategory(req.params.id);
    return success(res, 'Category deleted successfully');
  } catch (err) {
    next(err);
  }
}

async function listStations(req, res, next) {
  try {
    const data = await stationsService.listStations(req.query);
    return success(res, 'Kitchen stations retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function getStation(req, res, next) {
  try {
    const data = await stationsService.getStation(req.params.id);
    return success(res, 'Kitchen station retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function createStation(req, res, next) {
  try {
    const data = await stationsService.createStation(req.body);
    return success(res, 'Kitchen station created successfully', data, 201);
  } catch (err) {
    next(err);
  }
}

async function updateStation(req, res, next) {
  try {
    const data = await stationsService.updateStation(req.params.id, req.body);
    return success(res, 'Kitchen station updated successfully', data);
  } catch (err) {
    next(err);
  }
}

async function setStationStatus(req, res, next) {
  try {
    const data = await stationsService.setStationStatus(req.params.id, req.body.isActive);
    return success(res, 'Kitchen station status updated', data);
  } catch (err) {
    next(err);
  }
}

async function deleteStation(req, res, next) {
  try {
    await stationsService.softDeleteStation(req.params.id);
    return success(res, 'Kitchen station deleted successfully');
  } catch (err) {
    next(err);
  }
}

async function listItems(req, res, next) {
  try {
    const data = await itemsService.listItems(req.query);
    return success(res, 'Menu items retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function getItem(req, res, next) {
  try {
    const forPos = req.query.forPos === 'true';
    const data = await itemsService.getItem(req.params.id, { forPos });
    return success(res, 'Menu item retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function createItem(req, res, next) {
  try {
    const data = await itemsService.createItem(req.body);
    return success(res, 'Menu item created successfully', data, 201);
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const data = await itemsService.updateItem(req.params.id, req.body);
    return success(res, 'Menu item updated successfully', data);
  } catch (err) {
    next(err);
  }
}

async function setItemAvailability(req, res, next) {
  try {
    const data = await itemsService.setAvailability(req.params.id, req.body.isAvailable);
    return success(res, 'Availability updated', data);
  } catch (err) {
    next(err);
  }
}

async function archiveItem(req, res, next) {
  try {
    const data = await itemsService.setArchive(req.params.id, req.body.archived);
    return success(res, req.body.archived ? 'Menu item archived' : 'Menu item restored', data);
  } catch (err) {
    next(err);
  }
}

async function createVariant(req, res, next) {
  try {
    const data = await variantsService.createVariant(req.params.id, req.body);
    return success(res, 'Variant created successfully', data, 201);
  } catch (err) {
    next(err);
  }
}

async function updateVariant(req, res, next) {
  try {
    const data = await variantsService.updateVariant(req.params.variantId, req.body);
    return success(res, 'Variant updated successfully', data);
  } catch (err) {
    next(err);
  }
}

async function setVariantStatus(req, res, next) {
  try {
    const data = await variantsService.setVariantStatus(req.params.variantId, req.body.isActive);
    return success(res, 'Variant status updated', data);
  } catch (err) {
    next(err);
  }
}

async function listModifierGroups(req, res, next) {
  try {
    const data = await modifiersService.listModifierGroups(req.query);
    return success(res, 'Modifier groups retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function getModifierGroup(req, res, next) {
  try {
    const data = await modifiersService.getModifierGroup(req.params.id);
    return success(res, 'Modifier group retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function createModifierGroup(req, res, next) {
  try {
    const data = await modifiersService.createModifierGroup(req.body);
    return success(res, 'Modifier group created successfully', data, 201);
  } catch (err) {
    next(err);
  }
}

async function updateModifierGroup(req, res, next) {
  try {
    const data = await modifiersService.updateModifierGroup(req.params.id, req.body);
    return success(res, 'Modifier group updated successfully', data);
  } catch (err) {
    next(err);
  }
}

async function createModifier(req, res, next) {
  try {
    const data = await modifiersService.createModifier(req.params.id, req.body);
    return success(res, 'Modifier created successfully', data, 201);
  } catch (err) {
    next(err);
  }
}

async function updateModifier(req, res, next) {
  try {
    const data = await modifiersService.updateModifier(req.params.modifierId, req.body);
    return success(res, 'Modifier updated successfully', data);
  } catch (err) {
    next(err);
  }
}

async function setModifierStatus(req, res, next) {
  try {
    const data = await modifiersService.setModifierStatus(req.params.modifierId, req.body.isActive);
    return success(res, 'Modifier status updated', data);
  } catch (err) {
    next(err);
  }
}

async function getItemModifierGroups(req, res, next) {
  try {
    const data = await modifiersService.getItemModifierGroups(req.params.id);
    return success(res, 'Item modifier groups retrieved', data);
  } catch (err) {
    next(err);
  }
}

async function setItemModifierGroups(req, res, next) {
  try {
    const data = await modifiersService.setItemModifierGroups(req.params.id, req.body.groups);
    return success(res, 'Modifier groups assigned successfully', data);
  } catch (err) {
    next(err);
  }
}

async function uploadImage(req, res, next) {
  try {
    const result = await uploadService.saveMenuImage(req.file);
    return success(res, 'Image uploaded successfully', result, 201);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  overview,
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  setCategoryStatus,
  deleteCategory,
  listStations,
  getStation,
  createStation,
  updateStation,
  setStationStatus,
  deleteStation,
  listItems,
  getItem,
  createItem,
  updateItem,
  setItemAvailability,
  archiveItem,
  createVariant,
  updateVariant,
  setVariantStatus,
  listModifierGroups,
  getModifierGroup,
  createModifierGroup,
  updateModifierGroup,
  createModifier,
  updateModifier,
  setModifierStatus,
  getItemModifierGroups,
  setItemModifierGroups,
  uploadImage,
};
