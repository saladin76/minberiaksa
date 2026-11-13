import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  imageDirectory, imageMediaType, imagePath, imageSignatureMatches,
  isVpsImageId, removePublicImage, savePublicImage,
} from "../../lib/uploads/vps-public-image";

const PNG = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
test("VPS image storage validates headers, UUID paths, origin, and persists bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "minber-upload-"));
  const previousDir = process.env.MINBAR_PUBLIC_IMAGE_DIR, previousOrigin = process.env.MINBAR_PUBLIC_IMAGE_ORIGIN;
  try {
    process.env.MINBAR_PUBLIC_IMAGE_DIR = dir;
    process.env.MINBAR_PUBLIC_IMAGE_ORIGIN = "https://minberiaksa.org";
    assert.equal(imageDirectory(), dir);
    const r = await savePublicImage(PNG, "image/png");
    assert.ok(isVpsImageId(r.public_id));
    assert.match(r.url, /^https:\/\/minberiaksa\.org\/api\/upload\/media\/vps-[\da-f-]+\.png$/);
    const file = imagePath(r.public_id + ".png");
    assert.ok(file);
    assert.deepEqual(await readFile(file!), PNG);
    assert.equal((await stat(file!)).isFile(), true);
    assert.equal(imageMediaType(r.public_id + ".png"), "image/png");
    assert.equal(imageMediaType("../../../../etc/passwd"), null);
    assert.equal(imageMediaType("vps-fake.svg"), null);
    await removePublicImage(r.public_id);
    await assert.rejects(() => stat(file!));
  } finally {
    if (previousDir === undefined) delete process.env.MINBAR_PUBLIC_IMAGE_DIR;
    else process.env.MINBAR_PUBLIC_IMAGE_DIR = previousDir;
    if (previousOrigin === undefined) delete process.env.MINBAR_PUBLIC_IMAGE_ORIGIN;
    else process.env.MINBAR_PUBLIC_IMAGE_ORIGIN = previousOrigin;
    await rm(dir, {recursive: true, force: true});
  }
});
test("upload refuses MIME mismatch, unsafe SVG and untrusted origin", async () => {
  const dir = await mkdtemp(join(tmpdir(), "minber-upload-"));
  const previousDir = process.env.MINBAR_PUBLIC_IMAGE_DIR, previousOrigin = process.env.MINBAR_PUBLIC_IMAGE_ORIGIN;
  try {
    process.env.MINBAR_PUBLIC_IMAGE_DIR = dir;
    process.env.MINBAR_PUBLIC_IMAGE_ORIGIN = "https://minberiaksa.org";
    assert.ok(imageSignatureMatches(PNG, "image/png"));
    assert.equal(imageSignatureMatches(PNG, "image/jpeg"), false);
    await assert.rejects(() => savePublicImage(PNG, "image/svg+xml"), /UNSUPPORTED/);
    await assert.rejects(() => savePublicImage(PNG, "image/jpeg"), /UNSUPPORTED/);
    process.env.MINBAR_PUBLIC_IMAGE_ORIGIN = "http://insecure.local";
    await assert.rejects(() => savePublicImage(PNG, "image/png"));
  } finally {
    if (previousDir === undefined) delete process.env.MINBAR_PUBLIC_IMAGE_DIR;
    else process.env.MINBAR_PUBLIC_IMAGE_DIR = previousDir;
    if (previousOrigin === undefined) delete process.env.MINBAR_PUBLIC_IMAGE_ORIGIN;
    else process.env.MINBAR_PUBLIC_IMAGE_ORIGIN = previousOrigin;
    await rm(dir, {recursive: true, force: true});
  }
});
test("shared upload route and immutable public endpoint use the VPS storage with legacy compatibility", () => {
  const upload = readFileSync("app/api/upload/route.ts", "utf8");
  assert.match(upload, /publicImageStorageEnabled\(\)/);
  assert.match(upload, /savePublicImage\(buffer, file\.type\.toLowerCase\(\)\)/);
  assert.match(upload, /isVpsImageId\(publicId\)/);
  const route = readFileSync("app/api/upload/media/[filename]/route.ts", "utf8");
  assert.match(route, /imageMediaType\(filename\)/);
  assert.match(route, /lstat\(target\)/);
});
