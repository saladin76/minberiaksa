import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";
import { getToken } from "next-auth/jwt";
import { accessRules, recordSiteVisitor } from "./store";
import {
  accessDecision,
  securityClientIp,
  isSecurityExemptPath,
} from "./policy";
import { lookupIpGeo } from "@/lib/geo/ip-lookup";
// Share the first geolocation request for simultaneous requests from one IP.
// Routine visit logging never starts geolocation requests of its own.
const countryLookups = new Map<string, Promise<string | null>>();
function countryForAccess(ip: string) {
  const pending = countryLookups.get(ip);
  if (pending) return pending;
  const work = lookupIpGeo(ip)
    .then((result) => result?.countryCode || null)
    .catch(() => null);
  countryLookups.set(ip, work);
  void work.finally(() => {
    if (countryLookups.get(ip) === work) countryLookups.delete(ip);
  });
  return work;
}
export async function checkSiteAccess(
  request: NextRequest,
  event?: NextFetchEvent,
) {
  if (isSecurityExemptPath(request.nextUrl.pathname)) return null;
  const ip = securityClientIp(request.headers);
  if (!ip) return null;
  const rules = await accessRules().catch(() => null);
  // A database outage must not turn into a blanket denial of the donation site.
  if (!rules) return null;
  const direct = accessDecision(
    rules.filter((rule) => rule.kind === "IP"),
    ip,
    null,
  );
  const country =
    rules.some(
      (rule) =>
        rule.enabled &&
        rule.kind === "COUNTRY" &&
        (!rule.expiresAt || new Date(rule.expiresAt).getTime() > Date.now()),
    ) && !direct.ruleId
      ? await countryForAccess(ip)
      : null;
  const result = direct.ruleId ? direct : accessDecision(rules, ip, country);
  if (
    request.method === "GET" &&
    !request.nextUrl.pathname.startsWith("/api/")
  ) {
    const record = async () => {
      const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
      }).catch(() => null);
      const geo = country;
      await recordSiteVisitor({
        ip,
        country: geo,
        userId: token?.sub || null,
        path: request.nextUrl.pathname.replace(/[a-f0-9]{24,}/gi, ":id"),
        blocked: result.blocked,
      });
    };
    const promise = record().catch(() => {});
    if (event) event.waitUntil(promise);
  }
  if (!result.blocked) return null;
  return request.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json(
        { error: "ACCESS_RESTRICTED" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      )
    : new NextResponse(
        '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الوصول مقيّد</title><body style="font-family:system-ui;max-width:40rem;margin:15vh auto;padding:2rem"><h1>الوصول مقيّد</h1><p>تعذر السماح بالوصول من هذا الاتصال. تواصل مع المؤسسة إذا كنت تعتقد أن هناك خطأ.</p><p lang="en" dir="ltr">Access from this connection is restricted. Contact the foundation if you believe this is an error.</p></body></html>',
        {
          status: 403,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
}
