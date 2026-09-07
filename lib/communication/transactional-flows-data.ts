import type { TransactionalFlow } from "./communication-types";

export const foundationTransactionalFlows: TransactionalFlow[] = [
  {
    id: "flow_donation_success",
    eventKey: "donation.success",
    title: "تأكيد التبرع الناجح",
    status: "DRAFT",
    steps: [
      { id: "success_email_receipt", channel: "EMAIL", providerKey: "ELASTIC_EMAIL", templateId: "donation_thank_you_tr", delayMinutes: 0, requiresConsent: false },
      { id: "success_whatsapp_thanks", channel: "WHATSAPP", providerKey: "META_WHATSAPP", templateId: "donation_thank_you_tr", delayMinutes: 10, requiresConsent: true },
    ],
  },
  {
    id: "flow_payment_failed",
    eventKey: "payment.failed",
    title: "فشل محاولة الدفع",
    status: "DRAFT",
    steps: [
      { id: "failed_email_retry", channel: "EMAIL", providerKey: "ELASTIC_EMAIL", templateId: "payment_failed_retry", delayMinutes: 5, requiresConsent: false },
      { id: "failed_sms_retry", channel: "SMS", providerKey: "BREVO_SMS", templateId: "payment_failed_retry_sms", delayMinutes: 60, requiresConsent: true, fallbackProviderKey: "SMS_FALLBACK" },
    ],
  },
  {
    id: "flow_receipt_issued",
    eventKey: "receipt.issued",
    title: "إصدار إيصال التبرع",
    status: "DRAFT",
    steps: [
      { id: "receipt_email", channel: "EMAIL", providerKey: "ELASTIC_EMAIL", templateId: "receipt_email", delayMinutes: 0, requiresConsent: false },
    ],
  },
  {
    id: "flow_monthly_failed",
    eventKey: "monthly_donation.failed",
    title: "فشل خصم التبرع الشهري",
    status: "DRAFT",
    steps: [
      { id: "monthly_failed_email", channel: "EMAIL", providerKey: "ELASTIC_EMAIL", templateId: "monthly_failed_email", delayMinutes: 15, requiresConsent: false },
      { id: "monthly_failed_whatsapp", channel: "WHATSAPP", providerKey: "META_WHATSAPP", templateId: "monthly_failed_whatsapp", delayMinutes: 120, requiresConsent: true },
    ],
  },
  {
    id: "flow_large_donation_thanks",
    eventKey: "donation.large",
    title: "شكر خاص للتبرعات الكبيرة",
    status: "DRAFT",
    steps: [
      { id: "large_donation_email", channel: "EMAIL", providerKey: "ELASTIC_EMAIL", templateId: "large_donation_thanks", delayMinutes: 0, requiresConsent: false },
      { id: "large_donation_whatsapp", channel: "WHATSAPP", providerKey: "META_WHATSAPP", templateId: "large_donation_thanks", delayMinutes: 30, requiresConsent: true },
    ],
  },
];
