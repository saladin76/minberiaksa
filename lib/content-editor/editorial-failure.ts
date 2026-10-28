/** Stable categories for saved failures. Never infer current provider readiness from an old error. */
export const EDITORIAL_FAILURE_KINDS = ["configuration", "billing", "request", "access", "model", "temporary", "review"] as const;
export type EditorialFailureKind = typeof EDITORIAL_FAILURE_KINDS[number];
export function editorialFailure(error?: string | null) {
  const text = error || "";
  if (/AI_NOT_CONFIGURED|AI_SETTINGS_UNAVAILABLE|OPENAI_API_KEY|غير مهيأة|الاتصال المركزي/i.test(text)) return { kind: "configuration", temporary: false } as const;
  if (/رصيد|فوترة|insufficient_quota|AI_QUOTA_EXCEEDED/i.test(text)) return { kind: "billing", temporary: false } as const;
  if (/\b(?:400|422)\b|AI_INVALID_REQUEST|صيغة الطلب/i.test(text)) return { kind: "request", temporary: false } as const;
  if (/\b(?:401|403)\b|AI_ACCESS_DENIED|صلاحية الوصول/i.test(text)) return { kind: "access", temporary: false } as const;
  if (/AI_MODEL_UNAVAILABLE|النموذج المحدد غير متاح/i.test(text)) return { kind: "model", temporary: false } as const;
  if (/\b(?:429|500|502|503|504)\b|AI_RATE_LIMITED|AI_TIMEOUT|AI_PROVIDER_UNAVAILABLE|timeout|ECONNRESET|استغرق التحليل وقتًا أطول|حد الطلبات المؤقت|غير متاحة حاليًا/i.test(text)) return { kind: "temporary", temporary: true } as const;
  return { kind: "review", temporary: false } as const;
}

export function summarizeEditorialFailures<T extends { error?: string | null; attempts: number; updatedAt?: Date | string }>(jobs: T[], now = new Date()) {
  const selected = selectEditorialRetries(jobs, now);
  return { scanned: jobs.length, byReason: EDITORIAL_FAILURE_KINDS.map(kind => ({ kind, count: jobs.filter(job => editorialFailure(job.error).kind === kind).length })),
    eligible: selected.selected.length + selected.remaining, deferred: selected.deferred, blocked: selected.blocked, checkedAt: now.toISOString() };
}

export function selectEditorialRetries<T extends { error?: string | null; attempts: number; updatedAt?: Date | string }>(jobs: T[], now = new Date()) {
  const candidates = jobs.filter(job => editorialFailure(job.error).temporary && job.attempts < 3 && job.updatedAt && Number.isFinite(new Date(job.updatedAt).getTime()));
  const eligible = candidates.filter(job => new Date(job.updatedAt!).getTime() <= now.getTime() - 10 * 60000);
  return { selected: eligible.slice(0, 20), blocked: jobs.length - candidates.length, deferred: candidates.length - eligible.length, remaining: Math.max(0, eligible.length - 20) };
}
