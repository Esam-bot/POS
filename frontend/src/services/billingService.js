import api from './api';

function unwrap(res) {
  return res.data.data;
}

function idempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const billingApi = {
  quote: (orderId, portions) =>
    api.post(`/orders/${orderId}/payment-quote`, { portions }).then(unwrap),
  pay: (orderId, portions, key = idempotencyKey(), options = {}) =>
    api
      .post(
        `/orders/${orderId}/payments`,
        {
          portions,
          idempotencyKey: key,
          ...(options.allowNegativeStock ? { allowNegativeStock: true } : {}),
        },
        { headers: { 'Idempotency-Key': key } }
      )
      .then(unwrap),
  listPayments: (orderId) => api.get(`/orders/${orderId}/payments`).then(unwrap),
  getPayment: (id) => api.get(`/payments/${id}`).then(unwrap),
  refund: (paymentId, body, key = idempotencyKey()) =>
    api
      .post(
        `/payments/${paymentId}/refunds`,
        { ...body, idempotencyKey: key },
        { headers: { 'Idempotency-Key': key } }
      )
      .then(unwrap),
  listRefunds: (paymentId) => api.get(`/payments/${paymentId}/refunds`).then(unwrap),
  applyDiscount: (orderId, body) => api.post(`/orders/${orderId}/discount`, body).then(unwrap),
  settle: (orderId, body) => api.post(`/orders/${orderId}/settle`, body).then(unwrap),
  createReceipt: (orderId) => api.post(`/orders/${orderId}/receipt`).then(unwrap),
  getReceipt: (orderId) => api.get(`/orders/${orderId}/receipt`).then(unwrap),
};

export const settingsApi = {
  publicBranding: () => api.get('/settings/public').then(unwrap),
  get: () => api.get('/settings').then(unwrap),
  update: (body) => api.patch('/settings', body).then(unwrap),
  listMethods: () => api.get('/settings/payment-methods').then(unwrap),
  createMethod: (body) => api.post('/settings/payment-methods', body).then(unwrap),
  updateMethod: (id, body) => api.patch(`/settings/payment-methods/${id}`, body).then(unwrap),
  deleteMethod: (id) => api.delete(`/settings/payment-methods/${id}`).then(unwrap),
};

export const reportsApi = {
  financial: (params) => api.get('/reports/financial', { params }).then(unwrap),
};

export const expensesApi = {
  categories: (params) => api.get('/expenses/categories', { params }).then(unwrap),
  createCategory: (body) => api.post('/expenses/categories', body).then(unwrap),
  updateCategory: (id, body) => api.patch(`/expenses/categories/${id}`, body).then(unwrap),
  archiveCategory: (id) => api.delete(`/expenses/categories/${id}`).then(unwrap),
  list: (params) => api.get('/expenses', { params }).then(unwrap),
  get: (id) => api.get(`/expenses/${id}`).then(unwrap),
  create: (body) => api.post('/expenses', body).then(unwrap),
  update: (id, body) => api.patch(`/expenses/${id}`, body).then(unwrap),
  remove: (id) => api.delete(`/expenses/${id}`).then(unwrap),
  listRecurring: (params) => api.get('/expenses/recurring', { params }).then(unwrap),
  getRecurring: (id) => api.get(`/expenses/recurring/${id}`).then(unwrap),
  createRecurring: (body) => api.post('/expenses/recurring', body).then(unwrap),
  updateRecurring: (id, body) => api.patch(`/expenses/recurring/${id}`, body).then(unwrap),
  pauseRecurring: (id) => api.post(`/expenses/recurring/${id}/pause`).then(unwrap),
  resumeRecurring: (id) => api.post(`/expenses/recurring/${id}/resume`).then(unwrap),
  deactivateRecurring: (id) => api.post(`/expenses/recurring/${id}/deactivate`).then(unwrap),
};

export { idempotencyKey };
