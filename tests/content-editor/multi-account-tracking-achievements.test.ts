import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as targets from "../../lib/tracking/google-ads-targets";
import * as videoPlatform from "../../lib/content/video-platform";
import * as translations from "../../lib/i18n/translation-fallback";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
function load(file: string, dependencies: Row, extra: Row = {}): Row {
  const loaded = { exports: {} };
  new vm.Script(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).runInNewContext({
    module: loaded,
    exports: loaded.exports,
    Date,
    Map,
    Set,
    console,
    ...extra,
    require: (id: string) => {
      assert.ok(id in dependencies, id);
      return dependencies[id];
    },
  });
  return loaded.exports;
}
test("multiple Google Ads conversion targets are normalized and deduplicated; an explicit empty set disables the legacy fallback", () => {
  assert.deepEqual(
    targets.googleAdsTargets({
      googleAdsTargets: [
        { conversionId: "123", conversionLabel: "paid" },
        { conversionId: "AW-123", conversionLabel: "paid" },
        { conversionId: "AW-456", conversionLabel: "grant" },
      ],
    }),
    [
      { conversionId: "AW-123", conversionLabel: "paid" },
      { conversionId: "AW-456", conversionLabel: "grant" },
    ],
  );
  assert.deepEqual(
    targets.googleAdsTargets({
      googleAdsTargets: [],
      googleAdsConversionId: "AW-123",
      googleAdsConversionLabel: "paid",
    }),
    [],
  );
});
test("public settings expose enabled opted-in account targets without credentials; an explicitly disabled managed legacy target stays disabled", async () => {
  const accounts = [
    {
      enabled: true,
      conversionId: "123",
      conversionLabel: "paid",
      configChecklist: { googleAdsTrackingEnabled: true },
      clientSecret: "private",
    },
    {
      enabled: true,
      conversionId: "456",
      conversionLabel: "grant",
      configChecklist: { googleAdsTrackingEnabled: true },
      refreshToken: "private",
    },
    {
      enabled: false,
      conversionId: "789",
      conversionLabel: "off",
      configChecklist: { googleAdsTrackingEnabled: true },
    },
  ];
  const api = load("lib/tracking/tracking-settings.ts", {
    "./google-ads-targets": targets,
    "@/lib/prisma": {
      prisma: {
        $runCommandRaw: async () => ({
          cursor: {
            firstBatch: [
              {
                googleAdsConversionId: "AW-123",
                googleAdsConversionLabel: "paid",
                facebookPixelId: "meta",
              },
            ],
          },
        }),
        marketingPlatformConnection: { findMany: async () => accounts },
      },
    },
  });
  const config = await api.getPublicTrackingConfig();
  assert.equal(config.googleAdsTargets.length, 2);
  assert.equal(config.facebookPixelId, "meta");
  assert.ok(!JSON.stringify(config).includes("private"));
  accounts[0].configChecklist.googleAdsTrackingEnabled = false;
  const off = await api.getPublicTrackingConfig();
  assert.equal(off.googleAdsTargets.length, 1);
  assert.equal(off.googleAdsTargets[0].conversionId, "AW-456");
});
test("one confirmed conversion routes to multiple accounts with the original transaction and amount, plus one local audit", async () => {
  const events: unknown[][] = [],
    audits: unknown[] = [];
  const api = load(
    "lib/tracking/browser-conversions.ts",
    { "./google-ads-targets": targets },
    {
      window: { gtag: (...args: unknown[]) => events.push(args) },
      fetch: async (_url: unknown, options: RequestInit) => {
        audits.push(JSON.parse(String(options.body)));
        return Response.json({ ok: true });
      },
    },
  );
  const payload = {
    eventId: "stable-event",
    transactionId: "settled-donation",
    value: 7,
    currency: "EUR",
  };
  assert.equal(
    await api.fireGoogleAdsDonationConversion(
      {
        googleAdsTargets: [
          { conversionId: "123", conversionLabel: "paid" },
          { conversionId: "456", conversionLabel: "grant" },
        ],
      },
      payload,
    ),
    true,
  );
  assert.equal(events.length, 1);
  assert.equal(audits.length, 1);
  const event = events[0][2] as Row;
  assert.deepEqual(Array.from(event.send_to), ["AW-123/paid", "AW-456/grant"]);
  assert.equal(event.value, 7);
  assert.equal(event.currency, "EUR");
  assert.equal(event.transaction_id, "settled-donation");
  assert.equal(
    await api.fireGoogleAdsDonationConversion(
      { googleAdsTargets: [] },
      payload,
    ),
    false,
  );
  assert.equal(events.length, 1);
});
test("public project achievements follow the linked video publication, language and project membership without duplicating the legacy update", async () => {
  const at = new Date("2026-10-31T00:00:00Z"),
    video = {
      id: "video",
      type: "ACHIEVEMENT",
      sourceUpdateId: "update",
      campaignIds: ["project"],
      isActive: true,
      localeFilter: [],
      title: "إنجاز",
      description: "وصف",
      thumbnail: null,
      url: "https://www.facebook.com/minber/videos/123456789/",
      youtubeId: null,
      startSeconds: 0,
      createdAt: at,
      translations: [
        {
          locale: "en",
          title: "Achievement",
          description: "Project achievement",
        },
      ],
    };
  const dependencies: Row = {
    "server-only": {},
    "@/lib/prisma": {
      prisma: {
        update: {
          findMany: async () => [
            {
              id: "update",
              title: "Old",
              description: "Old",
              videoUrl: video.url,
              createdAt: at,
              translations: [],
            },
          ],
        },
        video: {
          findMany: async (args: Row) => {
            assert.ok(
              JSON.stringify(args.where).includes(
                '"campaignIds":{"has":"project"}',
              ),
            );
            return [video];
          },
        },
      },
    },
    "@/lib/content/video-platform": videoPlatform,
    "@/lib/i18n/translation-fallback": translations,
  };
  for (const match of fs
    .readFileSync("lib/minbar/projects.ts", "utf8")
    .matchAll(/from\s+["']([^"']+)["']/g))
    dependencies[match[1]] ??= {};
  const api = load("lib/minbar/projects.ts", dependencies);
  const rows = await api.listProjectUpdates("project", "en");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Achievement");
  assert.ok(rows[0].videoUrl.includes("facebook.com"));
  video.isActive = false;
  assert.equal((await api.listProjectUpdates("project", "en")).length, 0);
  video.isActive = true;
  video.campaignIds = [];
  assert.equal((await api.listProjectUpdates("project", "en")).length, 0);
  video.campaignIds = ["project"];
  (video.localeFilter as string[]).push("ar");
  assert.equal((await api.listProjectUpdates("project", "en")).length, 0);
  assert.equal(
    (await api.listProjectUpdates("project", "ar"))[0].title,
    "إنجاز",
  );
});
