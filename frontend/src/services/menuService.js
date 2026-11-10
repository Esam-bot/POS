import api from './api';

function unwrap(res) {
  return res.data.data;
}

export const menuApi = {
  overview: () => api.get('/menu/overview').then(unwrap),

  listCategories: (params) => api.get('/menu/categories', { params }).then(unwrap),
  createCategory: (body) => api.post('/menu/categories', body).then(unwrap),
  updateCategory: (id, body) => api.patch(`/menu/categories/${id}`, body).then(unwrap),
  setCategoryStatus: (id, isActive) =>
    api.patch(`/menu/categories/${id}/status`, { isActive }).then(unwrap),
  deleteCategory: (id) => api.delete(`/menu/categories/${id}`).then(unwrap),

  listStations: (params) => api.get('/menu/stations', { params }).then(unwrap),
  createStation: (body) => api.post('/menu/stations', body).then(unwrap),
  updateStation: (id, body) => api.patch(`/menu/stations/${id}`, body).then(unwrap),
  setStationStatus: (id, isActive) =>
    api.patch(`/menu/stations/${id}/status`, { isActive }).then(unwrap),

  listItems: (params) => api.get('/menu/items', { params }).then(unwrap),
  getItem: (id) => api.get(`/menu/items/${id}`).then(unwrap),
  createItem: (body) => api.post('/menu/items', body).then(unwrap),
  updateItem: (id, body) => api.patch(`/menu/items/${id}`, body).then(unwrap),
  setAvailability: (id, isAvailable) =>
    api.patch(`/menu/items/${id}/availability`, { isAvailable }).then(unwrap),
  archiveItem: (id, archived) =>
    api.patch(`/menu/items/${id}/archive`, { archived }).then(unwrap),

  createVariant: (itemId, body) =>
    api.post(`/menu/items/${itemId}/variants`, body).then(unwrap),
  updateVariant: (variantId, body) =>
    api.patch(`/menu/variants/${variantId}`, body).then(unwrap),
  setVariantStatus: (variantId, isActive) =>
    api.patch(`/menu/variants/${variantId}/status`, { isActive }).then(unwrap),

  listModifierGroups: (params) => api.get('/menu/modifier-groups', { params }).then(unwrap),
  getModifierGroup: (id) => api.get(`/menu/modifier-groups/${id}`).then(unwrap),
  createModifierGroup: (body) => api.post('/menu/modifier-groups', body).then(unwrap),
  updateModifierGroup: (id, body) =>
    api.patch(`/menu/modifier-groups/${id}`, body).then(unwrap),
  createModifier: (groupId, body) =>
    api.post(`/menu/modifier-groups/${groupId}/modifiers`, body).then(unwrap),
  updateModifier: (modifierId, body) =>
    api.patch(`/menu/modifiers/${modifierId}`, body).then(unwrap),
  setModifierStatus: (modifierId, isActive) =>
    api.patch(`/menu/modifiers/${modifierId}/status`, { isActive }).then(unwrap),

  getItemModifierGroups: (itemId) =>
    api.get(`/menu/items/${itemId}/modifier-groups`).then(unwrap),
  setItemModifierGroups: (itemId, groups) =>
    api.put(`/menu/items/${itemId}/modifier-groups`, { groups }).then(unwrap),

  uploadImage: (file) => {
    const form = new FormData();
    form.append('image', file);
    return api
      .post('/menu/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(unwrap);
  },
};

export function imageSrc(url) {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  // Relative /uploads/... paths: use API origin when VITE_API_URL is absolute.
  const api = import.meta.env.VITE_API_URL || '';
  if (api.startsWith('http')) {
    const origin = api.replace(/\/api\/?$/, '');
    return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
  }
  return url.startsWith('/') ? url : `/${url}`;
}

export const MENU_IMAGE_FALLBACK = '/images/menu-fallback.svg';
