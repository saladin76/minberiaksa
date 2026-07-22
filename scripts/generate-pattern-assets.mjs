import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const directory = path.resolve("public/assets/patterns");
const svgPath = path.join(directory, "aqsa-white-pattern.svg");
const pngPath = path.join(directory, "aqsa-white-pattern.png");
const webpPath = path.join(directory, "aqsa-white-pattern.webp");
const size = 2508;
const svg = await fs.readFile(svgPath);

await sharp(svg, { density: 144 })
  .resize(size, size, { fit: "fill" })
  .png({ compressionLevel: 9 })
  .toFile(pngPath);

await sharp(svg, { density: 144 })
  .resize(size, size, { fit: "fill" })
  .webp({ quality: 95, effort: 6, smartSubsample: true })
  .toFile(webpPath);

async function verifySeam(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== size || info.height !== size) throw new Error(`${file} is not ${size}x${size}`);
  const channels = info.channels;
  let maxDifference = 0;
  let totalDifference = 0;
  let comparisons = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const left = data[(y * info.width) * channels + channel];
      const right = data[(y * info.width + info.width - 1) * channels + channel];
      const difference = Math.abs(left - right);
      maxDifference = Math.max(maxDifference, difference);
      totalDifference += difference;
      comparisons += 1;
    }
  }
  for (let x = 0; x < info.width; x += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const top = data[x * channels + channel];
      const bottom = data[((info.height - 1) * info.width + x) * channels + channel];
      const difference = Math.abs(top - bottom);
      maxDifference = Math.max(maxDifference, difference);
      totalDifference += difference;
      comparisons += 1;
    }
  }
  const averageDifference = totalDifference / comparisons;
  if (maxDifference > 12 || averageDifference > 0.5) {
    throw new Error(`${file} seam check failed: max=${maxDifference}, average=${averageDifference.toFixed(4)}`);
  }
  return { width: info.width, height: info.height, channels, maxDifference, averageDifference };
}

const results = {
  png: await verifySeam(pngPath),
  webp: await verifySeam(webpPath),
};
console.log(JSON.stringify(results, null, 2));
