import { BlockList, isIP } from "node:net";
export type AccessRule = {
  id: string;
  kind: "IP" | "COUNTRY";
  value: string;
  action: "BLOCK" | "ALLOW";
  reason: string;
  enabled: boolean;
  expiresAt?: string | null;
  updatedAt: string;
};
export function canonicalNetwork(raw: string): string | null {
  const parts = raw.trim().split("/");
  if (parts.length > 2) return null;
  let address = parts[0].replace(/^::ffff:(?=\d+\.)/i, "");
  const family = isIP(address);
  if (address.includes("%") || !family) return null;
  if (family === 6)
    address = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  if (parts.length === 1) return address;
  if (!/^\d+$/.test(parts[1])) return null;
  const prefix = Number(parts[1]);
  if (prefix < 0 || prefix > (family === 4 ? 32 : 128)) return null;
  return address + "/" + prefix;
}
export function securityClientIp(headers: Pick<Headers, "get">): string | null {
  // The VPS nginx overwrites X-Real-IP. Never prioritize a caller-supplied CF header.
  const real = canonicalNetwork(headers.get("x-real-ip") || "");
  if (real && isIP(real)) return real;
  if (process.env.VERCEL) {
    const forwarded = canonicalNetwork(
      headers.get("x-vercel-forwarded-for")?.split(",").at(-1)?.trim() || "",
    );
    if (forwarded && isIP(forwarded)) return forwarded;
  }
  return null;
}
export function matchesNetwork(ip: string, network: string) {
  const canonical = canonicalNetwork(network),
    address = canonicalNetwork(ip);
  if (!canonical || !address || address.includes("/")) return false;
  const [base, prefix] = canonical.split("/"),
    family = isIP(base) === 6 ? "ipv6" : "ipv4";
  try {
    const list = new BlockList();
    if (prefix === undefined) list.addAddress(base, family);
    else list.addSubnet(base, Number(prefix), family);
    return list.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
  } catch {
    return false;
  }
}
export function accessDecision(
  rules: AccessRule[],
  ip: string | null,
  country: string | null,
  now = Date.now(),
) {
  const active = rules.filter(
    (rule) =>
      rule.enabled &&
      (!rule.expiresAt || new Date(rule.expiresAt).getTime() > now),
  );
  const matched = active.filter((rule) =>
    rule.kind === "IP"
      ? Boolean(ip && matchesNetwork(ip, rule.value))
      : Boolean(country && country === rule.value),
  );
  // Explicit IP rules take precedence over country-wide rules. Within the
  // same scope an allow exception wins over a broader blocked network.
  const scoped = matched.some((rule) => rule.kind === "IP")
    ? matched.filter((rule) => rule.kind === "IP")
    : matched;
  const allow = scoped.find((rule) => rule.action === "ALLOW");
  if (allow) return { blocked: false, ruleId: allow.id };
  const block = scoped.find((rule) => rule.action === "BLOCK");
  return { blocked: Boolean(block), ruleId: block?.id || null };
}
export function isSecurityExemptPath(path: string) {
  // Operators retain a recovery route. Machine callbacks verify their own provider signatures.
  return (
    /^\/(?:[a-z]{2}\/)?(?:dashboard|auth)(?:\/|$)/.test(path) ||
    /^\/api\/(?:admin|auth|webhooks|cron)(?:\/|$)/.test(path) ||
    /^\/api\/(?:albaraka\/3d\/callback|payfor\/3dpay\/(?:ok|fail)|paypal\/return|stripe\/webhook|telegram\/webhook)(?:\/|$)/.test(
      path,
    ) ||
    /^\/api\/donations\/(?:albaraka|payfor|paypal)\/(?:callback|webhook)(?:\/|$)/.test(
      path,
    )
  );
}
