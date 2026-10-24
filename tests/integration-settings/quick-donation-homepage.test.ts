import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { QuickDonationConfig } from "../../lib/minbar/quick-donation";
import {
  resolveQuickAmounts,
  selectQuickDonationProjectOptions,
} from "../../lib/minbar/quick-donation-display";

const projects = [
  { id: "p1", slug: "project-one", title: "Project One", regionLabel: "Al-Quds", privateField: "not serialized" },
  { id: "p2", slug: "project-two", title: "Project Two", regionLabel: null, privateField: "not serialized" },
] as const;

const defaultConfig: QuickDonationConfig = {
  enabled: true,
  dockDesktop: true,
  dockMobile: true,
  amounts: [25, 75, 150],
  byCurrency: {},
  suggestedIndex: 1,
  allowCustomAmount: true,
  frequencies: ["once", "daily", "friday", "monthly"],
  defaultFrequency: "once",
  genericDestinations: ["where-needed"],
  projectsMode: "all",
  projectIds: [],
  defaultDestination: "where-needed",
  titles: {},
};

test("homepage quick donation sends only the project fields its picker needs", () => {
  assert.deepEqual(selectQuickDonationProjectOptions({ projectsMode: "all", projectIds: [] }, projects), [
    { id: "p1", slug: "project-one", title: "Project One", regionLabel: "Al-Quds" },
    { id: "p2", slug: "project-two", title: "Project Two", regionLabel: null },
  ]);
});

test("selected and hidden project modes follow dashboard configuration", () => {
  assert.deepEqual(
    selectQuickDonationProjectOptions({ projectsMode: "selected", projectIds: ["p2"] }, projects),
    [{ id: "p2", slug: "project-two", title: "Project Two", regionLabel: null }],
  );
  assert.deepEqual(selectQuickDonationProjectOptions({ projectsMode: "none", projectIds: [] }, projects), []);
});

test("USD is the default quick amount currency and configured visitor currencies replace it", () => {
  const config = {
    ...defaultConfig,
    byCurrency: { TRY: [500, 1000, 1500] },
  };
  assert.deepEqual(resolveQuickAmounts(config, "USD"), { amounts: [25, 75, 150], currency: "USD" });
  assert.deepEqual(resolveQuickAmounts(config, "TRY"), { amounts: [500, 1000, 1500], currency: "TRY" });
  assert.deepEqual(resolveQuickAmounts(config, "DEFAULT"), { amounts: [25, 75, 150], currency: "USD" });
});

test("homepage quick donate bar is mounted and sends through the existing cart flow", () => {
  const component = readFileSync("components/minbar/home/QuickDonateBar.tsx", "utf8");
  const homepage = readFileSync("components/minbar/home/HomePage.tsx", "utf8");
  const page = readFileSync("app/[locale]/page.tsx", "utf8");
  const css = readFileSync("styles/minbar/minbar.css", "utf8");
  assert.match(component, /<section[\s\S]*className="mia-qb-sec"/);
  assert.match(component, /onClick=\{submit\}/);
  assert.match(component, /addToCart\(/);
  assert.match(component, /router\.push\(miaPath\("cart", locale\)\)/);
  assert.match(homepage, /<QuickDonateBar config=\{quick\.config\} projects=\{quick\.projects\} \/>/);
  assert.match(page, /selectQuickDonationProjectOptions\(quick, projects\)/);
  assert.match(component, /data-dock-desktop=\{config\.dockDesktop/);
  assert.match(component, /data-dock-mobile=\{config\.dockMobile/);
  assert.match(css, /data-dock-desktop="false"/);
  assert.match(css, /data-dock-mobile="false"/);
});
