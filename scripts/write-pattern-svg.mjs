import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const encodedPath = path.resolve("scripts/aqsa-pattern.svg.gz.b64");
const outputPath = path.resolve("public/assets/patterns/aqsa-white-pattern.svg");
const encoded = (await fs.readFile(encodedPath, "utf8")).replace(/\s+/g, "");
const svg = gunzipSync(Buffer.from(encoded, "base64"));
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, svg);
console.log(`Wrote ${outputPath} (${svg.length} bytes)`);
