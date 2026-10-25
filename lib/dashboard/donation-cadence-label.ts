import { dt } from "./i18n";

/** `MONTHLY` is the legacy payment kind for every recurring cadence. */
export function donationCadenceLabel(donation: { type: string; frequency?: string | null }): string {
  if (donation.type === "ONE_TIME") return dt("مرة واحدة");
  switch (donation.frequency) {
    case "DAILY": return dt("يومي");
    case "FRIDAY": return dt("أسبوعياً");
    case "MONTHLY": return dt("شهري");
    default: return dt("تبرع دوري");
  }
}
