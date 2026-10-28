// Real Next header matching and native Chromium capture; synthetic microphone only.
// No application database, provider upload or donor message is involved.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import importedConfig from "../next.config.ts";

// Next normally installs this during server boot; its config testing utility needs it too.
globalThis.AsyncLocalStorage = AsyncLocalStorage;
const require = createRequire(import.meta.url);
const { unstable_getResponseFromNextConfig } = require("next/experimental/testing/server");
const nextConfig = importedConfig.default || importedConfig;
const artifacts = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || ".artifacts/content-editor", "inbox-permissions");
await mkdir(artifacts, { recursive: true });
let checks = 0;
const routes = [
  ["/ar", false],
  ["/ar/bagislar/alquds-home-restoration", false],
  ["/dashboard", false],
  ["/dashboard/inbox", false],
  ["/dashboard/communication/campaigns", false],
  ["/dashboard/communication/inbox-other", false],
  ["/api/dashboard/communication/inbox", false],
  ["/dashboard/communication/inbox", true],
  ["/dashboard/communication/inbox/", true],
  ["/dashboard/communication/inbox/conversation", true],
];
for (const [pathname, allowed] of routes) {
  const response = await unstable_getResponseFromNextConfig({ url: `https://minberiaksa.org${pathname}`, nextConfig });
  const policy = response.headers.get("permissions-policy");
  assert.ok(policy?.includes(allowed ? "microphone=(self)" : "microphone=()"), pathname);
  for (const directive of ["camera=()", "geolocation=()", "browsing-topics=()"]) assert.ok(policy.includes(directive), pathname);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  checks++;
}
const bundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {InboxPermissionsBoundary} from './components/dashboard/InboxPermissionsBoundary';createRoot(document.getElementById('boundary')).render(<InboxPermissionsBoundary><span id="boundary-ready">Ready</span></InboxPermissionsBoundary>);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
  plugins: [{ name: "router-fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `import {useSyncExternalStore} from 'react';const subscribe=callback=>{window.addEventListener('popstate',callback);return ()=>window.removeEventListener('popstate',callback)};export function usePathname(){return useSyncExternalStore(subscribe,()=>location.pathname,()=>'/dashboard')}`, loader: "js", resolveDir: process.cwd() }));
  } }],
});
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="boundary"></div>
<a id="inbox-link" href="/dashboard/communication/inbox?thread=fixture#composer">Inbox</a>
<a id="same-link" href="/dashboard/communication/inbox/conversation?thread=fixture">Conversation</a>
<a id="dashboard-link" href="/dashboard">Dashboard</a>
<button type="button" id="command-inbox">Open inbox with command</button>
<button type="button" id="command-dashboard">Open dashboard with command</button>
<button type="button" id="record">Record synthetic voice</button><p role="status">Ready</p>
<script>
window.fixtureDocumentId=Math.random();
window.clientNavigate=path=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));};
document.getElementById('command-inbox').onclick=()=>window.clientNavigate('/dashboard/communication/inbox?thread=command#composer');
document.getElementById('command-dashboard').onclick=()=>window.clientNavigate('/ar');
document.querySelectorAll('a').forEach(anchor=>anchor.onclick=event=>{if(event.defaultPrevented)return;event.preventDefault();window.clientNavigate(anchor.href);});
window.captureRequests=0;
document.getElementById('record').onclick=async()=>{
  window.captureRequests++;
  let stream;
  try {
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const chunks=[],recorder=new MediaRecorder(stream);
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    recorder.onstop=()=>{
      stream.getTracks().forEach(track=>track.stop());
      window.captureResult={recorded:true,bytes:new Blob(chunks).size,tracksEnded:stream.getTracks().every(track=>track.readyState==='ended')};
      document.querySelector('[role=status]').textContent='Recorded';
    };
    recorder.start();setTimeout(()=>recorder.stop(),200);
  } catch(error) {
    stream?.getTracks().forEach(track=>track.stop());
    window.captureResult={recorded:false,error:error.name};
    document.querySelector('[role=status]').textContent='Blocked';
  }
};
</script><script src="/boundary.js"></script></body></html>`;
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/boundary.js") { response.setHeader("content-type", "application/javascript"); return response.end(bundle.outputFiles[0].text); }
    const result = await unstable_getResponseFromNextConfig({ url: `http://127.0.0.1${request.url}`, nextConfig });
    for (const [key, value] of result.headers) response.setHeader(key, value);
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html);
  } catch { response.statusCode = 500; response.end("Fixture header evaluation failed"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const external = [], errors = [];
try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  for (const [pathname, allowed] of [["/ar", false], ["/dashboard/communication/inbox", true]]) {
    const page = await browser.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (!request.url().startsWith(origin)) external.push(request.url()); });
    await page.goto(origin + pathname);
    await page.locator("#boundary-ready").waitFor();
    assert.equal(await page.evaluate(() => window.captureRequests), 0, "capture requires a click");
    assert.equal(await page.evaluate(() => (document.permissionsPolicy || document.featurePolicy).allowsFeature("microphone")), allowed);
    checks++;
    await page.locator("#record").click();
    await expect.poll(() => page.evaluate(() => window.captureResult)).toBeTruthy();
    const result = await page.evaluate(() => window.captureResult);
    assert.equal(result.recorded, allowed);
    if (allowed) { assert.ok(result.bytes > 0); assert.equal(result.tracksEnded, true); }
    else assert.equal(result.error, "NotAllowedError");
    checks++;
    await page.screenshot({ path: path.join(artifacts, allowed ? "inbox-recording.png" : "public-recording-blocked.png") });
    await page.close();
  }
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/dashboard");await page.locator("#boundary-ready").waitFor();
  async function navigateDocument(selector, pathname) {
    const previous = await page.evaluate(() => window.fixtureDocumentId);
    const documentResponse = page.waitForResponse(response => response.request().isNavigationRequest() && new URL(response.url()).pathname === pathname);
    await page.locator(selector).click();await documentResponse;
    await page.waitForLoadState("domcontentloaded");await page.locator("#boundary-ready").waitFor();
    assert.notEqual(await page.evaluate(() => window.fixtureDocumentId), previous);
  }
  await navigateDocument("#inbox-link", "/dashboard/communication/inbox");
  assert.equal(new URL(page.url()).search, "?thread=fixture");assert.equal(new URL(page.url()).hash, "#composer");
  assert.equal(await page.evaluate(() => (document.permissionsPolicy || document.featurePolicy).allowsFeature("microphone")), true);checks++;
  await page.locator("#record").click();await expect.poll(() => page.evaluate(() => window.captureResult?.recorded)).toBe(true);checks++;
  const documentId = await page.evaluate(() => window.fixtureDocumentId);
  await page.locator("#same-link").click();await expect.poll(() => new URL(page.url()).pathname).toBe("/dashboard/communication/inbox/conversation");
  assert.equal(await page.evaluate(() => window.fixtureDocumentId), documentId);checks++;
  await navigateDocument("#dashboard-link", "/dashboard");
  assert.equal(await page.evaluate(() => (document.permissionsPolicy || document.featurePolicy).allowsFeature("microphone")), false);checks++;
  await navigateDocument("#command-inbox", "/dashboard/communication/inbox");
  assert.equal(new URL(page.url()).search, "?thread=command");assert.equal(new URL(page.url()).hash, "#composer");
  assert.equal(await page.evaluate(() => (document.permissionsPolicy || document.featurePolicy).allowsFeature("microphone")), true);checks++;
  await navigateDocument("#command-dashboard", "/ar");
  assert.equal(await page.evaluate(() => (document.permissionsPolicy || document.featurePolicy).allowsFeature("microphone")), false);checks++;
  await page.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(path.join(artifacts, "result.json"), JSON.stringify({ checks, errors, externalRequests: external.length, productionWrites: 0, providerCalls: 0, syntheticMicrophone: true }, null, 2));
  console.log(`Inbox microphone policy browser checks: ${checks} passed`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
