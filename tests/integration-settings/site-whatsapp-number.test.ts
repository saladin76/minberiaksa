import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ORG, ORG_TEL, ORG_WHATSAPP } from "../../lib/minbar/org";

test("WhatsApp on the site is 531 (the inbox number); calls stay on the Turkish line 539", () => {
  assert.equal(ORG.whatsapp, "905313375953");
  assert.equal(ORG_WHATSAPP, "https://wa.me/905313375953");
  assert.equal(ORG.whatsappDisplay, "+90 531 337 59 53");
  assert.equal(ORG_TEL, "tel:+905398436050");
});

test("no other WhatsApp number is written anywhere in the public site's code", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|\(dashboard\)|[\\/]api$|tests?$/.test(p)) walk(p); } else if (/\.(tsx?|json)$/.test(e.name)) files.push(p); } };
  for (const d of ["app", "components", "lib/minbar"]) if (fs.existsSync(d)) walk(d);
  const bad = files.flatMap((f) => [...fs.readFileSync(f, "utf8").matchAll(/wa\.me\/(\d+)|whatsapp(?:Number)?\s*[:=]\s*"(\d{10,15})"/gi)]
    .map((m) => m[1] ?? m[2]).filter((n) => n && n !== "905313375953").map((n) => `${f}: ${n}`));
  assert.deepEqual(bad, []);
});
