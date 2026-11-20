import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p: string) => fs.readFileSync(p, "utf8");

test("a registered member is never offered account creation (same rule as the donors list)", () => {
  assert.match(read("app/api/users/[id]/account-invitation/route.ts"), /donorAccountWhere\("MEMBER"\)/);
  const card = read("components/dashboard/DonorAccountInvitation.tsx");
  assert.match(card, /if \(member === null\) return null;/);
  assert.match(card, /if \(member\) return <p/);
});

test("the donor's profile opens their WhatsApp conversation, and the page finds it by phone", () => {
  assert.match(read("components/dashboard/ViewUserProfileDialog.tsx"), /\/dashboard\/communication\/conversations\?phone=\$\{encodeURIComponent\(user\.phone\)\}/);
  const page = read("app/(dashboard)/dashboard/communication/conversations/_components/ConversationsWorkspace.tsx");
  assert.match(page, /new URLSearchParams\(window\.location\.search\)\.get\("phone"\)/);
  assert.match(page, /if \(hit\) \{ setActiveId\(hit\.id\); setWantedPhone\(""\); \}/);
});
