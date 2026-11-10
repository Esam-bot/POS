import api from './api';

export async function login(username, password) {
  const { data } = await api.post('/auth/login', { username, password });
  return data.data;
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me');
  return data.data;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } catch {
    // Token may already be invalid; clear local session anyway.
  }
}
