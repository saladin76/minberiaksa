import { prisma } from "@/lib/prisma";
import type { AiAuditLogEntry, AiAuditStatus, AiAssistantContextKey, AiToolName } from "./ai-core-types";

const MAX_AUDIT_ENTRIES = 50;
const auditEntries: AiAuditLogEntry[] = [];

type AiOperationRunDelegate = {
  create(args: {
    data: {
      action: string;
      context: string;
      requestedTool?: string | null;
      promptPreview?: string | null;
      input?: Record<string, unknown>;
      output?: Record<string, unknown> | null;
      status: string;
      riskLevel: string;
      humanApprovalRequired: boolean;
      error?: string | null;
    };
  }): Promise<unknown>;
};

function auditId() {
  return globalThis.crypto?.randomUUID?.() ?? `ai-audit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizePrompt(prompt: string) {
  return prompt
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted-openai-key]")
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 1200);
}

function getAiOperationRunDelegate(): AiOperationRunDelegate | null {
  const prismaWithAiOperationRun = prisma as unknown as { aiOperationRun?: AiOperationRunDelegate };
  return prismaWithAiOperationRun.aiOperationRun ?? null;
}

function riskLevelForStatus(status: AiAuditStatus) {
  return status === "FAILED" || status === "BLOCKED" ? "MEDIUM" : "LOW";
}

function persistAiAuditEntry(entry: AiAuditLogEntry) {
  if (!process.env.DATABASE_URL) return;
  const delegate = getAiOperationRunDelegate();
  if (!delegate) return;

  void delegate
    .create({
      data: {
        action: "AI_AUDIT_LOG",
        context: entry.context,
        requestedTool: entry.requestedTool,
        promptPreview: entry.prompt,
        input: {
          user: sanitizePrompt(entry.user).slice(0, 240),
          auditEntryId: entry.id,
          timestamp: entry.timestamp,
        },
        output: null,
        status: entry.status,
        riskLevel: riskLevelForStatus(entry.status),
        humanApprovalRequired: true,
        error: entry.status === "FAILED" || entry.status === "BLOCKED" ? entry.status : null,
      },
    })
    .catch((error) => {
      console.error("AI audit DB persistence failed", error);
    });
}

export function recordAiAuditLog(input: {
  prompt: string;
  context: AiAssistantContextKey;
  requestedTool: AiToolName | null;
  user: string;
  status: AiAuditStatus;
}) {
  const entry: AiAuditLogEntry = {
    id: auditId(),
    prompt: sanitizePrompt(input.prompt),
    context: input.context,
    requestedTool: input.requestedTool,
    user: input.user,
    timestamp: new Date().toISOString(),
    status: input.status,
  };
  auditEntries.unshift(entry);
  auditEntries.splice(MAX_AUDIT_ENTRIES);
  persistAiAuditEntry(entry);
  return entry;
}

export function listAiAuditLogEntries() {
  return [...auditEntries];
}
