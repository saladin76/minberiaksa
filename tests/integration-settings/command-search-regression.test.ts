import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dashboardCommandFilter } from "../../lib/dashboard/command-search";

test("dashboard quick search excludes unrelated fuzzy matches", () => {
  const homepageLayout = "Homepage layout Website content homepage home layout sections";
  const whatsapp = "WhatsApp conversations Communication whatsapp inbox replies";

  assert.equal(dashboardCommandFilter(homepageLayout, "whatsapp"), 0);
  assert.equal(dashboardCommandFilter(whatsapp, "whatsapp"), 1);
  assert.equal(dashboardCommandFilter(whatsapp, "whatsapp replies"), 1);
  assert.equal(dashboardCommandFilter(whatsapp, "  "), 1);
});

test("command dialog uses the strict dashboard filter for menu search", () => {
  const source = readFileSync("components/ui/command.tsx", "utf8");
  assert.match(source, /<Command filter={dashboardCommandFilter}/);
  assert.match(source, /<DialogTitle className="sr-only">\{title\}<\/DialogTitle>/);
  assert.match(source, /aria-describedby=\{undefined\}/);
});
