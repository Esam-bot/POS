import api from './api';

function unwrap(res) {
  return res.data.data;
}

export const ordersApi = {
  list: (params) => api.get('/orders', { params }).then(unwrap),
  get: (id) => api.get(`/orders/${id}`).then(unwrap),
  create: (body) => api.post('/orders', body).then(unwrap),
  addItems: (id, items) => api.post(`/orders/${id}/items`, { items }).then(unwrap),
  submit: (id) => api.post(`/orders/${id}/submit`).then(unwrap),
  transition: (id, status, reason) =>
    api.post(`/orders/${id}/transition`, { status, reason }).then(unwrap),
  cancel: (id, reason) => api.post(`/orders/${id}/cancel`, { reason }).then(unwrap),
  split: (id, items) => api.post(`/orders/${id}/split`, { items }).then(unwrap),
};

export const tablesApi = {
  list: (params) => api.get('/tables', { params }).then(unwrap),
  get: (id) => api.get(`/tables/${id}`).then(unwrap),
  create: (body) => api.post('/tables', body).then(unwrap),
  update: (id, body) => api.patch(`/tables/${id}`, body).then(unwrap),
  setStatus: (id, status) => api.patch(`/tables/${id}/status`, { status }).then(unwrap),
  remove: (id) => api.delete(`/tables/${id}`).then(unwrap),
};

export const sessionsApi = {
  list: (params) => api.get('/table-sessions', { params }).then(unwrap),
  get: (id) => api.get(`/table-sessions/${id}`).then(unwrap),
  open: (body) => api.post('/table-sessions', body).then(unwrap),
  close: (id) => api.post(`/table-sessions/${id}/close`).then(unwrap),
  addTables: (id, tableIds) =>
    api.post(`/table-sessions/${id}/tables`, { tableIds }).then(unwrap),
  transfer: (id, body) => api.post(`/table-sessions/${id}/transfer`, body).then(unwrap),
};
