/**
 * Safe localStorage wrapper — never throws even if storage is unavailable
 * (privacy mode, full quota, SSR, etc.). All values are JSON-serialized.
 */

export function safeGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return raw; }
  } catch { return fallback; }
}

export function safeSet(key, value) {
  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch { /* ignore */ }
}

export function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
