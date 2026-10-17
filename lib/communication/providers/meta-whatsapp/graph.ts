import { mapGraphError, META_REASONS } from "./errors";
import type { MetaGraphConfig } from "./types";

/**
 * The one way this adapter talks to the Graph API. Kept free of runtime-config / Prisma imports so
 * the request, paging and error-classification behaviour can be exercised directly in tests.
 */

export type GraphOk = { ok: true; data: unknown };
/**
 * `retryable` says whether the failure proves nothing about the request itself (network, 5xx,
 * throttling, Meta's own `is_transient`)  callers must not treat it as evidence that a stored
 * configuration is wrong.
 */
export type GraphErr = { ok: false; reason: string; detail: string; retryable: boolean; status?: number };

export async function graphFetch(config: MetaGraphConfig, path: string, init?: RequestInit): Promise<GraphOk | GraphErr> {
  const url = `https://graph.facebook.com/${config.graphVersion}/${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const { reason, detail, retryable } = mapGraphError(res.status, body);
      return { ok: false, reason, detail, retryable, status: res.status };
    }
    return { ok: true, data: body };
  } catch {
    return { ok: false, reason: META_REASONS.REQUEST_FAILED, detail: "network error", retryable: true };
  }
}

/** A hard stop so a paging loop can never run away on a malformed cursor. */
const MAX_PAGES = 50;

export type GraphRow = Record<string, unknown>;

/**
 * Read every page of a Graph edge. Same cursor approach as the template catalogue: `paging.next` is
 * an absolute URL, so the `after` cursor is carried onto the original path instead of re-deriving
 * the host and version from it.
 */
export async function graphFetchAllPages(
  config: MetaGraphConfig,
  firstPath: string,
): Promise<{ ok: true; rows: GraphRow[] } | GraphErr> {
  const rows: GraphRow[] = [];
  const separator = firstPath.includes("?") ? "&" : "?";
  let path: string | null = firstPath;
  for (let page = 0; page < MAX_PAGES && path; page++) {
    const result = await graphFetch(config, path, { method: "GET" });
    if (!result.ok) return result;
    const body = (result.data ?? {}) as { data?: unknown[]; paging?: { next?: unknown; cursors?: { after?: unknown } } };
    if (Array.isArray(body.data)) {
      rows.push(...(body.data.filter((row) => row && typeof row === "object") as GraphRow[]));
    }
    const after = body.paging?.cursors?.after;
    path = body.paging?.next && typeof after === "string" && after
      ? `${firstPath}${separator}after=${encodeURIComponent(after)}`
      : null;
  }
  return { ok: true, rows };
}
