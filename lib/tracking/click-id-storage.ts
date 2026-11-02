export interface StoredClickIds {
  ttclid?: string;
  gclid?: string;
  fbclid?: string;
  snap_click_id?: string;
  scid?: string;
  scclid?: string;
  gbraid?: string;
  wbraid?: string;
  dclid?: string;
  twclid?: string;
  li_fat_id?: string;
  rdt_cid?: string;
}

const CLICK_ID_STORAGE_KEYS: Record<keyof StoredClickIds, string> = {
  ttclid: "_ttclid",
  gclid: "_gclid",
  fbclid: "_fbclid",
  snap_click_id: "_snap_click_id",
  scid: "_scid",
  scclid: "_scclid",
  gbraid: "_gbraid",
  wbraid: "_wbraid",
  dclid: "_dclid",
  twclid: "_twclid",
  li_fat_id: "_li_fat_id",
  rdt_cid: "_rdt_cid",
};

function getSearchParam(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  return (key === "scclid" ? params.get("ScCid") || params.get("sccid") || params.get("sc_click_id") || params.get(key) : params.get(key)) ?? undefined;
}

export function clearStoredClickIds(): void {
  if (typeof window === "undefined") return;
  for (const key of Object.values(CLICK_ID_STORAGE_KEYS)) { try { sessionStorage.removeItem(key); } catch {} }
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
