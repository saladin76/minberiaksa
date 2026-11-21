import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("security and communication-connections panels render in the browser only (no #418 from differing ICU data)", () => {
  const s = fs.readFileSync("app/(dashboard)/dashboard/security/page.tsx", "utf8");
  const c = fs.readFileSync("app/(dashboard)/dashboard/platform-connections/communication/page.tsx", "utf8");
  assert.match(s, /from "\.\/ClientOnly"/); assert.match(c, /from "\.\/_components\/ClientOnly"/);
  for (const f of ["app/(dashboard)/dashboard/security/ClientOnly.tsx", "app/(dashboard)/dashboard/platform-connections/communication/_components/ClientOnly.tsx"]) {
    const t = fs.readFileSync(f, "utf8"); assert.match(t, /^"use client";/); assert.equal((t.match(/ssr: false/g) ?? []).length, f.includes("security") ? 3 : 2, f);
  }
});
