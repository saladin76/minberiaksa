/**
 * Meta named template parameters are capped at 20 characters on message send.
 *
 * Local semantic variables are intentionally descriptive (for example
 * `donation.campaignTitle`), so blindly replacing dots with underscores can create a provider
 * parameter that Meta later rejects even when the template itself reached APPROVED.
 *
 * Keep short names readable. Long names get a deterministic compact suffix so publish-time and
 * send-time mapping always agree while collisions remain extremely unlikely. Callers that build a
 * whole template still detect collisions explicitly.
 */
export const META_PARAMETER_NAME_MAX_LENGTH = 20;

function normalizeBase(key: string): string {
  const normalized = String(key ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  const withLetter = /^[a-z]/.test(normalized) ? normalized : `p_${normalized || "value"}`;
  return withLetter;
}

function stableHash(input: string): string {
  // 32-bit FNV-1a: deterministic on server/client, no crypto dependency.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(6, "0").slice(-6);
}

export function metaParameterName(key: string): string {
  const normalized = normalizeBase(key);
  if (normalized.length <= META_PARAMETER_NAME_MAX_LENGTH) return normalized;

  const suffix = stableHash(normalized);
  const prefixBudget = META_PARAMETER_NAME_MAX_LENGTH - suffix.length - 1;
  const prefix = normalized.slice(0, prefixBudget).replace(/_+$/g, "") || "p";
  return `${prefix}_${suffix}`.slice(0, META_PARAMETER_NAME_MAX_LENGTH);
}

export function isValidMetaParameterName(name: string): boolean {
  return /^[a-z][a-z0-9_]{0,19}$/.test(String(name ?? ""));
}

export function schemaHasInvalidMetaParameterNames(components: unknown): boolean {
  const visit = (value: unknown): boolean => {
    if (typeof value === "string") {
      for (const match of value.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)) {
        if (!isValidMetaParameterName(match[1])) return true;
      }
      return false;
    }
    if (Array.isArray(value)) return value.some(visit);
    if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some(visit);
    return false;
  };
  return visit(components);
}
