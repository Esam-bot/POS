import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

function socketUrl() {
  // Prefer same-origin so Vite can proxy /socket.io and we avoid Chrome's
  // blocked ports (e.g. 6000 → net::ERR_UNSAFE_PORT).
  if (typeof window !== 'undefined' && !import.meta.env.VITE_API_URL) {
    return window.location.origin;
  }
  const api = import.meta.env.VITE_API_URL || `${window?.location?.origin || ''}/api`;
  const base = api.replace(/\/api\/?$/, '');
  return base || (typeof window !== 'undefined' ? window.location.origin : '');
}

/**
 * Subscribe to Socket.IO room events. Calls onEvent(eventName, payload).
 * Reconnects automatically; caller should refresh state on connect.
 */
export function useSocket(room, events, onEvent, enabled = true) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const eventsKey = (events || []).join(',');

  useEffect(() => {
    if (!enabled) return undefined;

    const token = localStorage.getItem('pos_token');
    // Polling first is more reliable through the Vite /socket.io proxy;
    // websocket-first often causes EPIPE / ECONNRESET noise when the upgrade fails.
    const socket = io(socketUrl(), {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      auth: token ? { token } : undefined,
    });

    const join = () => {
      if (room === 'kitchen') socket.emit('join_kitchen');
      if (room === 'pos') socket.emit('join_pos');
      if (typeof room === 'string' && room.startsWith('kitchen:station:')) {
        socket.emit('join_kitchen');
        const stationId = room.slice('kitchen:station:'.length);
        if (stationId) socket.emit('join_kitchen_station', stationId);
      }
      handlerRef.current?.('__connected', null);
    };

    socket.on('connect', join);
    if (socket.connected) join();

    const list = eventsKey ? eventsKey.split(',').filter(Boolean) : [];
    list.forEach((event) => {
      socket.on(event, (payload) => handlerRef.current?.(event, payload));
    });

    return () => {
      list.forEach((event) => socket.off(event));
      socket.off('connect', join);
      socket.disconnect();
    };
  }, [room, eventsKey, enabled]);
}
