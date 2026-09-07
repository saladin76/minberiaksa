import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("campaign POST authorizes before parsing or starting creation", () => {
  const source = readFileSync("app/api/campaigns/route.ts", "utf8");
  const post = source.slice(source.indexOf("export async function POST"));
  const authIndex = post.indexOf(
    'requireAdminOrDashboardPermission(session, "campaigns")',
  );
  const jsonIndex = post.indexOf("request.json()");
  const createIndex = post.indexOf("createAdminCampaign(input)");
  assert.ok(authIndex >= 0);
  assert.ok(jsonIndex > authIndex);
  assert.ok(createIndex > jsonIndex);
});

test("campaign POST delegates to explicit parser and never passes body to Prisma", () => {
  const source = readFileSync("app/api/campaigns/route.ts", "utf8");
  const post = source.slice(source.indexOf("export async function POST"));
  assert.match(post, /parseAdminCampaignCreatePayload\(body\)/);
  assert.match(post, /createAdminCampaign\(input\)/);
  assert.doesNotMatch(post, /prisma\.campaign\.create/);
  assert.doesNotMatch(post, /data:\s*body/);
  assert.doesNotMatch(post, /\.\.\.body/);
});

test("campaign update preserves translations omitted from the payload", () => {
  const source = readFileSync("app/api/campaigns/[id]/route.ts", "utf8");
  const put = source.slice(source.indexOf("export async function PUT"));
  assert.match(put, /Object\.entries\(body\.translations\)/);
  assert.match(put, /campaignTranslation\.upsert/);
  assert.doesNotMatch(put, /campaignTranslation\.deleteMany/);
  assert.doesNotMatch(put, /campaignTranslation\.delete\(/);
});

test("campaign slug changes on update only when slug is intentionally supplied", () => {
  const source = readFileSync("app/api/campaigns/[id]/route.ts", "utf8");
  const put = source.slice(source.indexOf("export async function PUT"));
  assert.match(put, /if \(body\.slug !== undefined\)/);
  assert.match(put, /currentId:\s*id/);
});

test("campaign creation uses one transaction for campaign, relations and translations", () => {
  const source = readFileSync("lib/campaign/admin-create.ts", "utf8");
  assert.match(source, /prisma\.\$transaction/);
  assert.match(source, /tx\.campaign\.create/);
  assert.match(source, /categories:\s*\{[\s\S]*connect:/);
  assert.match(source, /tx\.campaignTranslation\.create/);
});
