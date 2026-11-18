import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const s = fs.readFileSync("lib/communication/delivery-retry-service.ts", "utf8");
const preflight = s.slice(s.indexOf("export async function retryPreflight"), s.indexOf("export async function retryPreflight") + 1200);

test("the dashboard preflight never downloads message bodies or variables", () => {
  assert.match(preflight, /select: \{ id: true, errorMessage: true, createdAt: true, channel: true, templateId: true \}/);
  assert.doesNotMatch(preflight, /renderedBody: true|variables: true/);
  assert.match(preflight, /\.then\(withArchivedPayloadFlags\)/);
});

test("the database applies retryPayloadBlockReason's exact rule (non-blank e-mail body; WhatsApp template + object variables)", () => {
  const h = s.slice(s.indexOf("async function withArchivedPayloadFlags"), s.indexOf("export async function retryPreflight"));
  assert.match(h, /\{ \$eq: \["\$channel", "WHATSAPP"\] \}/);
  assert.match(h, /\{ \$ne: \[\{ \$ifNull: \["\$templateId", null\] \}, null\] \}, \{ \$eq: \[\{ \$type: "\$variables" \}, "object"\] \}/);
  assert.match(h, /\$strLenCP: \{ \$trim: \{ input: \{ \$cond: \[\{ \$eq: \[\{ \$type: "\$renderedBody" \}, "string"\] \}, "\$renderedBody", ""\] \} \} \}/);
  assert.match(h, /cursor: \{ batchSize: 10000 \}/, "never truncated at the default first batch");
});

test("the real retry paths still read the full archived content", () => {
  assert.ok((s.match(/renderedBody: true/g) ?? []).length >= 2, "listRetryCandidates and the send path keep their full selects");
});
