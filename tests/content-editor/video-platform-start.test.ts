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

test("playlist watch and prepared embed URLs retain the playlist in the player", () => {
  for (const url of ["https://www.youtube.com/playlist?list=PL_fixture_123","https://www.youtube.com/embed/videoseries?list=PL_fixture_123&autoplay=1"]) {
    const media = describeVideoSource({url});
    const embed = new URL(media.embedUrl || "");
    assert.equal(media.provider,"youtube");
    assert.equal(media.youtubeId,null);
    assert.equal(embed.hostname,"www.youtube-nocookie.com");
    assert.equal(embed.pathname,"/embed/videoseries");
    assert.equal(embed.searchParams.get("list"),"PL_fixture_123");
  }
});
test("a lookalike YouTube hostname is never treated as a YouTube playlist", () => {
  const media = describeVideoSource({url:"https://wwwxyoutube.com/playlist?list=PL_fixture_123"});
  assert.equal(media.embedUrl,null);
});
