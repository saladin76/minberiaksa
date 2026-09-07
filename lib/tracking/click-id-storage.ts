export interface StoredClickIds {
  ttclid?: string;
  gclid?: string;
  fbclid?: string;
  snap_click_id?: string;
  scid?: string;
}

const CLICK_ID_STORAGE_KEYS: Record<keyof StoredClickIds, string> = {
  ttclid: "_ttclid",
  gclid: "_gclid",
  fbclid: "_fbclid",
  snap_click_id: "_snap_click_id",
  scid: "_scid",
};

function getSearchParam(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get(key) ?? undefined;
}

function getStoredValue(storageKey: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return sessionStorage.getItem(storageKey) || undefined;
  } catch {
    return undefined;
  }
}

function setStoredValue(storageKey: string, value: string | undefined) {
  if (typeof window === "undefined" || !value) return;
  try {
    sessionStorage.setItem(storageKey, value);
  } catch {
    // Never block tracking because storage is unavailable.
  }
}

export function captureStoredClickIds(): StoredClickIds {
  const out: StoredClickIds = {};

  for (const key of Object.keys(CLICK_ID_STORAGE_KEYS) as Array<keyof StoredClickIds>) {
    const storageKey = CLICK_ID_STORAGE_KEYS[key];
    const value = getSearchParam(key) || getStoredValue(storageKey);
    if (value) {
      out[key] = value;
      setStoredValue(storageKey, value);
    }
  }

  return out;
}
