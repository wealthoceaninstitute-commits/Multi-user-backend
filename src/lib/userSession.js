// src/lib/userSession.js

export const USER_STORAGE_KEY = 'mb_current_user';

export function getCurrentUser() {
  if (typeof window === 'undefined') return null;
  try {
    const u = window.localStorage.getItem(USER_STORAGE_KEY);
    return u || null;
  } catch {
    return null;
  }
}

export function setCurrentUser(username) {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = (username || '').trim();
    if (trimmed) {
      window.localStorage.setItem(USER_STORAGE_KEY, trimmed);
    }
  } catch {
    // ignore
  }
}

export function clearCurrentUser() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // ignore
  }
}
