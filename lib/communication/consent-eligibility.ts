import type { CommunicationChannel, CommunicationPurpose, ContactPreference } from "./communication-types";

export type ConsentEligibility = {
  eligible: boolean;
  reason: string;
};

export function contactChannelEligibility(preference: ContactPreference | null | undefined, channel: CommunicationChannel, purpose: CommunicationPurpose): ConsentEligibility {
  if (!preference) return { eligible: false, reason: "لا توجد تفضيلات تواصل مسجلة لهذا الشخص." };
  if (preference.doNotContact) return { eligible: false, reason: "هذا الشخص مفعّل عليه عدم التواصل." };

  if (purpose === "TRANSACTIONAL") {
    if (channel === "EMAIL") return { eligible: true, reason: "تواصل تشغيلي عبر الإيميل." };
    if (channel === "SMS" && preference.smsOptIn) return { eligible: true, reason: "تواصل تشغيلي عبر SMS مع موافقة." };
    if (channel === "WHATSAPP" && preference.whatsappOptIn) return { eligible: true, reason: "تواصل تشغيلي عبر واتساب مع موافقة." };
    return { eligible: false, reason: "القناة التشغيلية تحتاج موافقة صريحة لهذا الشخص." };
  }

  if (channel === "EMAIL" && preference.emailOptIn) return { eligible: true, reason: "تواصل تسويقي عبر الإيميل مع موافقة." };
  if (channel === "SMS" && preference.smsOptIn) return { eligible: true, reason: "تواصل تسويقي عبر SMS مع موافقة." };
  if (channel === "WHATSAPP" && preference.whatsappOptIn) return { eligible: true, reason: "تواصل تسويقي عبر واتساب مع موافقة." };

  return { eligible: false, reason: "التواصل التسويقي يحتاج موافقة واضحة على نفس القناة." };
}
