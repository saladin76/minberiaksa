/** Pure helpers for safely resolving communication UTMs to their campaign. */

export type CampaignUtmLink = {
  campaignId: string;
  url: string;
  source?: string | null;
  medium?: string | null;
  origin?: "whatsapp-template" | "archived-email";
};

export type CampaignTemplateRef = {
  campaignId: string;
  channel: string;
  templateId: string | null;
};

export type WhatsAppTemplateSchema = {
  templateId: string;
  componentsSchema: unknown;
};

type AttributionLike = Record<string, unknown> | null | undefined;
export const COMMUNICATION_UTM_MEDIUM_VALUES = ["communication", "messaging", "whatsapp", "wa", "email", "sms"] as const;
const COMMUNICATION_UTM_MEDIUMS: ReadonlySet<string> = new Set(COMMUNICATION_UTM_MEDIUM_VALUES);

export function isCommunicationUtmMedium(value: unknown): boolean {
  const medium = normalized(text(value));
  return medium !== null && COMMUNICATION_UTM_MEDIUMS.has(medium);
}

/** Reads the actual approved WhatsApp button destinations tied to campaigns. */
export function campaignUtmLinksFromWhatsAppTemplates(
  campaigns: readonly CampaignTemplateRef[],
  templates: readonly WhatsAppTemplateSchema[],
): CampaignUtmLink[] {
  const urlsByTemplate = new Map<string, string[]>();
  for (const template of templates) {
    const components = Array.isArray(template.componentsSchema) ? template.componentsSchema : [];
    const urls: string[] = [];
    for (const rawComponent of components) {
      if (!rawComponent || typeof rawComponent !== "object") continue;
      const component = rawComponent as { type?: unknown; buttons?: unknown };
      if (String(component.type ?? "").toUpperCase() !== "BUTTONS" || !Array.isArray(component.buttons)) continue;
      for (const rawButton of component.buttons) {
        if (!rawButton || typeof rawButton !== "object") continue;
        const button = rawButton as { type?: unknown; url?: unknown };
        const url = text(button.url);
        if (String(button.type ?? "").toUpperCase() === "URL" && url) urls.push(url);
      }
    }
    urlsByTemplate.set(template.templateId, urls);
  }

  const links: CampaignUtmLink[] = [];
  for (const campaign of campaigns) {
    if (campaign.channel.toUpperCase() !== "WHATSAPP" || !campaign.templateId) continue;
    for (const url of urlsByTemplate.get(campaign.templateId) ?? []) {
      links.push({ campaignId: campaign.campaignId, url, source: "whatsapp", medium: "communication", origin: "whatsapp-template" });
    }
  }
  return links;
}

/** A registered companion link does not change a Meta-approved static button. */
export function campaignsNeedingTrackedTemplate(links: readonly CampaignUtmLink[]): string[] {
  const blocked = new Set<string>();
  for (const link of links) {
    if (link.origin !== "whatsapp-template") continue;
    const params = paramsFor(link.url);
    if (!params || !isCommunicationUtmMedium(params.get("utm_medium"))) continue;
    if (params.get("utm_id") === link.campaignId || params.get("utm_campaign") === link.campaignId) continue;
    if (!/\{\{\s*(?:\d+|[a-z][a-z0-9_]*)\s*\}\}$/.test(link.url)) blocked.add(link.campaignId);
  }
  return [...blocked];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalized(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase() || null;
}

function paramsFor(url: string): URLSearchParams | null {
  try {
    return new URL(url, "https://minberiaksa.org").searchParams;
  } catch {
    return null;
  }
}

function key(parts: Array<string | null>): string | null {
  if (parts.some((part) => !part)) return null;
  return parts.join("\u001f");
}

/**
 * Indexes real UTM values found in registered links. An alias shared by two
 * campaigns is marked ambiguous and can never credit either campaign.
 */
export function buildUniqueCampaignUtmAliases(
  links: readonly CampaignUtmLink[],
): Map<string, string | null> {
  const owners = new Map<string, string | null>();

  const add = (identity: string | null, campaignId: string) => {
    if (!identity) return;
    const previous = owners.get(identity);
    if (previous === undefined) owners.set(identity, campaignId);
    else if (previous !== campaignId) owners.set(identity, null);
  };

  for (const link of links) {
    const params = paramsFor(link.url);
    if (!params) continue;
    const campaign = normalized(params.get("utm_campaign"));
    const medium = normalized(params.get("utm_medium") ?? link.medium);
    const source = normalized(params.get("utm_source") ?? link.source);
    if (!campaign || !isCommunicationUtmMedium(medium)) continue;

    // The source-specific key is preferred. The source-free key is used only
    // when that UTM still has one unambiguous owner across all channels.
    add(key([source, medium, campaign]), link.campaignId);
    if (medium === "communication") add(key([medium, campaign]), link.campaignId);
  }

  return owners;
}

/** Returns a campaign only for an exact campaign id or a unique registered UTM. */
export function resolveCommunicationCampaignId(
  attribution: AttributionLike,
  campaignIds: ReadonlySet<string>,
  aliases: ReadonlyMap<string, string | null>,
): string | null {
  if (!attribution) return null;
  const medium = normalized(text(attribution.utm_medium));
  if (!isCommunicationUtmMedium(medium)) return null;

  const utmCampaign = text(attribution.utm_campaign);
  const explicit = [utmCampaign, text(attribution.campaign_id), text(attribution.utm_id)]
    .filter((value): value is string => !!value && (/^[a-f0-9]{24}$/i.test(value) || campaignIds.has(value)));
  if (explicit.length) {
    // A campaign outside the current list, or contradictory explicit IDs,
    // cannot fall back to another campaign's generic alias.
    const unique = new Set(explicit);
    return unique.size === 1 && campaignIds.has(explicit[0]) ? explicit[0] : null;
  }

  if (!utmCampaign) return null;
  const source = normalized(text(attribution.utm_source));
  const campaign = normalized(utmCampaign);
  const sourceSpecific = source ? aliases.get(key([source, medium, campaign])!) : undefined;
  const owner = sourceSpecific === undefined && medium === "communication"
    ? aliases.get(key([medium, campaign])!)
    : sourceSpecific;
  return owner && campaignIds.has(owner) ? owner : null;
}
