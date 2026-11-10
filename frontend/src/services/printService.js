import api from './api';

function unwrap(res) {
  return res.data.data;
}

export const printApi = {
  list: (orderId) => api.get(`/orders/${orderId}/print`).then(unwrap),
  customerSlip: (orderId) => api.get(`/orders/${orderId}/print/customer-slip`).then(unwrap),
  kitchenTicket: (orderId) => api.get(`/orders/${orderId}/print/kitchen-ticket`).then(unwrap),
  cashierRecord: (orderId) => api.get(`/orders/${orderId}/print/cashier-record`).then(unwrap),
  markCustomerPrinted: (orderId, body = {}) =>
    api.post(`/orders/${orderId}/print/customer-slip/printed`, body).then(unwrap),
  markKitchenPrinted: (orderId, body = {}) =>
    api.post(`/orders/${orderId}/print/kitchen-ticket/printed`, body).then(unwrap),
  markCashierPrinted: (orderId, body = {}) =>
    api.post(`/orders/${orderId}/print/cashier-record/printed`, body).then(unwrap),
  refresh: (orderId) => api.post(`/orders/${orderId}/print/refresh`).then(unwrap),
};

