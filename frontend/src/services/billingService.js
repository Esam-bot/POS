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
  get: () => api.get('/settings').then(unwrap),
  update: (body) => api.patch('/settings', body).then(unwrap),
  listMethods: () => api.get('/settings/payment-methods').then(unwrap),
  updateMethod: (id, body) => api.patch(`/settings/payment-methods/${id}`, body).then(unwrap),
};

export const reportsApi = {
  financial: (params) => api.get('/reports/financial', { params }).then(unwrap),
};

export { idempotencyKey };
