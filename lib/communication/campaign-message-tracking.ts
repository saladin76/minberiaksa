import type { MetaComponent } from "./providers/meta-whatsapp/parameters";
import { isCommunicationUtmMedium } from "./campaign-attribution-matching";

type Campaign = { id: string; channel: string };
const SITE = "https://minberiaksa.org";

/** A dedicated approved `utm_id={{1}}` button binds to the campaign, never
 * to the body/name variable that happens to use the same position. */
export function campaignTrackingValues(schema: unknown, values: Record<string, string | null | undefined>, campaign: Campaign): Record<string, string | null | undefined> {
  const out = { ...values };
  const components = Array.isArray(schema) ? schema : [];
  for (const component of components) {
    if (component?.type?.toUpperCase() !== "BUTTONS" || !Array.isArray(component.buttons)) continue;
    component.buttons.forEach((button: { type?: string; url?: string }, index: number) => {
      if (button.type?.toUpperCase() !== "URL" || !button.url) return;
      const placeholder = /\{\{\s*(\d+|[a-z][a-z0-9_]*)\s*\}\}$/.exec(button.url);
      if (!placeholder || !/[?&]utm_id=\{\{/.test(button.url)) return;
      if (!publicDonationUrl(button.url.replace(placeholder[0], campaign.id))) return;
      out[`button.${index}.${placeholder[1]}`] = campaign.id;
    });
  }
  return out;
}

function publicDonationUrl(value: string): URL | null {
  try {
    const url = new URL(value, SITE);
    if (url.protocol !== "https:" || !["minberiaksa.org", "www.minberiaksa.org"].includes(url.hostname) || url.username || url.password) return null;
    // Receipts, sign-in, private documents and payment callback URLs carry access credentials.
    if (/\/(?:api|dashboard|auth|login|receipt|certificates?|success|failure)(?:\/|$)/i.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].some(key => /^(?:t|token|accessToken|signature|orderId|donationId)$/i.test(key))) return null;
    if (!/\/(?:bagislar|projeler|donate|donations|campaigns|zekatini-filistine-ode)(?:\/|$)/i.test(url.pathname)) return null;
    return url;
  } catch { return null; }
}

/** Only actual public donation destinations in the outgoing campaign are tagged. */
export function trackCampaignBody(body: string, campaign: Campaign): string {
  const decorate = (value: string) => {
    const url = publicDonationUrl(value.replace(/&amp;/g, "&"));
    if (!url) return value;
    url.searchParams.set("utm_source", campaign.channel.toLowerCase());
    url.searchParams.set("utm_medium", "communication");
    url.searchParams.set("utm_campaign", campaign.id);
    url.searchParams.set("utm_id", campaign.id);
    return url.toString();
  };
  if (campaign.channel === "EMAIL") {
    return body.replace(/\bhref\s*=\s*(["'])([^"']+)\1/gi, (all, quote: string, value: string) => {
      const next = decorate(value);
      return next === value ? all : `href=${quote}${next.replace(/&/g, "&amp;")}${quote}`;
    });
  }
  if (campaign.channel === "SMS") return body.replace(/https?:\/\/[^\s<>"']+/g, decorate);
  // Meta-approved static body text cannot be changed per recipient.
  return body;
}

/** Meta appends this parameter to the approved URL prefix. Append tracking only
 * to a terminal dynamic suffix, preserving the approved prefix and locale value.
 * Static buttons, external URLs and conflicting IDs are left untouched. */
export function trackCampaignMetaButtons(input: {
  campaign: Campaign; componentsSchema: unknown; components: MetaComponent[];
}): MetaComponent[] {
  const schema = Array.isArray(input.componentsSchema) ? input.componentsSchema : [];
  const buttons = schema.flatMap(component => component?.type?.toUpperCase() === "BUTTONS" && Array.isArray(component.buttons) ? component.buttons : []);
  return input.components.map(component => {
    if (component.type !== "button" || component.sub_type !== "url") return component;
    const button = buttons[Number(component.index)];
    const approved = typeof button?.url === "string" ? button.url : "";
    const placeholder = /\{\{\s*(?:\d+|[a-z][a-z0-9_]*)\s*\}\}$/.exec(approved);
    const parameter = component.parameters[0];
    if (!placeholder || parameter?.type !== "text" || component.parameters.length !== 1) return component;
    const prefix = approved.slice(0, placeholder.index);
    const current = prefix + parameter.text;
    const url = publicDonationUrl(current);
    if (!url || url.hash || url.searchParams.has("utm_id") || url.searchParams.has("campaign_id")) return component;
    const medium = url.searchParams.get("utm_medium");
    if (medium && !isCommunicationUtmMedium(medium)) return component;
    const params = new URLSearchParams({ utm_id: input.campaign.id });
    if (!medium) params.set("utm_medium", "communication");
    if (!url.searchParams.has("utm_source")) params.set("utm_source", input.campaign.channel.toLowerCase());
    const suffix = `${parameter.text}${current.includes("?") ? "&" : "?"}${params}`;
    if (suffix.length > 1024) return component;
    return { ...component, parameters: [{ ...parameter, text: suffix }] };
  });
}
