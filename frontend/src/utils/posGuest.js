const KEY = 'pos.pendingGuest';

/** Persist guest details across dine-in table → session → order screens. */
export function setPendingGuest(guest) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(guest || {}));
  } catch {
    // ignore quota / private mode
  }
}

export function getPendingGuest() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingGuest() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
