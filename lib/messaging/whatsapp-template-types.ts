/** Shared WhatsApp presentation types. No provider client or credentials. */
export type WhatsappTemplateKind =
  | "text"
  | "media"
  | "card"
  | "quick_reply"
  | "call_to_action"
  | "list_picker"
  | "location";

export type WhatsappButtonType =
  | "url"
  | "phone"
  | "quick_reply"
  | "copy_code"
  | "donation_cta"
  | "tracking_url";

export type WhatsappApprovalStatus =
  | "approved"
  | "pending"
  | "rejected"
  | "unknown";

export interface NormalizedHeader {
  type: "text" | "image" | "video" | "document" | "location";
  text: string | null;
  mediaUrl: string | null;
  mediaSid: string | null;
  mimeType: string | null;
  fileName: string | null;
  previewUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}

export interface NormalizedButton {
  type: WhatsappButtonType;
  text: string;
  url: string | null;
  phoneNumber: string | null;
  payload: string | null;
  index: number;
}

export interface NormalizedVariable {
  /** Provider variable position or name. */
  key: string;
  exampleValue: string | null;
  /** Best-effort mapping to one of our `TemplateContext` paths (e.g. `user.name`). */
  mapping: string | null;
  validationStatus: "ok" | "missing_example" | "unknown_mapping";
}

export interface NormalizedTemplate {
  externalTemplateId: string;
  name: string;
  language: string;
  category: string | null;
  approvalStatus: WhatsappApprovalStatus;
  templateType: WhatsappTemplateKind;
  body: string;
  header: NormalizedHeader | null;
  footerText: string | null;
  buttons: NormalizedButton[];
  variables: NormalizedVariable[];
  /** Sanitized provider payload  credentials / tokens removed. */
  providerRaw: Record<string, unknown>;
}
