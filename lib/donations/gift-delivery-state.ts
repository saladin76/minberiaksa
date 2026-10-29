export type GiftChannelState = { status: "SENDING" | "SENT" | "FAILED"; at: string; reason?: string; providerMessageId?: string | null };
export type GiftDeliveryState = Partial<Record<"EMAIL" | "WHATSAPP", GiftChannelState>>;

export function readGiftDeliveryState(raw: unknown): GiftDeliveryState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: GiftDeliveryState = {};
  for (const channel of ["EMAIL", "WHATSAPP"] as const) {
    const value = (raw as Record<string, unknown>)[channel];
    if (!value || typeof value !== "object") continue;
    const state = value as GiftChannelState;
    if (["SENDING", "SENT", "FAILED"].includes(state.status) && typeof state.at === "string") result[channel] = state;
  }
  return result;
}

export function giftChannelsComplete(channels: string[], state: GiftDeliveryState): boolean {
  return channels.every(channel => (channel === "EMAIL" || channel === "WHATSAPP") && state[channel]?.status === "SENT");
}

/** Missing optional fields on old Mongo documents are different from explicit null. */
export const giftNotDelivered = { OR: [{ giftDeliveredAt: null }, { giftDeliveredAt: { isSet: false } }] };
