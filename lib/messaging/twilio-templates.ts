/**
 * Twilio Content API → internal WhatsApp template shape.
 *
 * Twilio's Content API (`/v1/Content`) returns a `types` map keyed by template
 * variant: `twilio/text`, `twilio/media`, `twilio/quick-reply`,
 * `twilio/call-to-action`, `twilio/card`, `twilio/list-picker`, `twilio/location`.
 *
 * This module:
 *   1. Pulls a credential check that never crashes the dashboard.
 *   2. Lists / fetches templates (returns `missing_config` / `not_implemented`
 *      / `failed` instead of throwing).
 *   3. Maps the Twilio shape to our typed `NormalizedTemplate` (header / body /
 *      footer / buttons / variables) so the dashboard can store + render it.
 *
 * Does NOT include the Twilio auth token in any output and never logs it.
 */
import twilio from "twilio";

export type SyncStatus = "ok" | "missing_config" | "not_implemented" | "failed";

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
  /** "1", "2" or named — what Twilio uses. */
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
  /** Sanitized provider payload — credentials / tokens removed. */
  providerRaw: Record<string, unknown>;
}

export interface SyncResult {
  status: SyncStatus;
  /** Friendly Arabic message for the dashboard. */
  messageAr: string;
  templates: NormalizedTemplate[];
  /** When status="failed", a short error string (no credentials). */
  error?: string;
}

const MAX_LIST = 200;

function getCredentials(): { sid: string; token: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return { sid, token };
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const KNOWN_VARIABLE_MAPPINGS: Record<string, string> = {
  donor_name: "user.name",
  user_name: "user.name",
  name: "user.name",
  donor: "user.name",
  campaign: "donation.campaignTitle",
  campaign_name: "donation.campaignTitle",
  amount: "donation.amount",
  amount_usd: "donation.amountUSD",
  currency: "donation.currency",
  country: "user.countryName",
  language: "user.preferredLang",
  link: "donation_link",
  donation_link: "donation_link",
};

function mapVariableName(key: string, example: string | null): NormalizedVariable {
  const lc = key.toLowerCase();
  const mapping = KNOWN_VARIABLE_MAPPINGS[lc] ?? null;
  return {
    key,
    exampleValue: example,
    mapping,
    validationStatus: !example
      ? "missing_example"
      : mapping
      ? "ok"
      : "unknown_mapping",
  };
}

/** Detect the most specific template kind present in Twilio's `types` map. */
function detectKind(types: Record<string, unknown>): WhatsappTemplateKind {
  if (types["twilio/card"]) return "card";
  if (types["twilio/list-picker"]) return "list_picker";
  if (types["twilio/quick-reply"]) return "quick_reply";
  if (types["twilio/call-to-action"]) return "call_to_action";
  if (types["twilio/media"]) return "media";
  if (types["twilio/location"]) return "location";
  return "text";
}

function classifyMediaMime(mime: string | null): NormalizedHeader["type"] {
  if (!mime) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return "document";
}

interface TwilioActionLike {
  type?: string;
  title?: string;
  text?: string;
  url?: string;
  phone?: string;
  phone_number?: string;
  id?: string;
  payload?: string;
  code?: string;
}

function classifyButton(action: TwilioActionLike, index: number): NormalizedButton {
  const text = asString(action.title) ?? asString(action.text) ?? "";
  const url = asString(action.url);
  const phone = asString(action.phone) ?? asString(action.phone_number);
  const payload = asString(action.id) ?? asString(action.payload);
  const code = asString(action.code);
  const t = (action.type ?? "").toLowerCase();

  let type: WhatsappButtonType = "quick_reply";
  if (t.includes("url") && url) type = "url";
  else if (t.includes("phone") || phone) type = "phone";
  else if (t.includes("copy") || code) type = "copy_code";
  else if (url) type = "url";

  // Tag donation CTAs explicitly so analytics can group them.
  if (type === "url" && /donate|تبرع|donation/i.test(text + " " + (url ?? ""))) {
    type = "donation_cta";
  }

  return {
    type,
    text,
    url: url ?? (code ?? null),
    phoneNumber: phone,
    payload,
    index,
  };
}

function extractVariables(twilioVariables: unknown): NormalizedVariable[] {
  if (!twilioVariables || typeof twilioVariables !== "object") return [];
  const out: NormalizedVariable[] = [];
  for (const [k, v] of Object.entries(twilioVariables as Record<string, unknown>)) {
    out.push(mapVariableName(k, asString(v)));
  }
  return out;
}

function buildHeader(typesEntry: Record<string, unknown> | null | undefined): NormalizedHeader | null {
  if (!typesEntry) return null;
  // twilio/media: { body, media: [url], content_type? }
  const mediaRaw = typesEntry["media"];
  if (Array.isArray(mediaRaw) && mediaRaw.length > 0) {
    const m0 = mediaRaw[0];
    const url = typeof m0 === "string" ? m0 : asString((m0 as Record<string, unknown>)?.["url"]);
    const sid = typeof m0 === "object" && m0 ? asString((m0 as Record<string, unknown>)?.["sid"]) : null;
    const mime = asString(typesEntry["content_type"]) ?? asString((m0 as Record<string, unknown>)?.["content_type"]);
    return {
      type: classifyMediaMime(mime),
      text: null,
      mediaUrl: url,
      mediaSid: sid,
      mimeType: mime,
      fileName: asString((m0 as Record<string, unknown>)?.["file_name"]),
      previewUrl: asString((m0 as Record<string, unknown>)?.["preview_url"]),
      latitude: null,
      longitude: null,
      address: null,
    };
  }
  // twilio/location
  const lat = asNumber(typesEntry["latitude"]);
  const lng = asNumber(typesEntry["longitude"]);
  if (lat != null && lng != null) {
    return {
      type: "location",
      text: asString(typesEntry["label"]),
      mediaUrl: null,
      mediaSid: null,
      mimeType: null,
      fileName: null,
      previewUrl: null,
      latitude: lat,
      longitude: lng,
      address: asString(typesEntry["address"]),
    };
  }
  return null;
}

function classifyApproval(raw: Record<string, unknown>): WhatsappApprovalStatus {
  // Twilio approval status is under `approval_requests` or `whatsapp.approval`.
  const whatsapp = (raw["whatsapp"] as Record<string, unknown> | undefined) ?? undefined;
  const approval =
    asString(whatsapp?.["status"]) ??
    asString((raw["approval_status"] as string | undefined) ?? null) ??
    "";
  const lc = approval.toLowerCase();
  if (lc.includes("approved")) return "approved";
  if (lc.includes("rejected")) return "rejected";
  if (lc.includes("pending")) return "pending";
  return "unknown";
}

function classifyCategory(raw: Record<string, unknown>): string | null {
  const whatsapp = (raw["whatsapp"] as Record<string, unknown> | undefined) ?? undefined;
  return asString(whatsapp?.["category"]) ?? asString(raw["category"]);
}

function sanitizeRaw(raw: Record<string, unknown>): Record<string, unknown> {
  // Defensive copy — drop anything that looks like a credential.
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (/auth|secret|token|password|api[_-]?key/i.test(k)) continue;
    clone[k] = v;
  }
  return clone;
}

/** Map a raw Twilio Content resource to our internal `NormalizedTemplate`. */
export function normalizeTwilioContent(
  raw: Record<string, unknown>
): NormalizedTemplate | null {
  const externalTemplateId = asString(raw["sid"]) ?? asString(raw["id"]);
  if (!externalTemplateId) return null;
  const name =
    asString(raw["friendly_name"]) ??
    asString(raw["name"]) ??
    externalTemplateId;
  const language = asString(raw["language"]) ?? "ar";
  const types =
    (raw["types"] as Record<string, unknown> | undefined) ??
    (raw["Types"] as Record<string, unknown> | undefined) ??
    {};
  const kind = detectKind(types);

  const primaryEntry = (() => {
    switch (kind) {
      case "card":
        return types["twilio/card"];
      case "list_picker":
        return types["twilio/list-picker"];
      case "quick_reply":
        return types["twilio/quick-reply"];
      case "call_to_action":
        return types["twilio/call-to-action"];
      case "media":
        return types["twilio/media"];
      case "location":
        return types["twilio/location"];
      default:
        return types["twilio/text"];
    }
  })() as Record<string, unknown> | undefined;

  const body =
    asString(primaryEntry?.["body"]) ??
    asString(types["twilio/text"] as Record<string, unknown> | undefined)?.toString() ??
    asString(primaryEntry?.["title"]) ??
    "";
  const footerText = asString(primaryEntry?.["footer"]);

  const header = kind === "media" || kind === "location" ? buildHeader(primaryEntry) : null;

  const actionsRaw =
    (primaryEntry?.["actions"] as TwilioActionLike[] | undefined) ??
    (primaryEntry?.["buttons"] as TwilioActionLike[] | undefined) ??
    [];
  const buttons = Array.isArray(actionsRaw)
    ? actionsRaw.map((a, i) => classifyButton(a, i))
    : [];

  const variables = extractVariables(raw["variables"]);

  return {
    externalTemplateId,
    name,
    language,
    category: classifyCategory(raw),
    approvalStatus: classifyApproval(raw),
    templateType: kind,
    body,
    header,
    footerText,
    buttons,
    variables,
    providerRaw: sanitizeRaw(raw),
  };
}

/**
 * Fetch all Twilio Content templates for the configured account. Never throws —
 * returns a typed `SyncResult` so the dashboard can show the precise state.
 */
export async function syncTwilioWhatsappTemplates(): Promise<SyncResult> {
  const creds = getCredentials();
  if (!creds) {
    return {
      status: "missing_config",
      messageAr:
        "TWILIO_ACCOUNT_SID و TWILIO_AUTH_TOKEN غير مُعدّان في البيئة — لا يمكن جلب القوالب الآن.",
      templates: [],
    };
  }

  try {
    const client = twilio(creds.sid, creds.token);
    // Twilio's Node SDK exposes the Content API via `content.v1.contents`.
    // We defend against future SDK changes — if the resource isn't there,
    // surface `not_implemented` instead of crashing.
    const contentNs = (client as unknown as {
      content?: { v1?: { contents?: { list?: (opts?: { limit?: number }) => Promise<unknown[]> } } };
    }).content?.v1?.contents;
    if (!contentNs || typeof contentNs.list !== "function") {
      return {
        status: "not_implemented",
        messageAr:
          "Twilio Content API غير مدعوم في نسخة SDK الحالية — قم بترقية حزمة twilio لجلب القوالب.",
        templates: [],
      };
    }

    const raw = await contentNs.list({ limit: MAX_LIST });
    const normalized: NormalizedTemplate[] = [];
    for (const r of raw as unknown[]) {
      // Twilio resource objects expose `toJSON()` or are plain when JSON-parsed.
      const obj =
        typeof (r as { toJSON?: () => unknown }).toJSON === "function"
          ? ((r as { toJSON: () => unknown }).toJSON() as Record<string, unknown>)
          : (r as Record<string, unknown>);
      const mapped = normalizeTwilioContent(obj);
      if (mapped) normalized.push(mapped);
    }
    return {
      status: "ok",
      messageAr: `تم جلب ${normalized.length} قالب من Twilio.`,
      templates: normalized,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Twilio returns 20003 (auth failed), 20005 (account suspended), 404, etc.
    // Heuristic: missing API endpoint → not_implemented.
    if (/not found|404|unknown/i.test(message)) {
      return {
        status: "not_implemented",
        messageAr:
          "نقطة Twilio Content API غير متاحة — هل تم تفعيل Content API في حساب Twilio؟",
        templates: [],
        error: message.slice(0, 200),
      };
    }
    return {
      status: "failed",
      messageAr: `فشل في جلب القوالب من Twilio: ${message.slice(0, 200)}`,
      templates: [],
      error: message.slice(0, 200),
    };
  }
}

export function hasTwilioCredentials(): boolean {
  return !!getCredentials();
}
