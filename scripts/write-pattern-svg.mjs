import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const sourceDirectory = path.resolve("scripts/pattern-source");
const outputPath = path.resolve("public/assets/patterns/aqsa-white-pattern.svg");
const parts = (await fs.readdir(sourceDirectory)).sort();
const encoded = (await Promise.all(parts.map((part) => fs.readFile(path.join(sourceDirectory, part), "utf8"))))
  .join("")
  .replace(/\s+/g, "");
const svg = gunzipSync(Buffer.from(encoded, "base64"));
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, svg);
console.log(`Wrote ${outputPath} (${svg.length} bytes from ${parts.length} source parts)`);
