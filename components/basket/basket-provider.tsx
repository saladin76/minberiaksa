"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { BasketItem, BasketItemInput, CheckoutSnapshot, LegacyBasketDetail } from "@/types/basket";
import { BasketContext } from "./basket-context";
import { BasketDrawer } from "./basket-drawer";

const STORAGE_KEY = "minber-basket-v1";
const STORAGE_VERSION = 1;
type StoredBasket = { version: 1; items: BasketItem[] };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const positiveNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
const stringValue = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const createId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `basket-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function sanitizeForSession(item: BasketItem): BasketItem {
  // Prototype session storage only — replace with server basket later.
  const { ownerName: _ownerName, dedication: _dedication, giftRecipient: _giftRecipient, giftEmail: _giftEmail, giftMessage: _giftMessage, giftSender: _giftSender, qurbaniName: _qurbaniName, metadata: _metadata, ...safe } = item;
  return safe;
}
function isStoredItem(value: unknown): value is BasketItem {
  if (!isRecord(value)) return false;
  return Boolean(stringValue(value.id) && stringValue(value.projectTitle) && stringValue(value.intent) && stringValue(value.intentLabel) && stringValue(value.donationMode) && positiveNumber(value.amount) && value.currency === "USD");
}
function readStoredBasket(): BasketItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(isStoredItem);
  } catch { return []; }
}
function normalizeLegacyDetail(raw: unknown): BasketItemInput | null {
  if (!isRecord(raw)) return null;
  const detail = raw as LegacyBasketDetail;
  const projectTitle = stringValue(detail.projectTitle) ?? stringValue(detail.project);
  const amount = positiveNumber(detail.amount);
  const intent = stringValue(detail.intent);
  const intentLabel = stringValue(detail.intentLabel);
  if (!projectTitle || !amount || !intent || !intentLabel || detail.currency !== "USD") return null;
  if (!["zakat", "waqf", "recurring", "urgent", "general"].includes(intent)) return null;
  const donationMode = detail.donationMode === "recurring" || detail.donationMode === "gift" ? detail.donationMode : "one-time";
  const giftData = isRecord(detail.giftData) ? detail.giftData : undefined;
  const dedicationData = isRecord(detail.dedicationData) ? detail.dedicationData : undefined;
  return {
    projectId: stringValue(detail.projectId), fundId: stringValue(detail.fundId), slug: stringValue(detail.slug), projectTitle,
    region: stringValue(detail.region), intent: intent as BasketItem["intent"], intentLabel, donationMode,
    frequency: stringValue(detail.frequency), amount, currency: "USD", source: stringValue(detail.source),
    receiptType: detail.receiptType === "zakat" || detail.receiptType === "recurring" || detail.receiptType === "general" ? detail.receiptType : undefined,
    certificateType: detail.certificateType === "waqf" ? "waqf" : undefined, waqfType: stringValue(detail.waqfType),
    ownerName: stringValue(detail.ownerName) ?? stringValue(dedicationData?.ownerName), dedication: stringValue(detail.dedication) ?? stringValue(dedicationData?.dedication),
    giftRecipient: stringValue(detail.giftRecipient) ?? stringValue(giftData?.recipient), giftEmail: stringValue(detail.giftEmail) ?? stringValue(giftData?.email),
    giftOccasion: stringValue(detail.giftOccasion) ?? stringValue(giftData?.occasion), giftMessage: stringValue(detail.giftMessage) ?? stringValue(giftData?.message),
    giftSender: stringValue(detail.giftSender) ?? stringValue(giftData?.sender), startPreference: stringValue(detail.startPreference),
    estimatedMonthly: positiveNumber(detail.estimatedMonthly), estimatedAnnual: positiveNumber(detail.estimatedAnnual),
    qurbaniUnits: positiveNumber(detail.qurbaniUnits), qurbaniName: stringValue(detail.qurbaniName),
  };
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BasketItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkoutSnapshot, setCheckoutSnapshot] = useState<CheckoutSnapshot | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { try { setItems(readStoredBasket()); } finally { setHydrated(true); } }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { const payload: StoredBasket = { version: STORAGE_VERSION, items: items.map(sanitizeForSession) }; sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch { /* functional without storage */ }
  }, [hydrated, items]);
  const addItem = useCallback((input: BasketItemInput) => { const item: BasketItem = { ...input, id: input.id ?? createId() }; setItems((current) => [...current, item]); return item; }, []);
  const updateItem = useCallback((id: string, updates: Partial<Omit<BasketItem, "id">>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...updates } : item)), []);
  const removeItem = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const restoreItem = useCallback((item: BasketItem, index?: number) => setItems((current) => { const rest = current.filter((entry) => entry.id !== item.id); if (index === undefined || index < 0 || index > rest.length) return [...rest, item]; return [...rest.slice(0, index), item, ...rest.slice(index)]; }), []);
  const clearBasket = useCallback(() => { setItems([]); setCheckoutSnapshot(null); try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ } }, []);
  const openDrawer = useCallback((returnFocus?: HTMLElement | null) => { returnFocusRef.current = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => { setDrawerOpen(false); const target = returnFocusRef.current; window.requestAnimationFrame(() => target?.focus()); }, []);
  useEffect(() => { const bridge = (event: Event) => { const normalized = normalizeLegacyDetail((event as CustomEvent<unknown>).detail); if (normalized) addItem(normalized); }; window.addEventListener("minber:add-to-basket", bridge); return () => window.removeEventListener("minber:add-to-basket", bridge); }, [addItem]);
  const value = useMemo(() => ({ items, hydrated, drawerOpen, checkoutSnapshot, addItem, updateItem, removeItem, restoreItem, clearBasket, openDrawer, closeDrawer, setCheckoutSnapshot }), [items, hydrated, drawerOpen, checkoutSnapshot, addItem, updateItem, removeItem, restoreItem, clearBasket, openDrawer, closeDrawer]);
  return <BasketContext.Provider value={value}>{children}<BasketDrawer /></BasketContext.Provider>;
}
