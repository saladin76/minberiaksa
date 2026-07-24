import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const output = path.resolve("artifacts/site-visual-qa");
const screenshotsDir = path.join(output, "screenshots");
const projectSlugs = ["gaza-food-parcels","gaza-hot-meals","gaza-bread","gaza-water","gaza-winter-relief","gaza-iftar","gaza-zakat-al-fitr","al-quds-home-restoration","al-quds-family-relief","al-quds-education-sponsorship","al-quds-learning-centres","al-aqsa-quran-programmes","al-aqsa-lectures-and-pathways","al-quds-young-leaders","al-quds-olive-harvest","al-aqsa-umrah-visit","zakat-for-palestine","waqf-for-al-quds","monthly-palestine-support","syria-emergency-relief","sudan-qurbani","global-qurbani"];
const viewports = [{name:"mobile-390",width:390,height:844},{name:"mobile-360",width:360,height:800}];
const report = [];
const browser = await chromium.launch({headless:true});
for (const viewport of viewports) {
  const folder = path.join(screenshotsDir, viewport.name);
  await fs.mkdir(folder,{recursive:true});
  for (const slug of projectSlugs) {
    const context = await browser.newContext({viewport:{width:viewport.width,height:viewport.height},locale:"ar-SA",reducedMotion:"reduce"});
    const page = await context.newPage();
    const failed=[]; page.on("requestfailed",r=>failed.push(r.url()));
    const response=await page.goto(`${baseURL}/projects/${slug}`,{waitUntil:"domcontentloaded",timeout:45000});
    await page.waitForLoadState("load",{timeout:20000}).catch(()=>{}); await page.evaluate(()=>document.fonts.ready).catch(()=>{}); await page.waitForTimeout(700);
    const audit=await page.evaluate((width)=>({scrollWidth:document.documentElement.scrollWidth,horizontalOverflow:document.documentElement.scrollWidth-width,heroColumns:getComputedStyle(document.querySelector(".project-detail-hero")).gridTemplateColumns,heroWidth:Math.round(document.querySelector(".project-detail-hero").getBoundingClientRect().width),titleWidth:Math.round(document.querySelector("#project-title").getBoundingClientRect().width),pageHeight:document.documentElement.scrollHeight,brokenImages:[...document.images].filter(i=>!i.hidden&&(!i.complete||i.naturalWidth===0)).length}),viewport.width);
    const filename=`project-${slug}.png`; await page.screenshot({path:path.join(folder,filename),fullPage:true,animations:"disabled"});
    report.push({slug,viewport:viewport.name,status:response?.status()??null,failedRequests:failed.length,...audit});
    await context.close();
  }
}
await browser.close();
async function sheet(viewportName,filename){const gap=16,columns=4,tileWidth=220,tileHeight=420,rows=Math.ceil(projectSlugs.length/columns),composites=[];for(let i=0;i<projectSlugs.length;i++){const input=path.join(screenshotsDir,viewportName,`project-${projectSlugs[i]}.png`);const image=await sharp(input).resize(tileWidth,tileHeight,{fit:"contain",background:"#fff",position:"top"}).png().toBuffer();composites.push({input:image,left:gap+(i%columns)*(tileWidth+gap),top:gap+Math.floor(i/columns)*(tileHeight+gap)});}await sharp({create:{width:columns*tileWidth+(columns+1)*gap,height:rows*tileHeight+(rows+1)*gap,channels:4,background:"#f3f0e8"}}).composite(composites).png().toFile(path.join(output,filename));}
await sheet("mobile-390","mobile-projects-contact-sheet.png"); await sheet("mobile-360","mobile-360-projects-contact-sheet.png");
await fs.writeFile(path.join(output,"mobile-projects-approval.json"),JSON.stringify(report,null,2));
const critical=report.filter(x=>x.status!==200||x.horizontalOverflow>2||x.brokenImages>0||x.heroColumns.trim().split(/\s+/).length!==1||x.titleWidth<280);
await fs.writeFile(path.join(output,"mobile-projects-critical.json"),JSON.stringify(critical,null,2));
console.log(JSON.stringify({captures:report.length,critical:critical.length})); if(critical.length)process.exitCode=1;
