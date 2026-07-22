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
  .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 9, palette: true, quality: 100, colours: 32 })
  .toFile(pngPath);

await sharp(svg, { density: 144 })
  .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
  .webp({ lossless: true, effort: 6 })
  .toFile(webpPath);

async function verifySeam(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== size || info.height !== size) throw new Error(`${file} is not ${size}x${size}`);
  const channels = info.channels;
  let maxDifference = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const left = data[(y * info.width) * channels + channel];
      const right = data[(y * info.width + info.width - 1) * channels + channel];
      maxDifference = Math.max(maxDifference, Math.abs(left - right));
    }
  }
  for (let x = 0; x < info.width; x += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const top = data[x * channels + channel];
      const bottom = data[((info.height - 1) * info.width + x) * channels + channel];
      maxDifference = Math.max(maxDifference, Math.abs(top - bottom));
    }
  }
  if (maxDifference > 2) throw new Error(`${file} seam edge difference is ${maxDifference}`);
  return { width: info.width, height: info.height, channels, maxDifference };
}

const results = {
  png: await verifySeam(pngPath),
  webp: await verifySeam(webpPath),
};
console.log(JSON.stringify(results, null, 2));
