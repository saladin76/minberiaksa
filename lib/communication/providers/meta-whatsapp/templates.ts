import { getActiveMetaWhatsappRuntimeConfig } from "../../runtime-config";
import { graphFetch, metaRuntimeFailure, type MetaRuntimeConfig } from "./client";
import { META_REASONS } from "./errors";

export type MetaTemplateSummary = {
  name: string;
  language: string;
  status: string;
  category: string | null;
};

export type ListTemplatesResult =
  | { ok: true; templates: MetaTemplateSummary[] }
  | { ok: false; reason: string; detail?: string };

export async function listApprovedTemplates(businessAccountId?: string | null, runtime?: MetaRuntimeConfig): Promise<ListTemplatesResult> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };
  const waba = businessAccountId || resolved.values.businessAccountId;
  if (!waba) return { ok: false, reason: META_REASONS.NOT_CONFIGURED, detail: "missing business account id" };
  const result = await graphFetch(resolved.values, `${waba}/message_templates?fields=name,language,status,category&limit=200`, { method: "GET" });
  if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail };
  const rows = ((result.data as { data?: unknown[] })?.data ?? []) as Record<string, unknown>[];
  return {
    ok: true,
    templates: rows.map((row) => ({
      name: String(row.name ?? ""),
      language: String(row.language ?? ""),
      status: String(row.status ?? ""),
      category: typeof row.category === "string" ? row.category : null,
    })),
  };
}
