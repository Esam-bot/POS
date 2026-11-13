import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { settingsApi } from '../services/billingService';
import { useAuth } from './AuthContext';
import { setDefaultCurrency } from '../utils/formatMoney';

const RestaurantContext = createContext(null);

export function RestaurantProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(false);

  const applyRestaurant = useCallback((data) => {
    setRestaurant(data);
    const code = data?.settings?.currencyCode || data?.currencyCode || 'PKR';
    setDefaultCurrency(code);
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setRestaurant(null);
      return null;
    }
    setLoading(true);
    try {
      const data = await settingsApi.get();
      applyRestaurant(data);
      return data;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, applyRestaurant]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      restaurant,
      settings: restaurant?.settings || null,
      name: restaurant?.name || 'Restaurant',
      currencyCode: restaurant?.settings?.currencyCode || 'PKR',
      deliveryFeeDefault: Number(restaurant?.settings?.deliveryFeeDefault || 0),
      timezone: restaurant?.settings?.timezone || 'Asia/Karachi',
      loading,
      refresh,
      applyRestaurant,
    }),
    [restaurant, loading, refresh, applyRestaurant]
  );

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurant() {
  const ctx = useContext(RestaurantContext);
  if (!ctx) {
    return {
      restaurant: null,
      settings: null,
      name: 'Restaurant',
      currencyCode: 'PKR',
      deliveryFeeDefault: 0,
      timezone: 'Asia/Karachi',
      loading: false,
      refresh: async () => null,
      applyRestaurant: () => {},
    };
  }
  return ctx;
}
