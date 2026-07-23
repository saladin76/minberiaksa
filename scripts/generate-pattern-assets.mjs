import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const directory = path.resolve("public/assets/patterns");
const svgPath = path.join(directory, "aqsa-white-pattern.svg");
const pngPath = path.join(directory, "aqsa-white-pattern.png");
const webpPath = path.join(directory, "aqsa-white-pattern.webp");
const size = 2508;
const svg = await fs.readFile(svgPath);

const rendered = await sharp(svg, { density: 144 })
  .resize(size, size, { fit: "fill" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const pixels = Buffer.from(rendered.data);
const channels = rendered.info.channels;
const pixelOffset = (x, y, channel) => ((y * size + x) * channels) + channel;

for (let y = 0; y < size; y += 1) {
  for (let channel = 0; channel < channels; channel += 1) {
    pixels[pixelOffset(size - 1, y, channel)] = pixels[pixelOffset(0, y, channel)];
  }
}
for (let x = 0; x < size; x += 1) {
  for (let channel = 0; channel < channels; channel += 1) {
    pixels[pixelOffset(x, size - 1, channel)] = pixels[pixelOffset(x, 0, channel)];
  }
}

const raster = () => sharp(pixels, { raw: { width: size, height: size, channels } });
await raster().png({ compressionLevel: 9 }).toFile(pngPath);
await raster().webp({ lossless: true, effort: 6 }).toFile(webpPath);

async function verifySeam(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== size || info.height !== size) throw new Error(`${file} is not ${size}x${size}`);
  let maxDifference = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let channel = 0; channel < info.channels; channel += 1) {
      const left = data[((y * info.width) * info.channels) + channel];
      const right = data[((y * info.width + info.width - 1) * info.channels) + channel];
      maxDifference = Math.max(maxDifference, Math.abs(left - right));
    }
  }
  for (let x = 0; x < info.width; x += 1) {
    for (let channel = 0; channel < info.channels; channel += 1) {
      const top = data[(x * info.channels) + channel];
      const bottom = data[(((info.height - 1) * info.width + x) * info.channels) + channel];
      maxDifference = Math.max(maxDifference, Math.abs(top - bottom));
    }
  }
  if (maxDifference !== 0) throw new Error(`${file} seam edge difference is ${maxDifference}`);
  return { width: info.width, height: info.height, channels: info.channels, maxDifference };
}

const results = {
  png: await verifySeam(pngPath),
  webp: await verifySeam(webpPath),
};
console.log(JSON.stringify(results, null, 2));
