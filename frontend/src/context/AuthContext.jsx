import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('pos_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('pos_token'));
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('pos_token')));

  const persist = useCallback((nextToken, nextUser) => {
    if (nextToken) {
      localStorage.setItem('pos_token', nextToken);
    } else {
      localStorage.removeItem('pos_token');
    }
    if (nextUser) {
      localStorage.setItem('pos_user', JSON.stringify(nextUser));
    } else {
      localStorage.removeItem('pos_user');
    }
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await authService.fetchMe();
        if (!cancelled) {
          persist(token, me);
        }
      } catch {
        if (!cancelled) {
          persist(null, null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [token, persist]);

  const login = useCallback(
    async (username, password) => {
      const result = await authService.login(username, password);
      persist(result.token, result.user);
      return result.user;
    },
    [persist]
  );

  const logout = useCallback(async () => {
    await authService.logout();
    persist(null, null);
  }, [persist]);

  const hasPermission = useCallback(
    (code) => {
      if (!user) return false;
      if (user.roles?.includes('ADMIN')) return true;
      return user.permissions?.includes(code);
    },
    [user]
  );

  const hasAnyPermission = useCallback(
    (...codes) => codes.some((code) => hasPermission(code)),
    [hasPermission]
  );

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      login,
      logout,
      hasPermission,
      hasAnyPermission,
    }),
    [user, token, loading, login, logout, hasPermission, hasAnyPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
