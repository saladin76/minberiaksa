import assert from "node:assert/strict";
import { test } from "node:test";
import { selectProjectImages, projectImageAttempts, publicCampaignImage, publicCampaignImages, PUBLIC_CAMPAIGN_IMAGE_PLACEHOLDER } from "../../lib/minbar/project-image-fallback";

test("localized cover keeps the campaign's original cover as a fallback", () => {
  const media = selectProjectImages("https://example.com/tr-cover.jpg", [
    "https://example.com/original.jpg",
    "https://example.com/gallery.jpg",
  ]);
  assert.equal(media.cover, "https://example.com/tr-cover.jpg");
  assert.deepEqual(media.images, [
    "https://example.com/tr-cover.jpg",
    "https://example.com/gallery.jpg",
  ]);
  assert.deepEqual(media.coverFallbacks, [
    "https://example.com/original.jpg",
    "https://example.com/gallery.jpg",
  ]);
});

test("untranslated project keeps cover and gallery without duplicates", () => {
  const media = selectProjectImages(null, [
    " https://example.com/cover.jpg ",
    "https://example.com/cover.jpg",
    "https://example.com/second.jpg",
  ]);
  assert.deepEqual(media.images, ["https://example.com/cover.jpg", "https://example.com/second.jpg"]);
  assert.deepEqual(media.coverFallbacks, ["https://example.com/second.jpg"]);
});

test("an optimized Cloudinary image retries the original before another photo", () => {
  const original = "https://res.cloudinary.com/demo/image/upload/v1/water.jpg";
  const second = "https://example.com/other.jpg";
  const attempts = projectImageAttempts([original, second, original], 360);
  assert.match(attempts[0].src, /f_auto,q_auto,c_limit,w_/);
  assert.equal(attempts[1].src, original);
  assert.equal(attempts[2].src, second);
  assert.equal(attempts.length, 3);
});

test("missing images do not produce broken requests", () => {
  assert.deepEqual(projectImageAttempts([null, "", "   "], 360), []);
  assert.deepEqual(selectProjectImages(null, []), { cover: null, images: [], coverFallbacks: [] });
});


test("retired Cloudinary photos are not exposed as gallery slides or image attempts", () => {
  const old = "https://res.cloudinary.com/z9drzccl/image/upload/v1234/dead.jpg";
  const current = "https://res.cloudinary.com/idhqsozi/image/upload/v9999/recovered.jpg";
  const media = selectProjectImages(old, [old, current]);
  assert.equal(media.cover, current);
  assert.deepEqual(media.images, [current]);
  assert.deepEqual(media.coverFallbacks, []);
  assert.deepEqual(projectImageAttempts([old], 360), []);
  assert.equal(projectImageAttempts([current], 360).length, 2);
});

test("all retired photos render an empty-media state without mutating CMS URLs", () => {
  const old = "https://res.cloudinary.com/z9drzccl/image/upload/v1/old.jpg";
  const originals = [old];
  assert.deepEqual(selectProjectImages(old, originals), {
    cover: null, images: [], coverFallbacks: [],
  });
  assert.deepEqual(originals, [old]);
});


test("legacy campaign cards, cart thumbnails and share previews choose the first usable same-campaign image", () => {
  const old = "https://res.cloudinary.com/z9drzccl/image/upload/v1/lost.jpg";
  const saved = "https://res.cloudinary.com/replacement/image/upload/v2/actual.jpg";
  const urls = [old, saved, saved];
  assert.deepEqual(publicCampaignImages(urls), [saved]);
  assert.equal(publicCampaignImage(urls), saved);
  assert.deepEqual(urls, [old, saved, saved]);
});

test("legacy campaigns with no recoverable image use only the neutral local institution mark", () => {
  const old = "https://res.cloudinary.com/z9drzccl/image/upload/v1/lost.jpg";
  assert.deepEqual(publicCampaignImages([old]), []);
  assert.equal(publicCampaignImage([old]), PUBLIC_CAMPAIGN_IMAGE_PLACEHOLDER);
  assert.equal(publicCampaignImage([]), "/minbar/assets/logo-mark.png");
});
