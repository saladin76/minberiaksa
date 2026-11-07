import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { profileHref } from "../../lib/minbar/profile-navigation";
import { SUPPORTED_LOCALES } from "../../lib/locales";

function load(file: string, deps: Record<string, unknown>) {
  const mod = { exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>> };
  new vm.Script(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)
    .runInNewContext({ module: mod, exports: mod.exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  return mod.exports;
}

test("the primary profile destination is donations in every locale and the former account route is a profile section", async () => {
  const account = load("app/[locale]/account/page.tsx", { "next/navigation": { redirect: (href: string) => { throw new Error(href); } }, "@/lib/minbar/profile-navigation": { profileHref } });
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(profileHref(locale), `/${locale}/profile?tab=donations`);
    await assert.rejects(account.default({ params: Promise.resolve({ locale }) }), { message: `/${locale}/profile?tab=overview` });
  }
});

test("account summaries use the signed-in donor, ignore a client-selected donor, and never cache private data", async () => {
  let signedIn = false, reads = 0;
  const summary = load("app/api/users/me/account-summary/route.ts", {
    "next/server": { NextResponse: { json: Response.json } }, "next-auth": { getServerSession: async () => signedIn ? { user: { id: "actual-owner" } } : null },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} }, "@/lib/locales": { isValidLocale: (locale: string) => SUPPORTED_LOCALES.includes(locale as typeof SUPPORTED_LOCALES[number]) },
    "@/lib/minbar/account": { getAccountSummary: async (id: string, locale: string) => { reads++; assert.equal(id, "actual-owner"); assert.equal(locale, "tr"); return { profile: { id } }; } },
  });
  const request = { nextUrl: new URL("https://fixture.invalid/summary?locale=tr&userId=another-donor") };
  assert.equal((await summary.GET(request) as Response).status, 401); assert.equal(reads, 0);
  signedIn = true; const response = await summary.GET(request) as Response;
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await response.json()).summary.profile.id, "actual-owner");
});
