import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const route = fs.readFileSync("app/api/users/[id]/contact-status/route.ts", "utf8");
test("the profile's contact state reads the markers the senders enforce", () => {
  assert.match(route, /isWhatsappExplicitlyUnsubscribed\(profile\)/, "the same WhatsApp STOP check as campaigns");
  assert.match(route, /find: "EmailSuppression"/, "the e-mail suppression list");
  assert.match(route, /errorContains|contains: "131026"/, "numbers that are not on WhatsApp");
  assert.match(route, /requireAdminOrDashboardPermission\(session, "messages"\)/);
});
test("the profile shows it for donors", () => {
  assert.match(fs.readFileSync("components/dashboard/ViewUserProfileDialog.tsx", "utf8"), /\{user\.role === "DONOR" && <DonorContactStatus userId=\{user\.id\} \/>\}/);
});
