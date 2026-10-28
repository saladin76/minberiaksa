// Browser playback fixtures only: no Meta calls and no real conversation records.
import {build} from "esbuild";
import {chromium,expect} from "@playwright/test";
import {createServer} from "node:http";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
const require=createRequire(import.meta.url),dict={en:require("../lib/dashboard/i18n/catalog/en.json"),tr:require("../lib/dashboard/i18n/catalog/tr.json")};
const ui=(locale,key)=>locale==="ar"?key:dict[locale][key]||key;
const artifacts=path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS||".artifacts/content-editor","inbox-media");await mkdir(artifacts,{recursive:true});
const audio=Buffer.from("T2dnUwACAAAAAAAAAADY5fqLAAAAALiHUcEBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAANjl+osBAAAAah7FJQE+T3B1c1RhZ3MNAAAATGF2ZjYwLjE2LjEwMAEAAAAdAAAAZW5jb2Rlcj1MYXZjNjAuMzEuMTAyIGxpYm9wdXNPZ2dTAAS4JgAAAAAAANjl+osCAAAAR6lh2gsDAwMDAwMDAwMDA/j//vj//vj//vj//vj//vj//vj//vj//vj//vj//vj//g==","base64");
const image=await readFile("public/minbar/assets/aqsa-dome-line.png");
const bundle=await build({stdin:{contents:`import React from "react";import {createRoot} from "react-dom/client";import {InboxMedia} from "./app/(dashboard)/dashboard/communication/inbox/_components/InboxMedia";import {setDashLocale} from "./lib/dashboard/i18n";const locale=new URLSearchParams(location.search).get("lang")||"ar";setDashLocale(locale);document.documentElement.lang=locale;document.documentElement.dir=locale==="ar"?"rtl":"ltr";createRoot(document.getElementById("root")).render(<main className="mx-auto max-w-2xl space-y-4 p-4"><h1 className="text-xl font-bold">Inbox media fixture</h1>{["image","audio","document"].map((kind,index)=><article key={kind} className="max-w-full rounded-2xl rounded-ss-none border bg-emerald-50 p-4"><InboxMedia conversationId="aaaaaaaaaaaaaaaaaaaaaaaa:+15555555555" itemId={"event:"+String(index+1).repeat(24)} media={{kind,filename:kind==="document"?"receipt.pdf":null,caption:kind==="image"?"Field image":null}}/></article>)}</main>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,jsx:"automatic",tsconfig:path.join(process.cwd(),"tsconfig.json"),define:{"process.env.NODE_ENV":'"test"'}});
if(process.env.CHECK_BUNDLE_ONLY){console.log("Inbox media browser bundle: compiled");process.exit(0);}
const css=(await postcss([tailwindcss({...require("../tailwind.config.ts").default,content:["app/(dashboard)/dashboard/communication/inbox/_components/InboxMedia.tsx","scripts/inbox-media-browser-test.mjs"]})]).process("@tailwind base;@tailwind components;@tailwind utilities;",{from:undefined})).css+"body{margin:0;font-family:system-ui,sans-serif;background:#f1f5f9}audio{max-width:100%}img{background:#cbd5e1}";
const requests=[];let failImage=false;
const server=createServer((req,res)=>{
 const url=new URL(req.url,"http://fixture");requests.push(url.pathname+url.search);
 if(url.pathname.includes("/media/")){
  res.setHeader("Cache-Control","private, no-store");
  if(url.pathname.includes("1".repeat(24))){if(failImage&&url.searchParams.get("retry")==="0"){res.statusCode=502;return res.end();}res.setHeader("Content-Type","image/png");return res.end(image);}
  if(url.pathname.includes("2".repeat(24))){res.setHeader("Content-Type","audio/ogg");return res.end(audio);}
  res.setHeader("Content-Type","application/pdf");res.setHeader("Content-Disposition",'attachment; filename="receipt.pdf"');return res.end("%PDF-1.4\n% Synthetic fixture only\n%%EOF");
 }
 if(url.pathname==="/bundle.js"){res.setHeader("Content-Type","application/javascript");return res.end(bundle.outputFiles[0].text);}
 if(url.pathname==="/test.css"){res.setHeader("Content-Type","text/css");return res.end(css);}
 res.setHeader("Content-Type","text/html");res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser,checks=0;const errors=[],external=[];
try{
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--autoplay-policy=no-user-gesture-required"]});
 for(const locale of ["ar","en","tr"]){const page=await browser.newPage({viewport:{width:1100,height:950}});page.on("pageerror",error=>errors.push(error.message));page.on("request",request=>{if(!request.url().startsWith(origin))external.push(request.url());});
  await page.goto(`${origin}/?lang=${locale}`);const photo=page.getByRole("img",{name:"Field image",exact:true});await expect.poll(()=>photo.evaluate(node=>node.naturalWidth)).toBeGreaterThan(0);checks++;
  // Audio elements have no implicit ARIA role; address the accessible label directly.
  const playable=page.getByLabel(ui(locale,"تشغيل الرسالة الصوتية"),{exact:true});await playable.evaluate(node=>node.play());await expect.poll(()=>playable.evaluate(node=>node.currentTime)).toBeGreaterThan(0);await playable.evaluate(node=>node.pause());checks++;
  assert.equal(await playable.getAttribute("controls"),"");assert.match(await playable.getAttribute("src"),/^\/api\/dashboard\/communication\/inbox\//);checks++;
  const download=page.waitForEvent("download");await page.getByRole("link",{name:"receipt.pdf",exact:true}).click();assert.equal((await download).suggestedFilename(),"receipt.pdf");checks++;
  for(const width of [1100,390,320]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(artifacts,`${locale}-media-${width}.png`),fullPage:true,animations:"disabled"});checks++;}
  failImage=true;await page.goto(`${origin}/?lang=${locale}&failure=1`);await page.getByText(ui(locale,"تعذر تحميل المرفق. أعد المحاولة أو اطلب إعادة إرساله."),{exact:true}).waitFor();await page.getByRole("button",{name:ui(locale,"إعادة المحاولة"),exact:true}).click();await expect.poll(()=>photo.evaluate(node=>node.naturalWidth)).toBeGreaterThan(0);failImage=false;checks++;
  await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.ok(requests.some(url=>url.includes("retry=1")));await writeFile(path.join(artifacts,"result.json"),JSON.stringify({checks,errors,external,providerCalls:0},null,2));console.log(`Inbox media browser checks: ${checks} passed`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
