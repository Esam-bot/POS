const categories = require('./categories.service');
const items = require('./items.service');
const stock = require('./stock.service');
const recipes = require('./recipes.service');
const dashboard = require('./dashboard.service');
const deduction = require('./deduction.service');
const suppliers = require('./suppliers.service');
const purchases = require('./purchases.service');
const reports = require('./reports.service');
const { success } = require('../../utils/apiResponse');

async function getDashboard(req, res, next) {
  try {
    return success(res, 'Inventory dashboard', await dashboard.getDashboard());
  } catch (err) {
    next(err);
  }
}

async function listCategories(req, res, next) {
  try {
    return success(res, 'Categories retrieved', await categories.listCategories(req.query));
  } catch (err) {
    next(err);
  }
}

async function getCategory(req, res, next) {
  try {
    return success(res, 'Category retrieved', await categories.getCategory(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    return success(res, 'Category created', await categories.createCategory(req.body), 201);
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    return success(res, 'Category updated', await categories.updateCategory(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

async function setCategoryStatus(req, res, next) {
  try {
    return success(
      res,
      'Category status updated',
      await categories.setCategoryStatus(req.params.id, req.body.isActive)
    );
  } catch (err) {
    next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    return success(res, 'Category deleted', await categories.softDeleteCategory(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function listItems(req, res, next) {
  try {
    return success(res, 'Inventory items retrieved', await items.listItems(req.query));
  } catch (err) {
    next(err);
  }
}

async function getItem(req, res, next) {
  try {
    return success(res, 'Inventory item retrieved', await items.getItem(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function createItem(req, res, next) {
  try {
    return success(res, 'Inventory item created', await items.createItem(req.body), 201);
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    return success(res, 'Inventory item updated', await items.updateItem(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

async function setItemStatus(req, res, next) {
  try {
    return success(
      res,
      'Item status updated',
      await items.setItemStatus(req.params.id, req.body.isActive)
    );
  } catch (err) {
    next(err);
  }
}

async function archiveItem(req, res, next) {
  try {
    return success(res, 'Item archived', await items.archiveItem(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function listUnits(req, res, next) {
  try {
    return success(res, 'Units retrieved', await items.listUnits());
  } catch (err) {
    next(err);
  }
}

async function listSuppliersLite(req, res, next) {
  try {
    return success(res, 'Suppliers retrieved', await items.listSuppliersLite());
  } catch (err) {
    next(err);
  }
}

async function listSuppliers(req, res, next) {
  try {
    return success(res, 'Suppliers retrieved', await suppliers.listSuppliers(req.query));
  } catch (err) {
    next(err);
  }
}

async function getSupplier(req, res, next) {
  try {
    return success(res, 'Supplier retrieved', await suppliers.getSupplier(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function createSupplier(req, res, next) {
  try {
    return success(res, 'Supplier created', await suppliers.createSupplier(req.body), 201);
  } catch (err) {
    next(err);
  }
}

async function updateSupplier(req, res, next) {
  try {
    return success(res, 'Supplier updated', await suppliers.updateSupplier(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

async function archiveSupplier(req, res, next) {
  try {
    return success(res, 'Supplier archived', await suppliers.archiveSupplier(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function listPurchases(req, res, next) {
  try {
    return success(res, 'Purchases retrieved', await purchases.listPurchases(req.query));
  } catch (err) {
    next(err);
  }
}

async function getPurchase(req, res, next) {
  try {
    return success(res, 'Purchase retrieved', await purchases.getPurchase(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function createPurchase(req, res, next) {
  try {
    return success(res, 'Purchase created', await purchases.createPurchase(req.body, req.user.id), 201);
  } catch (err) {
    next(err);
  }
}

async function updatePurchase(req, res, next) {
  try {
    return success(res, 'Purchase updated', await purchases.updatePurchase(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

async function receivePurchase(req, res, next) {
  try {
    const data = await purchases.receivePurchase(req.params.id, req.body, req.user.id, req);
    return success(res, data.replayed ? 'Receive already recorded' : 'Stock received', data);
  } catch (err) {
    next(err);
  }
}

async function reportCurrentStock(req, res, next) {
  try {
    return success(res, 'Current stock report', await reports.currentStock());
  } catch (err) {
    next(err);
  }
}

async function reportLowStock(req, res, next) {
  try {
    return success(res, 'Low stock report', await reports.lowStock());
  } catch (err) {
    next(err);
  }
}

async function reportConsumption(req, res, next) {
  try {
    return success(res, 'Consumption report', await reports.consumption(req.query));
  } catch (err) {
    next(err);
  }
}

async function reportPurchases(req, res, next) {
  try {
    return success(res, 'Purchase history report', await reports.purchaseHistory(req.query));
  } catch (err) {
    next(err);
  }
}

async function reportWastage(req, res, next) {
  try {
    return success(res, 'Wastage report', await reports.wastageHistory(req.query));
  } catch (err) {
    next(err);
  }
}

async function reportValuation(req, res, next) {
  try {
    return success(res, 'Stock valuation report', await reports.stockValuation());
  } catch (err) {
    next(err);
  }
}

async function addStock(req, res, next) {
  try {
    return success(res, 'Stock added', await stock.addStock(req.body, req.user.id, req), 201);
  } catch (err) {
    next(err);
  }
}

async function adjustStock(req, res, next) {
  try {
    return success(res, 'Stock adjusted', await stock.adjustStock(req.body, req.user.id, req));
  } catch (err) {
    next(err);
  }
}

async function recordWastage(req, res, next) {
  try {
    return success(res, 'Wastage recorded', await stock.recordWastage(req.body, req.user.id, req), 201);
  } catch (err) {
    next(err);
  }
}

async function listMovements(req, res, next) {
  try {
    return success(res, 'Stock history retrieved', await stock.listMovements(req.query));
  } catch (err) {
    next(err);
  }
}

async function listRecipes(req, res, next) {
  try {
    return success(res, 'Recipes retrieved', await recipes.listRecipes(req.query));
  } catch (err) {
    next(err);
  }
}

async function getRecipe(req, res, next) {
  try {
    return success(res, 'Recipe retrieved', await recipes.getRecipe(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function upsertRecipe(req, res, next) {
  try {
    return success(res, 'Recipe saved', await recipes.upsertRecipe(req.body, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function deactivateRecipe(req, res, next) {
  try {
    return success(
      res,
      'Recipe deactivated',
      await recipes.deactivateRecipe(req.params.id, req.user.id)
    );
  } catch (err) {
    next(err);
  }
}

async function listMenuProducts(req, res, next) {
  try {
    return success(res, 'Menu products retrieved', await recipes.listMenuProductsForRecipes());
  } catch (err) {
    next(err);
  }
}

async function getModifierIngredients(req, res, next) {
  try {
    return success(
      res,
      'Customization ingredients retrieved',
      await recipes.getModifierIngredients(req.params.modifierId)
    );
  } catch (err) {
    next(err);
  }
}

async function upsertModifierIngredients(req, res, next) {
  try {
    return success(
      res,
      'Customization ingredients saved',
      await recipes.upsertModifierIngredients(req.params.modifierId, req.body, req.user.id)
    );
  } catch (err) {
    next(err);
  }
}

async function previewDeduction(req, res, next) {
  try {
    return success(
      res,
      'Inventory deduction preview',
      await deduction.previewDeduction(req.params.orderId)
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboard,
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  setCategoryStatus,
  deleteCategory,
  listItems,
  getItem,
  createItem,
  updateItem,
  setItemStatus,
  archiveItem,
  listUnits,
  listSuppliersLite,
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  archiveSupplier,
  listPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  receivePurchase,
  reportCurrentStock,
  reportLowStock,
  reportConsumption,
  reportPurchases,
  reportWastage,
  reportValuation,
  addStock,
  adjustStock,
  recordWastage,
  listMovements,
  listRecipes,
  getRecipe,
  upsertRecipe,
  deactivateRecipe,
  listMenuProducts,
  getModifierIngredients,
  upsertModifierIngredients,
  previewDeduction,
};
