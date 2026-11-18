import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const responsiveTrack = /gridTemplateColumns:\s*"repeat\(auto-fill, minmax\(min\(100%, 340px\), 1fr\)\)"/;
const unsafeTrack = /gridTemplateColumns:\s*"repeat\(auto-fill, minmax\(340px, 1fr\)\)"/;

for (const path of [
  "components/minbar/aqsa/AqsaPage.tsx",
  "components/minbar/jerusalem/JerusalemPage.tsx",
  "components/minbar/projects/ProjectsPage.tsx",
]) {
  test(`${path} constrains project columns to their container`, () => {
    const source = readFileSync(path, "utf8");
    assert.match(source, responsiveTrack);
    assert.doesNotMatch(source, unsafeTrack);
  });
}
