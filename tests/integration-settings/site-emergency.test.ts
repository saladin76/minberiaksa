import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isEmergencyAllowedPath, isPaymentStartRequest, isEmergencyMode, EMERGENCY_PAGE } from "../../lib/site-security/emergency-policy";
import { pauseTexts, requestLocale } from "../../lib/site-security/emergency-texts";

test("payment starts are exactly the checkout POSTs; completions of started payments are not", () => {
  for (const p of ["/api/cart/payment", "/api/donations", "/api/albaraka/3d/initiate", "/api/payfor/3dpay/initiate", "/api/paypal/orders", "/api/stripe/charge"])
    assert.equal(isPaymentStartRequest("POST", p), true, p);
  for (const [m, p] of [["GET", "/api/donations"], ["POST", "/api/donations/6af674e2d1cd34cbb9de7d1a/fail"], ["POST", "/api/albaraka/3d/callback"],
    ["POST", "/api/payfor/3dpay/ok"], ["GET", "/api/paypal/return"], ["POST", "/api/bank-transfers/claim"], ["POST", "/api/cart"]])
    assert.equal(isPaymentStartRequest(m, p), false, `${m} ${p}`);
});

test("full closure keeps the dashboard, login, admin APIs, cron and every bank callback open", () => {
  for (const p of ["/dashboard/security", "/auth/signin", "/api/auth/session", "/api/admin/site-security/emergency", "/api/dashboard/x",
    "/api/cron/communication-run-due", "/api/albaraka/3d/callback", "/api/payfor/3dpay/ok", "/api/paypal/return", "/ar/success/6af674e2d1cd34cbb9de7d1a"])
    assert.equal(isEmergencyAllowedPath(p), true, p);
  for (const p of ["/", "/ar", "/tr/bagislar/gaza-bread", "/api/global-settings", "/api/site-status"]) assert.equal(isEmergencyAllowedPath(p), false, p);
  assert.match(EMERGENCY_PAGE, /noindex/); for (const l of ["tr", "en", "fr"]) assert.match(EMERGENCY_PAGE, new RegExp(`lang="${l}"`));
});

test("the donor sees the notice in Arabic, Turkish, English or French; other languages read English", () => {
  assert.match(pauseTexts("ar").refused, /التبرع متوقف مؤقتاً/); assert.match(pauseTexts("tr").banner, /Bağış/);
  assert.match(pauseTexts("fr").refused, /dons/); assert.equal(pauseTexts("de"), pauseTexts("en")); assert.equal(pauseTexts(null), pauseTexts("en"));
  assert.equal(requestLocale("tr", null), "tr"); assert.equal(requestLocale(undefined, "https://minberiaksa.org/fr/checkout"), "fr");
  assert.equal(requestLocale(undefined, null), null);
  assert.equal(isEmergencyMode("DONATIONS"), true); assert.equal(isEmergencyMode("on"), false);
});

test("the access check consults the switch first, lazily and fail-open; the state is cached and never closes by accident", () => {
  const r = fs.readFileSync("lib/site-security/request.ts", "utf8");
  assert.ok(r.indexOf('await import("./emergency")') < r.indexOf("if (isSecurityExemptPath("));
  assert.doesNotMatch(r, /^import .*\.\/emergency/m);
  const e = fs.readFileSync("lib/site-security/emergency.ts", "utf8");
  assert.match(e, /return cached\?\.state \?\? OFF;/); assert.match(e, /expires: Date\.now\(\) \+ 5000/);
  assert.doesNotMatch(fs.readFileSync("lib/site-security/emergency-texts.ts", "utf8"), /^import /m, "browser-safe");
});

test("only admins switch, any closing needs the typed confirmation, every change is audited; route exports are valid", () => {
  const a = fs.readFileSync("app/api/admin/site-security/emergency/route.ts", "utf8");
  assert.equal((a.match(/requireAdminSession\(session\)/g) ?? []).length, 2);
  assert.match(a, /if \(body\.mode !== "OFF" && body\.confirm !== CONFIRM_TOKEN\)/);
  assert.match(a, /action: `SITE_EMERGENCY_\$\{body\.mode\}`/);
  for (const f of ["app/api/admin/site-security/emergency/route.ts", "app/api/site-status/route.ts"]) {
    const ex = [...fs.readFileSync(f, "utf8").matchAll(/^export (?:const|async function|function) (\w+)/gm)].map((m) => m[1]);
    assert.ok(ex.every((n) => ["GET", "POST", "dynamic"].includes(n)), f + ": " + ex);
  }
});

test("the banner sits at the top of every public page and every dashboard label is translated", () => {
  assert.match(fs.readFileSync("app/[locale]/layout.tsx", "utf8"), /<main><DonationPauseBanner locale=\{locale\} \/>\{children\}<\/main>/);
  assert.match(fs.readFileSync("app/(dashboard)/dashboard/security/page.tsx", "utf8"), /<EmergencySwitch \/>\s*<SiteSecurityManager \/>/);
  const ui = fs.readFileSync("app/(dashboard)/dashboard/security/EmergencySwitch.tsx", "utf8");
  const keys = [...ui.matchAll(/dt\("([^"]+)"/g)].map((m) => m[1]);
  for (const lang of ["en", "tr"]) { const cat = JSON.parse(fs.readFileSync(`lib/dashboard/i18n/catalog/${lang}.json`, "utf8")); for (const k of keys) assert.ok(cat[k], `${lang}: ${k}`); }
});
