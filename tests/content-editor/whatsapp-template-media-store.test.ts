import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  openLocalWhatsappTemplateMedia,
  removeWhatsappTemplateMedia,
  storeWhatsappTemplateMedia,
  templateMediaPublicUrl,
  validWhatsappTemplateMediaId,
  whatsappTemplateMediaStorageMode,
} from "../../lib/communication/whatsapp-template-media-store";

test("VPS uses persistent disk, serverless requires configured Blob store", () => {
  assert.equal(whatsappTemplateMediaStorageMode({} as NodeJS.ProcessEnv), "LOCAL");
  assert.equal(whatsappTemplateMediaStorageMode({ VERCEL: "1" } as NodeJS.ProcessEnv), "UNAVAILABLE");
  assert.equal(whatsappTemplateMediaStorageMode({
    VERCEL: "1", BLOB_READ_WRITE_TOKEN: "test",
  } as NodeJS.ProcessEnv), "BLOB");
});

test("published URLs are HTTPS and opaque random filenames", () => {
  const id = "1ddac7a9-210e-4c46-9251-111111111111.pdf";
  assert.equal(validWhatsappTemplateMediaId(id), true);
  assert.equal(validWhatsappTemplateMediaId("../test.pdf"), false);
  assert.equal(templateMediaPublicUrl(id, {
    NEXT_PUBLIC_SITE_URL: "https://minberiaksa.org",
  } as NodeJS.ProcessEnv), `https://minberiaksa.org/api/public/whatsapp-template-media/${id}`);
  assert.throws(() => templateMediaPublicUrl(id, {
    NEXT_PUBLIC_SITE_URL: "http://minberiaksa.org",
  } as NodeJS.ProcessEnv));
});

test("PDF and image files remain readable after durable upload, then delete safely", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "minber-template-media-"));
  const previousDir = process.env.WHATSAPP_TEMPLATE_MEDIA_DIR;
  const previousBlob = process.env.BLOB_READ_WRITE_TOKEN;
  const previousVercel = process.env.VERCEL;
  const previousOrigin = process.env.WHATSAPP_TEMPLATE_MEDIA_PUBLIC_BASE_URL;
  try {
    process.env.WHATSAPP_TEMPLATE_MEDIA_DIR = dir;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    process.env.WHATSAPP_TEMPLATE_MEDIA_PUBLIC_BASE_URL = "https://minberiaksa.org";
    for (const [mime, data] of [
      ["application/pdf", "%PDF-1.7\nexample"],
      ["image/jpeg", "fake-test-bytes"],
    ] as const) {
      const media = await storeWhatsappTemplateMedia(Buffer.from(data), mime);
      assert.equal(media.mode, "LOCAL");
      assert.equal(validWhatsappTemplateMediaId(media.id), true);
      assert.equal(await readFile(media.localFile!, "utf8"), data);
      const opened = await openLocalWhatsappTemplateMedia(media.id);
      assert.equal(opened?.type, mime);
      assert.equal(opened?.bytes, Buffer.byteLength(data));
      await removeWhatsappTemplateMedia(media);
      assert.equal(await openLocalWhatsappTemplateMedia(media.id), null);
    }
    assert.equal(await openLocalWhatsappTemplateMedia("../etc/passwd"), null);
  } finally {
    if (previousDir === undefined) delete process.env.WHATSAPP_TEMPLATE_MEDIA_DIR;
    else process.env.WHATSAPP_TEMPLATE_MEDIA_DIR = previousDir;
    if (previousBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousBlob;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousOrigin === undefined) delete process.env.WHATSAPP_TEMPLATE_MEDIA_PUBLIC_BASE_URL;
    else process.env.WHATSAPP_TEMPLATE_MEDIA_PUBLIC_BASE_URL = previousOrigin;
    await rm(dir, { recursive: true, force: true });
  }
});
