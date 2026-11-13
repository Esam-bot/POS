import api from './api';

const unwrap = (res) => res.data?.data;

export const kitchenApi = {
  board: (params = {}) => api.get('/kitchen/board', { params }).then(unwrap),
  delayed: (params = {}) => api.get('/kitchen/delayed', { params }).then(unwrap),
  history: (params = {}) => api.get('/kitchen/history', { params }).then(unwrap),
  stations: () => api.get('/kitchen/stations').then(unwrap),
  workload: () => api.get('/kitchen/workload').then(unwrap),
  getTicket: (id) => api.get(`/kitchen/tickets/${id}`).then(unwrap),
  updateTicketStatus: (id, status) =>
    api.patch(`/kitchen/tickets/${id}/status`, { status }).then(unwrap),
  updateItemStatus: (itemId, status) =>
    api.patch(`/kitchen/items/${itemId}/status`, { status }).then(unwrap),
};
