import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const e = fs.readFileSync("lib/communication/smart-audience.ts", "utf8");
const ui = fs.readFileSync("app/(dashboard)/dashboard/communication/campaigns/new/_components/SmartAudienceBuilder.tsx", "utf8");
test("phase B filters are normalized, applied once in the shared resolver, and offered in the builder", () => {
  for (const k of ["maxDonationAmountUSD", "minTotalUSD", "maxTotalUSD", "minDonationCount", "maxDonationCount", "sourceChannels", "accountStatus", "excludeUndeliverable"]) { assert.match(e, new RegExp(`${k}:`), `engine ${k}`); assert.match(ui, new RegExp(`${k}`), `builder ${k}`); }
  assert.match(e, /sourceChannel: \{ in: f\.sourceChannels \}/);
  assert.match(e, /donorAccountWhere\(f\.accountStatus\)/);
  assert.match(e, /if \(f\.excludeUndeliverable && definition\.channel === "WHATSAPP"\)/);
  assert.match(e, /for \(const next of keepOnly\.slice\(1\)\) ids = ids\.filter/, "several id conditions intersect");
});
