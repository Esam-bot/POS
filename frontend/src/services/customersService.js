import api from './api';

function unwrap(res) {
  return res.data.data;
}

export const customersApi = {
  search: (q, params = {}) =>
    api.get('/customers/search', { params: { q, ...params } }).then(unwrap),
};
