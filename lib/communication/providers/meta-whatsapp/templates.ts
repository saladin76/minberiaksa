import { getActiveMetaWhatsappRuntimeConfig } from "../../runtime-config";
import { graphFetch, metaRuntimeFailure, type MetaRuntimeConfig } from "./client";
import { META_REASONS } from "./errors";

/**
 * Reading the template catalogue out of Meta.
 *
 * Two shapes, deliberately: `listApprovedTemplates` answers "can we send this right now" with the
 * few fields a readiness check needs, and `listAllTemplates` is what the sync stores  every
 * language at every status, with the component schema that tells a sender how many parameters the
 * template actually takes.
 *
 * The listing is paginated. It used to ask for `limit=200` and take whatever came back, so a
 * business account with more templates than that had the remainder silently missing  which looks
 * exactly like a template that was never created. `fetchAllPages` follows `paging.next` instead.
 */

export type MetaTemplateSummary = {
  name: string;
  language: string;
  status: string;
  category: string | null;
};

/** The full record for one language of one template, as Meta describes it. */
export type MetaTemplateDetail = MetaTemplateSummary & {
  id: string | null;
  rejectedReason: string | null;
  qualityScore: string | null;
  components: unknown[] | null;
};

export type ListTemplatesResult =
  | { ok: true; templates: MetaTemplateSummary[] }
  | { ok: false; reason: string; detail?: string };

export type ListTemplateDetailsResult =
  | { ok: true; templates: MetaTemplateDetail[] }
  | { ok: false; reason: string; detail?: string };

/** Meta caps a page at 250 for this edge; 100 keeps each response small and predictable. */
const PAGE_SIZE = 100;
/** A hard stop so a paging loop can never run away on a malformed `next` cursor. */
const MAX_PAGES = 50;

type PagedRow = Record<string, unknown>;

async function fetchAllPages(
  values: NonNullable<Awaited<ReturnType<typeof getActiveMetaWhatsappRuntimeConfig>>["values"]>,
  firstPath: string,
): Promise<{ ok: true; rows: PagedRow[] } | { ok: false; reason: string; detail?: string }> {
  const rows: PagedRow[] = [];
  let path: string | null = firstPath;
  for (let page = 0; page < MAX_PAGES && path; page++) {
    const result = await graphFetch(values, path, { method: "GET" });
    if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail };
    const body = (result.data ?? {}) as { data?: unknown[]; paging?: { next?: unknown; cursors?: { after?: unknown } } };
    if (Array.isArray(body.data)) rows.push(...(body.data as PagedRow[]));
    /* `paging.next` is an absolute URL; `graphFetch` builds its own, so the cursor is carried
       forward instead  same page, without re-deriving the host and version. */
    const after = body.paging?.cursors?.after;
    path = body.paging?.next && typeof after === "string" && after
      ? `${firstPath}&after=${encodeURIComponent(after)}`
      : null;
  }
  return { ok: true, rows };
}

function readSummary(row: PagedRow): MetaTemplateSummary {
  return {
    name: String(row.name ?? ""),
    language: String(row.language ?? ""),
    status: String(row.status ?? ""),
    category: typeof row.category === "string" ? row.category : null,
  };
}

/** Approved templates only  the cheap answer for "is this sendable". */
export async function listApprovedTemplates(businessAccountId?: string | null, runtime?: MetaRuntimeConfig): Promise<ListTemplatesResult> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };
  const waba = businessAccountId || resolved.values.businessAccountId;
  if (!waba) return { ok: false, reason: META_REASONS.NOT_CONFIGURED, detail: "missing business account id" };
  const paged = await fetchAllPages(resolved.values, `${waba}/message_templates?fields=name,language,status,category&limit=${PAGE_SIZE}`);
  if (!paged.ok) return paged;
  return { ok: true, templates: paged.rows.map(readSummary).filter((t) => t.status.toUpperCase() === "APPROVED") };
}

/**
 * Every template at every status, with components  what the sync writes to the database.
 *
 * Rejected and pending variants matter as much as approved ones: they are the answer to "why did
 * this language not go out", and without them the dashboard can only say a language is missing.
 */
export async function listAllTemplates(businessAccountId?: string | null, runtime?: MetaRuntimeConfig): Promise<ListTemplateDetailsResult> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };
  const waba = businessAccountId || resolved.values.businessAccountId;
  if (!waba) return { ok: false, reason: META_REASONS.NOT_CONFIGURED, detail: "missing business account id" };
  const fields = "id,name,language,status,category,components,rejected_reason,quality_score";
  const paged = await fetchAllPages(resolved.values, `${waba}/message_templates?fields=${fields}&limit=${PAGE_SIZE}`);
  if (!paged.ok) return paged;
  return {
    ok: true,
    templates: paged.rows.map((row) => {
      const quality = row.quality_score as { score?: unknown } | undefined;
      return {
        ...readSummary(row),
        id: typeof row.id === "string" ? row.id : null,
        rejectedReason: typeof row.rejected_reason === "string" && row.rejected_reason !== "NONE" ? row.rejected_reason : null,
        qualityScore: typeof quality?.score === "string" ? quality.score : null,
        components: Array.isArray(row.components) ? (row.components as unknown[]) : null,
      };
    }),
  };
}


export type CreateMetaTemplateInput = {
  businessAccountId: string;
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  components: unknown[];
};

export type CreateMetaTemplateResult =
  | { ok: true; id: string | null; status: string; category: string | null; existed: boolean }
  | { ok: false; reason: string; detail?: string };

/**
 * Idempotently ensure one language variant exists in one WABA.
 * Meta template creation is account-scoped, so the same local template may need to be created in
 * more than one WABA when routing can choose numbers owned by different accounts.
 */
export async function ensureMetaTemplate(
  input: CreateMetaTemplateInput,
  runtime?: MetaRuntimeConfig,
): Promise<CreateMetaTemplateResult> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };
  const config = resolved.values;
  const name = encodeURIComponent(input.name);

  const existing = await graphFetch(
    config,
    `${input.businessAccountId}/message_templates?name=${name}&fields=id,name,language,status,category&limit=100`,
    { method: "GET" },
  );
  if (!existing.ok) return existing;

  const rows = Array.isArray((existing.data as { data?: unknown[] } | null)?.data)
    ? ((existing.data as { data: unknown[] }).data as Array<Record<string, unknown>>)
    : [];
  const found = rows.find((row) =>
    String(row.name ?? "").toLowerCase() === input.name.toLowerCase() &&
    String(row.language ?? "").toLowerCase() === input.language.toLowerCase()
  );
  if (found) {
    return {
      ok: true,
      id: typeof found.id === "string" ? found.id : null,
      status: String(found.status ?? "UNKNOWN").toUpperCase(),
      category: typeof found.category === "string" ? found.category : null,
      existed: true,
    };
  }

  const created = await graphFetch(config, `${input.businessAccountId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      components: input.components,
    }),
  });
  if (!created.ok) return created;
  const data = (created.data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    id: typeof data.id === "string" ? data.id : null,
    status: String(data.status ?? "PENDING").toUpperCase(),
    category: typeof data.category === "string" ? data.category : input.category,
    existed: false,
  };
}
