import "server-only";

import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "puppeteer-core";

/**
 * HTML → PDF through headless Chromium.
 *
 * The documents are HTML with container queries, web fonts and background
 * artwork; only a real browser engine prints them faithfully, which is why
 * the handoff recommends Puppeteer over a PDF drawing library.
 *
 * Two ways to find a browser:
 *   - on Vercel / AWS Lambda, `@sparticuz/chromium` ships a build that fits
 *     the function bundle;
 *   - anywhere else, a Chrome/Edge/Chromium on the machine  set
 *     `PUPPETEER_EXECUTABLE_PATH` to pick one explicitly, otherwise the usual
 *     install locations are tried;
 *   - on a Linux x64 server with none of those (the VPS), the same remote
 *     pack as on Vercel, unpacked into the temp dir together with the shared
 *     libraries it links against, so no system package has to be installed.
 *
 * One browser per process, launched on first use and reused; a crashed one is
 * relaunched on the next call.
 */

export interface PdfOptions {
  landscape: boolean;
  /** Page margins in mm  the `@page` rules already set them, this is the fallback. */
  marginMm?: number;
}

const isServerless = () => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL);

/**
 * Keep Chromium binaries OUT of the Vercel function bundles.
 *
 * @sparticuz/chromium supports downloading its compressed pack from HTTPS and
 * extracting it into /tmp. Vercel then caches the extracted executable for the
 * lifetime of the warm function process. This avoids duplicating ~68 MB of
 * Chromium archives across every route that can issue/attach donation PDFs.
 *
 * CHROMIUM_REMOTE_PACK_URL is an escape hatch so the pack can later be mirrored
 * to our own CDN/Blob storage without a code release. The pinned official pack
 * matches the installed @sparticuz/chromium-min 138.0.2 package.
 */
const REMOTE_CHROMIUM_PACK =
  process.env.CHROMIUM_REMOTE_PACK_URL?.trim() ||
  "https://github.com/Sparticuz/chromium/releases/download/v138.0.2/chromium-v138.0.2-pack.x64.tar";

const LOCAL_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

export class PdfRendererUnavailableError extends Error {
  constructor(detail: string) {
    super(`PDF renderer unavailable: ${detail}`);
    this.name = "PdfRendererUnavailableError";
  }
}

let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");

  if (isServerless()) {
    const chromium = await import("@sparticuz/chromium-min");
    const executablePath = await chromium.default.executablePath(REMOTE_CHROMIUM_PACK);
    return puppeteer.default.launch({
      args: chromium.default.args,
      executablePath,
      headless: true,
      defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    });
  }

  const executablePath = LOCAL_CANDIDATES.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!executablePath) {
    if (process.platform === "linux" && process.arch === "x64") return launchRemotePack(puppeteer.default);
    throw new PdfRendererUnavailableError("no Chrome/Chromium found  set PUPPETEER_EXECUTABLE_PATH");
  }
  return puppeteer.default.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
  });
}

type Puppeteer = (typeof import("puppeteer-core"))["default"];

/**
 * The serverless Chromium on a plain Linux server. The pack unpacks the
 * NSS/expat libraries the binary links against (`al2023.tar.br`) only when it
 * believes it runs on Amazon Linux, so it is told so for the duration of the
 * import and the unpacking. The environment it rewrites is put back
 * afterwards, and the library path goes to the browser process alone.
 */
async function launchRemotePack(puppeteer: Puppeteer): Promise<Browser> {
  const libDir = join(tmpdir(), "al2023", "lib");
  const binary = join(tmpdir(), "chromium");
  // A binary unpacked without its libraries would never start: unpack again.
  if (existsSync(binary) && !existsSync(libDir)) rmSync(binary, { force: true });

  const keys = ["AWS_LAMBDA_JS_RUNTIME", "LD_LIBRARY_PATH", "FONTCONFIG_PATH", "HOME"] as const;
  const saved = keys.map((key) => [key, process.env[key]] as const);
  let executablePath: string;
  let args: string[];
  try {
    process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs22.x";
    const chromium = await import("@sparticuz/chromium-min");
    executablePath = await chromium.default.executablePath(REMOTE_CHROMIUM_PACK);
    args = chromium.default.args;
  } catch (error) {
    throw new PdfRendererUnavailableError(`could not fetch Chromium from ${REMOTE_CHROMIUM_PACK}: ${describe(error)}`);
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  try {
    return await puppeteer.launch({
      args,
      executablePath,
      headless: true,
      env: {
        ...process.env,
        LD_LIBRARY_PATH: [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"),
        FONTCONFIG_PATH: join(tmpdir(), "fonts"),
        HOME: process.env.HOME ?? tmpdir(),
      },
      defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    });
  } catch (error) {
    throw new PdfRendererUnavailableError(`Chromium did not start: ${describe(error)}`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch().catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

/** Render an HTML document to a PDF buffer. */
export async function htmlToPdf(html: string, options: PdfOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    /* Wait for the network to go quiet and for the fonts to be ready: a sheet
       printed before its web font or artwork arrived would fall back to
       whatever the machine has. */
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 30_000 }).catch(() => undefined);
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    const margin = `${options.marginMm ?? 0}mm`;
    const pdf = await page.pdf({
      format: "a4",
      landscape: options.landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}
