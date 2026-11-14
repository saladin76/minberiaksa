/**
 * Check that the PM2 runtime uses an active Cloudinary environment.
 * Read-only by default. --probe explicitly uploads and removes one test image.
 * Never prints Cloudinary credentials or alters any CMS/donor media.
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(new URL("../package.json", import.meta.url));
const { v2: cloudinary } = require("cloudinary");
const env = process.env;
const required = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
const missing = required.filter((key) => !env[key]?.trim());
if (missing.length) {
  console.error(`CLOUDINARY_CONFIG_MISSING: ${missing.join(", ")}`);
  process.exitCode = 2;
} else {
  const cloudName = env.CLOUDINARY_CLOUD_NAME.trim();
  let urlCloud;
  if (env.CLOUDINARY_URL) {
    try { urlCloud = new URL(env.CLOUDINARY_URL).hostname; }
    catch { console.error("CLOUDINARY_URL_MALFORMED"); process.exitCode = 2; }
  }
  if (urlCloud && urlCloud !== cloudName) {
    console.error("CLOUDINARY_URL_MISMATCH: CLOUDINARY_URL points to a different cloud");
    process.exitCode = 2;
  }
  console.log(`CLOUDINARY_CONFIG: ${process.exitCode ? "FAIL" : "READY"}; cloud=${cloudName}`);
  if (!process.exitCode && process.argv.includes("--probe")) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    const name = `minber-upload-check-${randomUUID()}`;
    const id = `qa-preflight/${name}`;
    const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/dZkAAAAASUVORK5CYII=";
    let created = false;
    try {
      const result = await cloudinary.uploader.upload(image, {
        folder: "qa-preflight", public_id: name, overwrite: false, resource_type: "image"
      });
      created = true;
      const response = await fetch(result.secure_url, {
        method: "GET", signal: AbortSignal.timeout(15000),
      });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
        throw new Error(`delivery status ${response.status}`);
      }
      console.log("CLOUDINARY_UPLOAD_AND_DELIVERY: PASS");
    } catch (error) {
      console.error(`CLOUDINARY_UPLOAD_AND_DELIVERY: FAIL (${error?.message ?? String(error)})`);
      process.exitCode = 1;
    } finally {
      if (created) {
        try {
          const removed = await cloudinary.uploader.destroy(id, {
            resource_type: "image", invalidate: true,
          });
          if (removed.result !== "ok") throw new Error(`destroy status ${removed.result}`);
          console.log("CLOUDINARY_TEST_CLEANUP: PASS");
        } catch (error) {
          console.error(`CLOUDINARY_TEST_CLEANUP: FAIL (${error?.message ?? String(error)})`);
          process.exitCode = 1;
        }
      }
    }
  }
}
