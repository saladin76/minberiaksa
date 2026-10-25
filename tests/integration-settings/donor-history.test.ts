import assert from "node:assert/strict";
import test from "node:test";
import { historyBefore, historyPage, parseHistoryCursor } from "../../lib/communication/donor-history";
import { pathToDashboardPermission } from "../../lib/dashboard/permissions";
import { DASHBOARD_NAV_GROUPS } from "../../lib/dashboard/nav-config";
const ids = ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"];

test("history cursor preserves same-time rows across channel archives", () => {
  const createdAt = new Date("2026-10-25T01:00:00Z");
  const rows = [ {id: ids[0], source: "delivery" as const, createdAt}, {id: ids[1], source: "legacy" as const, createdAt}, {id: ids[2], source: "legacy" as const, createdAt} ];
  const first = historyPage(rows, 1); assert.equal(first.items[0].id, ids[2]);
  const cursor = parseHistoryCursor(first.next); assert.equal(cursor?.id, ids[2]);
  const legacy = historyBefore(cursor, "legacy"); assert.equal(legacy.OR?.length, 2);
  const delivery = historyBefore(cursor, "delivery"); assert.equal(delivery.OR?.length, 2);
  assert.throws(() => parseHistoryCursor("garbage"));
});

test("donor history is a communication permission, independent from donor administration", () => {
  assert.equal(pathToDashboardPermission(`/dashboard/users/donors/${ids[0]}/communication`), "messages");
  assert.equal(pathToDashboardPermission("/dashboard/users/donors"), "donors");
});

test("all six requested supporting tools appear once under Administration with existing grants", () => {
  const expected = new Map([
    ["/dashboard/ai-concierge", "aiConcierge"], ["/dashboard/platform-connections/tracking", "platformConnections"],
    ["/dashboard/platform-connections/communication", "platformConnections"], ["/dashboard/telegram", "platformConnectionsAdmin"],
    ["/dashboard/quick-donation", "siteContent"], ["/dashboard/certificates", "siteContent"],
  ]);
  for (const [href, permission] of expected) {
    const found = DASHBOARD_NAV_GROUPS.flatMap((group) => group.items.filter((item) => item.href === href).map((item) => ({group: group.group, item})));
    assert.equal(found.length, 1); assert.equal(found[0].group, "الإدارة"); assert.equal(found[0].item.key, permission);
    if (href.endsWith("telegram")) assert.equal(found[0].item.adminOnly, true);
  }
});
