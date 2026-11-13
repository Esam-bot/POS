import api from './api';

function unwrap(res) {
  return res.data.data;
}

export const inventoryApi = {
  dashboard: () => api.get('/inventory/dashboard').then(unwrap),
  listUnits: () => api.get('/inventory/units').then(unwrap),
  listSuppliers: (params) => api.get('/inventory/suppliers', { params }).then(unwrap),
  getSupplier: (id) => api.get(`/inventory/suppliers/${id}`).then(unwrap),
  createSupplier: (body) => api.post('/inventory/suppliers', body).then(unwrap),
  updateSupplier: (id, body) => api.patch(`/inventory/suppliers/${id}`, body).then(unwrap),
  archiveSupplier: (id) => api.post(`/inventory/suppliers/${id}/archive`).then(unwrap),

  listPurchases: (params) => api.get('/inventory/purchases', { params }).then(unwrap),
  getPurchase: (id) => api.get(`/inventory/purchases/${id}`).then(unwrap),
  createPurchase: (body) => api.post('/inventory/purchases', body).then(unwrap),
  updatePurchase: (id, body) => api.patch(`/inventory/purchases/${id}`, body).then(unwrap),
  receivePurchase: (id, body) => api.post(`/inventory/purchases/${id}/receive`, body).then(unwrap),

  reportStock: () => api.get('/inventory/reports/stock').then(unwrap),
  reportLowStock: () => api.get('/inventory/reports/low-stock').then(unwrap),
  reportConsumption: (params) => api.get('/inventory/reports/consumption', { params }).then(unwrap),
  reportPurchases: (params) => api.get('/inventory/reports/purchases', { params }).then(unwrap),
  reportWastage: (params) => api.get('/inventory/reports/wastage', { params }).then(unwrap),
  reportValuation: () => api.get('/inventory/reports/valuation').then(unwrap),

  listMenuProducts: () => api.get('/inventory/menu-products').then(unwrap),

  listCategories: (params) => api.get('/inventory/categories', { params }).then(unwrap),
  getCategory: (id) => api.get(`/inventory/categories/${id}`).then(unwrap),
  createCategory: (body) => api.post('/inventory/categories', body).then(unwrap),
  updateCategory: (id, body) => api.patch(`/inventory/categories/${id}`, body).then(unwrap),
  setCategoryStatus: (id, isActive) =>
    api.patch(`/inventory/categories/${id}/status`, { isActive }).then(unwrap),
  deleteCategory: (id) => api.delete(`/inventory/categories/${id}`).then(unwrap),

  listItems: (params) => api.get('/inventory/items', { params }).then(unwrap),
  getItem: (id) => api.get(`/inventory/items/${id}`).then(unwrap),
  createItem: (body) => api.post('/inventory/items', body).then(unwrap),
  updateItem: (id, body) => api.patch(`/inventory/items/${id}`, body).then(unwrap),
  setItemStatus: (id, isActive) =>
    api.patch(`/inventory/items/${id}/status`, { isActive }).then(unwrap),
  archiveItem: (id) => api.post(`/inventory/items/${id}/archive`).then(unwrap),

  addStock: (body) => api.post('/inventory/stock/add', body).then(unwrap),
  adjustStock: (body) => api.post('/inventory/stock/adjust', body).then(unwrap),
  wasteStock: (body) => api.post('/inventory/stock/waste', body).then(unwrap),
  listMovements: (params) => api.get('/inventory/movements', { params }).then(unwrap),

  listRecipes: (params) => api.get('/inventory/recipes', { params }).then(unwrap),
  getRecipe: (id) => api.get(`/inventory/recipes/${id}`).then(unwrap),
  saveRecipe: (body) => api.post('/inventory/recipes', body).then(unwrap),
  deactivateRecipe: (id) => api.patch(`/inventory/recipes/${id}/deactivate`).then(unwrap),

  getModifierIngredients: (modifierId) =>
    api.get(`/inventory/modifiers/${modifierId}/ingredients`).then(unwrap),
  saveModifierIngredients: (modifierId, body) =>
    api.put(`/inventory/modifiers/${modifierId}/ingredients`, body).then(unwrap),
};

export function qty(v, digits = 3) {
  const n = Number(v || 0);
  return n.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function stockTone(status) {
  if (status === 'OUT_OF_STOCK') return 'danger';
  if (status === 'LOW_STOCK') return 'warning';
  return 'success';
}
