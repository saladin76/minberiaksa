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

test('the historical restoration share URL and stored iframe resolve to the verified public video permalink', () => {
  const canonical = 'https://www.facebook.com/MinberAqsa/videos/1762295867563749/';
  for (const url of ['https://www.facebook.com/share/v/1AsqfoELTb/', '<iframe src="https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fv%2F1AsqfoELTb%2F&amp;show_text=false"></iframe>']) {
    const media = describeVideoSource({ url });
    assert.equal(media.provider, 'facebook'); assert.equal(media.watchUrl, canonical);
    assert.equal(new URL(media.embedUrl!).searchParams.get('href'), canonical);
  }
});
test('numeric Facebook titled permalinks work and lookalike hosts never resolve through the share alias', () => {
  assert.equal(describeVideoSource({ url: 'https://www.facebook.com/MinberAqsa/videos/restoration-in-jerusalem/1762295867563749/' }).provider, 'facebook');
  assert.equal(describeVideoSource({ url: 'https://facebook.com.evil.invalid/share/v/1AsqfoELTb/' }).embedUrl, null);
  assert.equal(describeVideoSource({ url: 'https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Ffacebook.com.evil.invalid%2Fshare%2Fv%2F1AsqfoELTb%2F' }).embedUrl, null);
});
