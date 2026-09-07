export const MESSAGE_SUBJECTS = [
  "COMPLAINT",
  "DONATION_ISSUE",
  "CAMPAIGN_SUPPORT",
  "PARTNERSHIP",
  "VOLUNTEERING",
  "GENERAL",
] as const;

export type MessageSubject = (typeof MESSAGE_SUBJECTS)[number];

const PREFIX = "[SUBJECT:";

export function isMessageSubject(value: unknown): value is MessageSubject {
  return typeof value === "string" && (MESSAGE_SUBJECTS as readonly string[]).includes(value);
}

export function encodeMessageBodyWithSubject(body: string, subject: MessageSubject): string {
  return `${PREFIX}${subject}] ${body}`;
}

export function decodeMessageBodySubject(rawBody: string): {
  subject: MessageSubject;
  body: string;
} {
  const body = typeof rawBody === "string" ? rawBody : "";
  const match = body.match(/^\[SUBJECT:([A-Z_]+)\]\s*/);
  const parsed = match?.[1];
  if (isMessageSubject(parsed)) {
    return {
      subject: parsed,
      body: body.replace(/^\[SUBJECT:[A-Z_]+\]\s*/, ""),
    };
  }
  return { subject: "GENERAL", body };
}

export function subjectPrefix(subject: MessageSubject): string {
  return `${PREFIX}${subject}]`;
}

export function subjectLabel(subject: MessageSubject, locale?: string): string {
  const l = locale || "ar";
  const isAr = l.startsWith("ar");
  const isFr = l.startsWith("fr");
  const isEs = l.startsWith("es");
  const isId = l.startsWith("id");
  const isPt = l.startsWith("pt");
  const isTr = l.startsWith("tr");

  if (subject === "COMPLAINT") {
    if (isAr) return "شكوى";
    if (isFr) return "Plainte";
    if (isEs) return "Queja";
    if (isId) return "Keluhan";
    if (isPt) return "Reclamacao";
    if (isTr) return "Sikayet";
    return "Complaint";
  }
  if (subject === "DONATION_ISSUE") {
    if (isAr) return "مشكلة تبرع";
    if (isFr) return "Problème de don";
    if (isEs) return "Problema de donacion";
    if (isId) return "Masalah donasi";
    if (isPt) return "Problema na doacao";
    if (isTr) return "Bagis sorunu";
    return "Donation Issue";
  }
  if (subject === "CAMPAIGN_SUPPORT") {
    if (isAr) return "دعم مشروع";
    if (isFr) return "Support campagne";
    if (isEs) return "Soporte de campana";
    if (isId) return "Dukungan kampanye";
    if (isPt) return "Suporte de campanha";
    if (isTr) return "Kampanya destegi";
    return "Campaign Support";
  }
  if (subject === "PARTNERSHIP") {
    if (isAr) return "شراكة";
    if (isFr) return "Partenariat";
    if (isEs) return "Alianza";
    if (isId) return "Kemitraan";
    if (isPt) return "Parceria";
    if (isTr) return "Ortaklik";
    return "Partnership";
  }
  if (subject === "VOLUNTEERING") {
    if (isAr) return "تطوع";
    if (isFr) return "Bénévolat";
    if (isEs) return "Voluntariado";
    if (isId) return "Kerelawanan";
    if (isPt) return "Voluntariado";
    if (isTr) return "Gonulluluk";
    return "Volunteering";
  }
  if (isAr) return "استفسار عام";
  if (isFr) return "Demande générale";
  if (isEs) return "Consulta general";
  if (isId) return "Pertanyaan umum";
  if (isPt) return "Consulta geral";
  if (isTr) return "Genel talep";
  return "General Inquiry";
}
