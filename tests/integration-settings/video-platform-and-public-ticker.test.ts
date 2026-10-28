import assert from "node:assert/strict";
import test from "node:test";
import { describeVideoSource, normalizeVideoSource } from "../../lib/content/video-platform";
import { readFileSync } from "node:fs";
import { generateTickerDisplay, normalizeTickerDisplayNames } from "../../lib/donations/public-ticker-display";

test("detects YouTube IDs and supported YouTube URL variants", () => {
  for (const url of [
    "dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
  ]) {
    const video = describeVideoSource({ url });
    assert.equal(video.provider, "youtube");
    assert.equal(video.youtubeId, "dQw4w9WgXcQ");
    assert.match(video.embedUrl ?? "", /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
  }
});

test("detects Vimeo, direct files, and safe external-link fallbacks", () => {
  assert.equal(describeVideoSource({ url: "https://vimeo.com/12345678" }).provider, "vimeo");
  const direct = describeVideoSource({ url: "https://cdn.example.org/field.mp4?download=1" });
  assert.equal(direct.provider, "direct");
  assert.equal(direct.directVideo, true);
  const external = describeVideoSource({ url: "https://www.tiktok.com/@account/video/123456" });
  assert.equal(external.provider, "external");
  assert.equal(external.embedUrl, null);
  assert.equal(describeVideoSource({ url: "javascript:alert(1)" }).provider, "invalid");
});

test("normalizes sources for persistence without accepting client embed URLs", () => {
  const normalized = normalizeVideoSource({ mediaUrl: "https://youtu.be/dQw4w9WgXcQ" });
  assert.equal(normalized.youtubeId, "dQw4w9WgXcQ");
  assert.equal(normalized.url, "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(normalizeVideoSource({ mediaUrl: "not-a-url" }).url, null);
});

test("video edit form opens the same effective source that public playback resolves", () => {
  const form = readFileSync("app/(dashboard)/dashboard/videos/_components/VideoForm.tsx", "utf8");
  assert.match(form, /useState\(initial\.url \|\| initial\.youtubeId \|\| ''\)/);
  const legacy = describeVideoSource({ youtubeId: "dQw4w9WgXcQ", url: "https://vimeo.com/12345678" });
  assert.equal(legacy.provider, "vimeo");
  assert.equal(legacy.sourceUrl, "https://vimeo.com/12345678");
});

test("legacy ticker display values remain explicit and real feeds delegate to the masked reader", () => {
  const names = ["اسم عرض أول", "اسم عرض ثانٍ"];
  const event = generateTickerDisplay({
    donorNames: names,
    amountRanges: [{ minAmount: 20, maxAmount: 30, probability: 100, label: "medium" }],
  }, ["سقيا غزة"], () => 0.5);

  assert.deepEqual(event, {
    name: names[1],
    amount: 25,
    categoryName: "سقيا غزة",
  });
  const route = readFileSync("app/api/live-donation-ticker/route.ts", "utf8");
  assert.match(route, /donorNames: ticker\.donorNames/);
  assert.match(route, /publicTickerEntries/);
  assert.match(route, /prisma\.\$transaction/);
  assert.match(route, /allowedUpdates\.isActive === true[\s\S]*?where: \{ id: \{ not: id \} \}[\s\S]*?data: \{ isActive: false \}/);
});

test("ticker refuses incomplete operator lists rather than inventing a name or amount", () => {
  assert.equal(generateTickerDisplay({ donorNames: [], amountRanges: [{ minAmount: 10, maxAmount: 20, probability: 100, label: "" }] }), null);
  assert.equal(generateTickerDisplay({ donorNames: ["Configured"], amountRanges: [] }), null);
});

test("ticker display names are trimmed and rejected rather than silently truncated", () => {
  assert.deepEqual(normalizeTickerDisplayNames(["  First  ", "", "Second"]), ["First", "Second"]);
  assert.equal(normalizeTickerDisplayNames(["x".repeat(81)]), null);
  assert.equal(normalizeTickerDisplayNames(Array.from({ length: 101 }, (_, i) => `Name ${i}`)), null);
  assert.equal(normalizeTickerDisplayNames(["Valid", 3]), null);
});
