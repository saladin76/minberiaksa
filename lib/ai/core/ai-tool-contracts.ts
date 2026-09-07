import type { AiAssistantContextKey, AiHumanApprovalRule, AiToolContract, AiToolName } from "./ai-core-types";

export const aiToolContracts: AiToolContract[] = [
  {
    name: "getMarketingOverview",
    title: "Marketing overview",
    description: "Reads marketing spend, revenue, ROAS, platform health, and sync summary for analysis.",
    contexts: ["marketing"],
    allowedRole: "dashboard-admin",
    allowedPermission: "ads",
    accessMode: "read-only",
    dataSource: "GET /api/admin/marketing-intelligence/overview",
    riskLevel: "low",
    requiresHumanApproval: false,
  },
  {
    name: "getCampaignLinks",
    title: "Campaign links registry",
    description: "Reads saved campaign links and identifiers for campaign diagnostics.",
    contexts: ["marketing"],
    allowedRole: "dashboard-admin",
    allowedPermission: "ads",
    accessMode: "read-only",
    dataSource: "GET /api/admin/marketing-intelligence/campaign-links",
    riskLevel: "low",
    requiresHumanApproval: false,
  },
  {
    name: "getCampaignLinkDetail",
    title: "Campaign link detail",
    description: "Reads one campaign link with performance, identifiers, recommendations, and matched donations.",
    contexts: ["marketing"],
    allowedRole: "dashboard-admin",
    allowedPermission: "ads",
    accessMode: "read-only",
    dataSource: "GET /api/admin/marketing-intelligence/campaign-links/performance?id=...",
    riskLevel: "low",
    requiresHumanApproval: false,
  },
  {
    name: "getConversionTimeline",
    title: "Donation conversion timeline",
    description: "Reads ConversionEvent timeline for a donation and summarizes sent, failed, skipped, and pending events.",
    contexts: ["marketing"],
    allowedRole: "dashboard-admin",
    allowedPermission: "ads",
    accessMode: "read-only",
    dataSource: "lib/tracking/conversion-timeline-service.getDonationConversionTimeline",
    riskLevel: "low",
    requiresHumanApproval: false,
  },
  {
    name: "getTrackingTruth",
    title: "Campaign tracking truth",
    description: "Reads tracking truth diagnostics for matched donations without retrying or sending conversions.",
    contexts: ["marketing"],
    allowedRole: "dashboard-admin",
    allowedPermission: "ads",
    accessMode: "read-only",
    dataSource: "GET /api/admin/marketing-intelligence/campaign-links/performance trackingTruth",
    riskLevel: "low",
    requiresHumanApproval: false,
  },
  {
    name: "getContentSchedule",
    title: "Content schedule",
    description: "Reads scheduled content and internal reminders for planning and prioritization.",
    contexts: ["content"],
    allowedRole: "dashboard-admin",
    allowedPermission: "ads",
    accessMode: "read-only",
    dataSource: "lib/operations/scheduler/scheduler-service.getSchedulerOverview",
    riskLevel: "low",
    requiresHumanApproval: false,
  },
  {
    name: "getProductionBoard",
    title: "Production board",
    description: "Reads production items, stages, priorities, and handoff readiness.",
    contexts: ["content"],
    allowedRole: "dashboard-admin",
    allowedPermission: "ads",
    accessMode: "read-only",
    dataSource: "lib/operations/production/production-service.getProductionBoardOverview",
    riskLevel: "low",
    requiresHumanApproval: false,
  },
  {
    name: "getArchiveSummary",
    title: "Archive summary",
    description: "Reads archive assets, tags, status, and reuse readiness.",
    contexts: ["archive", "content"],
    allowedRole: "dashboard-admin",
    allowedPermission: "ads",
    accessMode: "read-only",
    dataSource: "lib/operations/archive/archive-service.getArchiveOverview",
    riskLevel: "low",
    requiresHumanApproval: false,
  },
  {
    name: "getBrandRules",
    title: "Brand rules",
    description: "Reads organization tone, colors, usage rules, and contact lines for brand-safe drafts.",
    contexts: ["brand", "marketing", "content", "archive"],
    allowedRole: "dashboard-admin",
    allowedPermission: "ads",
    accessMode: "read-only",
    dataSource: "lib/brand/brand-service.getBrandCenterOverview",
    riskLevel: "low",
    requiresHumanApproval: false,
  },
];

export const aiHumanApprovalRules: AiHumanApprovalRule[] = [
  {
    key: "no-auto-send",
    action: "Send messages",
    rule: "AI may draft WhatsApp, email, SMS, or social copy, but a human must approve and trigger sending.",
    riskLevel: "high",
  },
  {
    key: "no-auto-publish",
    action: "Publish content",
    rule: "AI may propose content, but it must not publish pages, posts, ads, files, or archive changes.",
    riskLevel: "high",
  },
  {
    key: "no-budget-change",
    action: "Change budgets",
    rule: "AI may recommend budget changes, but it must not apply spend, bids, campaign status, or platform budget changes.",
    riskLevel: "high",
  },
  {
    key: "no-tracking-settings-change",
    action: "Change tracking settings",
    rule: "AI may diagnose tracking gaps, but it must not edit pixels, CAPI, GA4, Google Ads, TikTok, X, or retry settings.",
    riskLevel: "high",
  },
];

export function getAiToolContractsForContext(context: AiAssistantContextKey) {
  return aiToolContracts.filter((tool) => tool.contexts.includes(context));
}

export function findAiToolContract(name: string | null | undefined): AiToolContract | null {
  if (!name) return null;
  return aiToolContracts.find((tool) => tool.name === name) ?? null;
}

export function isAiToolName(value: string | null | undefined): value is AiToolName {
  return Boolean(findAiToolContract(value));
}
