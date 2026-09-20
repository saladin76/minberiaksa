import "server-only";

import { existsSync } from "node:fs";
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
 *   - anywhere else, a Chrome/Edge/Chromium on the machine — set
 *     `PUPPETEER_EXECUTABLE_PATH` to pick one explicitly, otherwise the usual
 *     install locations are tried.
 *
 * One browser per process, launched on first use and reused; a crashed one is
 * relaunched on the next call.
 */

export interface PdfOptions {
  landscape: boolean;
  /** Page margins in mm — the `@page` rules already set them, this is the fallback. */
  marginMm?: number;
}

const isServerless = () => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL);

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
    const chromium = await import("@sparticuz/chromium");
    const executablePath = await chromium.default.executablePath();
    return puppeteer.default.launch({
      args: chromium.default.args,
      executablePath,
      headless: true,
      defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    });
  }

  const executablePath = LOCAL_CANDIDATES.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!executablePath) {
    throw new PdfRendererUnavailableError("no Chrome/Chromium found — set PUPPETEER_EXECUTABLE_PATH");
  }
  return puppeteer.default.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
  });
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
