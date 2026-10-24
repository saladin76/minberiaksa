import test from "node:test";
import assert from "node:assert/strict";
import { describeVideoSource } from "../../lib/content/video-platform";
test("opening a prepared YouTube embed preserves the selected start time", () => {
  const first = describeVideoSource({ youtubeId: "dQw4w9WgXcQ", startSeconds: 125 });
  assert.match(first.embedUrl || "", /\?start=125$/);
  assert.equal(describeVideoSource({ url: first.embedUrl }).embedUrl, first.embedUrl);
});
test("watch links accept YouTube time syntax while an explicit start takes precedence", () => {
  assert.match(describeVideoSource({ url: "https://youtu.be/dQw4w9WgXcQ?t=1m30s" }).embedUrl || "", /start=90$/);
  assert.match(describeVideoSource({ url: "https://youtu.be/dQw4w9WgXcQ?t=20", startSeconds: 5 }).embedUrl || "", /start=5$/);
});
