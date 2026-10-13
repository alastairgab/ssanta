/**
 * Participant-side local storage (checklists, own question copies). Per-device only, never synced,
 * never readable by the organiser. All access is wrapped because storage can be blocked
 * (private browsing, strict settings).
 */
export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocal(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
