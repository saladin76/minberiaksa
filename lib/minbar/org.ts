/**
 * The foundation's own published details.
 *
 * These are facts about a real, registered organisation  a licence number, a
 * street address, a phone line someone answers  so they live in one place and
 * are never retyped into a page. The Footer, the about page and the contact
 * page all read from here; if the foundation moves office, this file changes
 * and every page follows.
 *
 * Values carried verbatim from `Minbar/من نحن.dc.html` and `Minbar/Footer.dc.html`.
 */
export const ORG = {
  /** Registered Turkish association name, as it appears on the licence. */
  legalName: "Minber-i Aksâ Derneği",
  /** Turkish association licence number. Rendered LTR-isolated in RTL pages. */
  licenseNumber: "245/062-23",
  address: "Haseki Sultan Mah. Turgut Özal Millet Cad. No:55 Daire:4 Fatih/İstanbul",
  email: "info@minberiaksa.org",
  /** The phone line for calls (the Turkish line, answered by staff). Owner, 2026-11-18. */
  phone: "+90 539 843 60 50",
  /** WhatsApp: the site's single WhatsApp Business number — the one the dashboard inbox reads (owner, 2026-11-18). */
  whatsappDisplay: "+90 531 337 59 53",
  whatsapp: "905313375953",
} as const;

/** `tel:` href for {@link ORG.phone}  spaces are not valid in a tel URI. */
export const ORG_TEL = `tel:${ORG.phone.replace(/\s/g, "")}`;

/** WhatsApp deep link for {@link ORG.whatsapp}. */
export const ORG_WHATSAPP = `https://wa.me/${ORG.whatsapp}`;
