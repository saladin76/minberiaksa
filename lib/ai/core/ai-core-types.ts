export type AiAssistantContextKey = "marketing" | "content" | "archive" | "brand";

export type AiAssistantCapability =
  | "ANALYZE_RESULTS"
  | "WRITE_COPY"
  | "PLAN_CONTENT"
  | "SEARCH_ARCHIVE"
  | "BRAND_GUARDRAILS"
  | "SUMMARIZE_EXECUTIVE";

export type AiAssistantContextDefinition = {
  key: AiAssistantContextKey;
  title: string;
  description: string;
  systemRole: string;
  capabilities: AiAssistantCapability[];
  allowedSources: string[];
  blockedActions: string[];
  entryHref: string;
};

export type AiToolName =
  | "getMarketingOverview"
  | "getCampaignLinks"
  | "getCampaignLinkDetail"
  | "getConversionTimeline"
  | "getTrackingTruth"
  | "getContentSchedule"
  | "getProductionBoard"
  | "getArchiveSummary"
  | "getBrandRules";

export type AiToolAccessMode = "read-only" | "write-proposed";
export type AiToolRiskLevel = "low" | "medium" | "high";

export type AiToolContract = {
  name: AiToolName;
  title: string;
  description: string;
  contexts: AiAssistantContextKey[];
  allowedRole: string;
  allowedPermission: string;
  accessMode: AiToolAccessMode;
  dataSource: string;
  riskLevel: AiToolRiskLevel;
  requiresHumanApproval: boolean;
};

export type AiHumanApprovalRule = {
  key: string;
  action: string;
  rule: string;
  riskLevel: AiToolRiskLevel;
};

export type AiProviderStatus = {
  provider: "openai";
  configured: boolean;
  externalCallsEnabled: boolean;
  model: string | null;
  baseUrl: string;
  mode: "safe-fallback" | "ready";
  reason: string;
};

export type AiAuditStatus = "RECEIVED" | "COMPLETED" | "FALLBACK" | "BLOCKED" | "FAILED";

export type AiAuditLogEntry = {
  id: string;
  prompt: string;
  context: AiAssistantContextKey;
  requestedTool: AiToolName | null;
  user: string;
  timestamp: string;
  status: AiAuditStatus;
};

export type AiCoreOverview = {
  source: string;
  generatedAt: string;
  summary: {
    contexts: number;
    capabilities: number;
    protectedActions: number;
    toolContracts: number;
  };
  contexts: AiAssistantContextDefinition[];
  toolContracts: AiToolContract[];
  humanApprovalRules: AiHumanApprovalRule[];
  provider: AiProviderStatus;
  audit: {
    mode: "memory-foundation";
    recent: AiAuditLogEntry[];
  };
};

export type AiDraftResponse = {
  context: AiAssistantContextKey;
  mode: "SKELETON" | "SAFE_FALLBACK" | "OPENAI";
  title: string;
  answer: string;
  requestedTool: AiToolName | null;
  auditId: string;
  provider: AiProviderStatus;
  suggestedNextActions: string[];
  safety: {
    requiresHumanApproval: boolean;
    blockedActions: string[];
  };
};

export type AiAssistantReadiness = {
  context: AiAssistantContextDefinition;
  tools: AiToolContract[];
  humanApprovalRules: AiHumanApprovalRule[];
  provider: AiProviderStatus;
  promptExamples: string[];
};
