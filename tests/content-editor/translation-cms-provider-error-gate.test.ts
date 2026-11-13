import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Regression guard for the actual client-side translation response handler.
// A provider error is authoritative even when an upstream gateway accidentally
// returns a partially populated translation object for the same locale.
test("translation error locales are skipped before any draft merge", () => {
  const source = readFileSync(
    "app/(dashboard)/dashboard/_components/AutoTranslateButton.tsx",
    "utf8",
  );
  const loopStart = source.indexOf("for (const code of requestedLocales)");
  const guardStart = source.indexOf("if (errors[code]) {", loopStart);
  const skip = source.indexOf("continue;", guardStart);
  const rawRead = source.indexOf("const item = raw[code];", loopStart);
  const apply = source.indexOf("if (done.length) onResult(translations, overwrite)", loopStart);
  assert.ok(loopStart >= 0 && guardStart > loopStart && skip > guardStart);
  assert.ok(rawRead > skip, "failed locale must be skipped before reading partial payload");
  assert.ok(apply > rawRead, "only filtered success map may reach the editor");
});
