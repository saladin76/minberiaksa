/**
 * Helpers for handling marketing platform connection secrets safely.
 *
 * Rules:
 *   - Raw secret values never leave the server. GET responses only carry a
 *     masked preview built by `maskSecret`.
 *   - PATCH/POST handlers must not overwrite a stored secret with an empty
 *     string. Use `applySecretField` to merge incoming values into a Prisma
 *     update payload — empty strings are ignored unless `clear_<field>` is
 *     true in the incoming body.
 *   - AuditLog entries must never include raw secrets — call
 *     `redactSecretsFromMetadata` before passing metadata to `writeAuditLog`.
 *
 * No encryption is applied here — at-rest encryption can be layered later by
 * wrapping `applySecretField` / `maskSecret` with the actual crypto without
 * touching callers.
 */

/** Field names that hold secret material. */
export const SECRET_FIELDS = [
  "accessToken",
  "refreshToken",
  "authToken",
  "appSecret",
  "clientSecret",
  "developerToken",
  "apiSecret",
] as const;

export type SecretFieldName = (typeof SECRET_FIELDS)[number];

export function isSecretField(name: string): name is SecretFieldName {
  return (SECRET_FIELDS as readonly string[]).includes(name);
}

/**
 * Mask a secret value for display.
 *   null/empty  → null
 *   <= 8 chars  → "•••"
 *   else        → "<first4>…<last4>" (e.g. "abcd…wxyz")
 */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return "•••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

/**
 * Project secret fields into masked previews so the row can safely be sent
 * to the client. Each secret field becomes `<field>Masked` and the raw value
 * is omitted from the output.
 */
export function maskSecretFields<T extends Record<string, unknown>>(
  row: T
): Omit<T, SecretFieldName> & Record<`${SecretFieldName}Masked`, string | null> &
  Record<`${SecretFieldName}Present`, boolean> {
  const out: Record<string, unknown> = { ...row };
  for (const f of SECRET_FIELDS) {
    const raw = typeof row[f] === "string" ? (row[f] as string) : null;
    delete out[f];
    out[`${f}Masked`] = maskSecret(raw);
    out[`${f}Present`] = !!raw && raw.length > 0;
  }
  return out as Omit<T, SecretFieldName> &
    Record<`${SecretFieldName}Masked`, string | null> &
    Record<`${SecretFieldName}Present`, boolean>;
}

/**
 * Merge an incoming secret value into a Prisma update payload. The caller
 * passes the field name + the incoming body value + an optional explicit
 * "clear" flag.
 *
 *   - undefined  →  no change (field omitted from payload)
 *   - empty ""   →  no change (we never blow away a stored secret silently)
 *   - non-empty  →  field set to new value
 *   - clear:true →  field explicitly cleared (set to null)
 */
export function applySecretField(
  target: Record<string, unknown>,
  field: SecretFieldName,
  value: unknown,
  options: { clear?: boolean } = {}
): void {
  if (options.clear) {
    target[field] = null;
    return;
  }
  if (value == null) return;
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed.length === 0) return;
  // Don't accept the masked preview as a new value — it would silently corrupt
  // the stored secret. `•••` / `xxxx…yyyy` are sentinels we recognize here.
  if (/^•+$/.test(trimmed) || /^[A-Za-z0-9_-]{4}…[A-Za-z0-9_-]{4}$/.test(trimmed)) {
    return;
  }
  target[field] = trimmed;
}

/**
 * Strip secret-looking keys from a metadata object before passing it to
 * AuditLog. Defensive — even though we never intentionally include secrets,
 * a single bug shouldn't leak credentials into the activity log.
 */
export function redactSecretsFromMetadata(
  meta: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (isSecretField(k)) continue;
    if (/auth|secret|token|password|api[_-]?key/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}
