/**
 * UTM / tracking-URL builder for Twilio WhatsApp template buttons + links.
 *
 * Every donation link that goes out via Twilio should carry a consistent set
 * of UTM params + Twilio-specific identifiers so the Ads Intelligence
 * dashboard can attribute donations back to the right template + variant +
 * button. This module centralizes the param contract.
 *
 * Future modules (Marketing Intelligence, Twilio campaign analytics) read
 * the same param contract from `attribution` on the donation row.
 */

export interface TrackedUrlInput {
  baseUrl: string;
  /** Stable identifier for the marketing campaign (e.g. campaign slug). */
  campaignSlug?: string | null;
  templateName?: string | null;
  templateId?: string | null;
  /** Twilio Campaign ID — when a SentMessage is part of a bulk send. */
  twilioCampaignId?: string | null;
  /** Variant / A-B test key. */
  messageVariant?: string | null;
  /** Audience segment (e.g. "monthly_donors", "lapsed_30d"). */
  audienceSegment?: string | null;
  language?: string | null;
  targetCountry?: string | null;
  /** Multiple buttons in one template — index/label/position. */
  buttonId?: string | null;
  buttonLabel?: string | null;
  linkPosition?: number | null;
}

/** Build a tracked URL by appending the standard Twilio-WhatsApp UTM contract. */
export function buildTwilioTrackedUrl(input: TrackedUrlInput): string {
  if (!input.baseUrl) return input.baseUrl;
  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    // Not a fully-qualified URL — append as a query string fragment.
    const sep = input.baseUrl.includes("?") ? "&" : "?";
    return `${input.baseUrl}${sep}${queryStringFromInput(input)}`;
  }
  applyParams(url.searchParams, input);
  return url.toString();
}

function queryStringFromInput(input: TrackedUrlInput): string {
  const params = new URLSearchParams();
  applyParams(params, input);
  return params.toString();
}

function applyParams(params: URLSearchParams, input: TrackedUrlInput) {
  set(params, "utm_source", "twilio");
  set(params, "utm_medium", "whatsapp");
  set(params, "channel", "twilio_whatsapp");
  set(params, "utm_campaign", input.campaignSlug);
  set(params, "utm_content", input.templateName);
  set(params, "utm_term", input.audienceSegment);
  set(params, "twilio_campaign_id", input.twilioCampaignId);
  set(params, "twilio_template_id", input.templateId);
  set(params, "message_variant", input.messageVariant);
  set(params, "language", input.language);
  set(params, "target_country", input.targetCountry);
  set(params, "button_id", input.buttonId);
  set(params, "button_label", input.buttonLabel);
  if (input.linkPosition != null) {
    params.set("link_position", String(input.linkPosition));
  }
}

function set(params: URLSearchParams, key: string, value: string | null | undefined) {
  if (value == null) return;
  const v = String(value).trim();
  if (!v) return;
  params.set(key, v);
}

/** Given a template + button, return the URL we'd render in production. */
export function buildButtonTrackedUrl(opts: {
  baseUrl: string;
  template: {
    id: string;
    name: string;
    externalTemplateId?: string | null;
    language?: string | null;
  };
  button: { text: string; index: number };
  campaignSlug?: string | null;
  twilioCampaignId?: string | null;
  audienceSegment?: string | null;
  targetCountry?: string | null;
  messageVariant?: string | null;
}): string {
  return buildTwilioTrackedUrl({
    baseUrl: opts.baseUrl,
    campaignSlug: opts.campaignSlug,
    templateName: opts.template.name,
    templateId: opts.template.externalTemplateId ?? opts.template.id,
    twilioCampaignId: opts.twilioCampaignId,
    messageVariant: opts.messageVariant,
    audienceSegment: opts.audienceSegment,
    language: opts.template.language,
    targetCountry: opts.targetCountry,
    buttonId: `btn_${opts.button.index}`,
    buttonLabel: opts.button.text,
    linkPosition: opts.button.index + 1,
  });
}
