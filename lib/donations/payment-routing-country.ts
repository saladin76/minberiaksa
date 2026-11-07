import "server-only";
import { isIP } from "node:net";
import { lookupIpGeo } from "../geo/ip-lookup";
export function publicRoutingIp(raw: string | null): string | null {
 const ip = raw?.trim(); if (!ip || !isIP(ip) || ip.includes("%")) return null;
 if (isIP(ip) === 4) {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127) return null;
 } else if (/^(?:0*:)*0*1$|^::$|^f[cd]|^fe[89ab]|^ff|^::ffff:/i.test(ip)) return null;
 return ip;
}
export async function paymentRoutingCountry(headers: Pick<Headers, "get">): Promise<string | null> {
 const trusted = process.env.VERCEL === "1" ? headers.get("x-vercel-ip-country") : process.env.TRACKING_TRUST_CLOUDFLARE === "true" ? headers.get("cf-ipcountry") : null;
 if (trusted && /^[A-Z]{2}$/.test(trusted) && trusted !== "XX") return trusted;
 // The VPS overwrites X-Real-IP; never trust the visitor-supplied first XFF hop.
 const ip = publicRoutingIp(headers.get("x-real-ip")) ?? publicRoutingIp(headers.get("x-forwarded-for")?.split(",").at(-1) ?? null);
 return ip ? (await lookupIpGeo(ip))?.countryCode ?? null : null;
}
