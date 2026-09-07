import type { ContactPreference } from "./communication-types";

export const foundationContactPreferences: ContactPreference[] = [
  {
    contactId: "sample_donor_istanbul",
    emailOptIn: true,
    smsOptIn: false,
    whatsappOptIn: true,
    preferredLanguage: "tr",
    countryCode: "TR",
    doNotContact: false,
    consentSource: "foundation-sample",
    lastConsentAt: "2026-01-01T00:00:00.000Z",
  },
  {
    contactId: "sample_donor_global",
    emailOptIn: true,
    smsOptIn: false,
    whatsappOptIn: false,
    preferredLanguage: "en",
    countryCode: "GLOBAL",
    doNotContact: false,
    consentSource: "foundation-sample",
    lastConsentAt: "2026-01-01T00:00:00.000Z",
  },
];
