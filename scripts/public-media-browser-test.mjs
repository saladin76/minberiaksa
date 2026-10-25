import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const videoId = "abcdefghijk";
const sources = [
  {title:"YouTube episode",url:"https://www.youtube.com/watch?v="+videoId+"&t=90"},
  {title:"Vimeo episode",url:"https://vimeo.com/123456789"},
  {title:"MP4 episode",url:"https://example.org/episode.mp4"},
];
const entry = [
  'import React from "react"; import {createRoot} from "react-dom/client";',
  'import {NextIntlClientProvider} from "next-intl";',
  'import ProgramsPage from "./components/minbar/videos/ProgramsPage";',
  'import CoursesPage from "./components/minbar/videos/CoursesPage";',
  'const sources='+JSON.stringify(sources)+';',
  'const messages={homepage:{watchFullSeries:"Watch full series",coursesTitle:"Courses",coursesLead:"Course recordings",kindSeminar:"Seminar",kindCourse:"Course",unitsCount:"Units",recordedVideo:"Recording",courseDetails:"Details",watchNow:"Watch"},common:{programsTitle:"Programmes",programsLead:"Recorded programmes",watchVideo:"Watch video",close:"Close"}};',
  'const playlists=[{id:"series",title:"Fixture series",description:"Source URL playback",youtubePlaylistUrl:"https://www.youtube.com/playlist?list=PL_fixture_123",episodes:sources.map((row)=>({...row,youtubeId:"",thumbnail:"",durationSeconds:null}))}];',
  'const courses=sources.map((row,index)=>({id:"course-"+index,slug:"course-"+index,title:row.title,description:"Recording",coverImage:"",kind:"COURSE",introVideoId:"",introVideoUrl:row.url,unitsCount:0,hasDetailPage:false,isExternal:false,externalUrl:"",videos:[]}));',
  'createRoot(document.getElementById("root")).render(<NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>{location.pathname==="/courses"?<CoursesPage courses={courses}/>:<ProgramsPage playlists={playlists}/>}</NextIntlClientProvider>);',
].join("\n");
const result = await build({stdin:{contents:entry,loader:"tsx",resolveDir:process.cwd()},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"'},plugins:[{
  name:"fixture-next-link",setup(builder){
    builder.onResolve({filter:new RegExp("^next/link$")},()=>({path:"next-link",namespace:"fixture"}));
    builder.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:'import React from "react";export default function Link(p){return React.createElement("a",p,p.children)}',loader:"js",resolveDir:process.cwd()}));
  },
}]});
const server=createServer((request,response)=>{
  if(request.url==="/bundle.js"){response.setHeader("Content-Type","text/javascript");response.end(result.outputFiles[0].text);}
  else{response.setHeader("Content-Type","text/html; charset=utf-8");response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:Arial;--deep:#10212b;--navy:#10212b;--muted:#52616b;--sand:#f7f2ea;--border:#dce3e8;--red:#a93428"><div id="root"></div><script src="/bundle.js"></script></body></html>');}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const output=path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS||".artifacts/content-editor");
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const errors=[];
let checks=0, page;
try{
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on("pageerror",error=>errors.push(error.message));
  // Inspect player DOM without depending on external video/network availability.
  await page.route("https://**/*",route=>route.abort());
  for(const surface of ["/programs","/courses"]){
    await page.goto(origin+surface);
    await page.getByRole("heading",{level:1}).waitFor();
    for(const source of sources){
      const link=surface==="/programs"?page.getByRole("link",{name:source.title,exact:true}):page.getByRole("link").filter({has:page.getByText(source.title,{exact:true})});
      await link.waitFor();
      assert.equal(await link.count(),1);
      if(surface==="/programs") assert.equal(await link.getAttribute("href"),source.url);
      await link.click();
      const dialog=page.getByRole("dialog");
      await dialog.waitFor();
      if(source.title.startsWith("MP4")){
        assert.equal(await dialog.locator("iframe").count(),0);
        assert.equal(await dialog.locator("video").getAttribute("src"),source.url);
      }else{
        const player=new URL(await dialog.locator("iframe").getAttribute("src"));
        assert.equal(player.searchParams.get("autoplay"),"1");
        if(source.title.startsWith("YouTube")){
          assert.equal(player.hostname,"www.youtube-nocookie.com");
          assert.equal(player.pathname,"/embed/"+videoId);
          assert.equal(player.searchParams.get("start"),"90");
        }else{
          assert.equal(player.hostname,"player.vimeo.com");
          assert.equal(player.pathname,"/video/123456789");
        }
      }
      assert.equal(await page.evaluate(()=>document.body.style.overflow),"hidden");
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({state:"hidden"});
      assert.equal(await page.getByRole("dialog").count(),0);
      assert.equal(await page.evaluate(()=>document.body.style.overflow),"");
      checks++;
    }
    if(surface==="/programs"){
      await page.getByRole("link",{name:"Watch full series",exact:true}).click();
      const player=new URL(await page.getByRole("dialog").locator("iframe").getAttribute("src"));
      assert.equal(player.pathname,"/embed/videoseries");
      assert.equal(player.searchParams.get("list"),"PL_fixture_123");
      assert.equal(player.searchParams.get("autoplay"),"1");
      await page.getByRole("button",{name:"Close",exact:true}).click();
      await page.getByRole("dialog").waitFor({state:"hidden"});
      checks++;
    }
    await page.screenshot({path:path.join(output,"public-media-"+surface.slice(1)+"-desktop.png"),fullPage:true,animations:"disabled"});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,"public-media-"+surface.slice(1)+"-mobile.png"),fullPage:true,animations:"disabled"});
    await page.setViewportSize({width:1440,height:1000});
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,"public-media-verification.json"),JSON.stringify({checks,errors,scope:"Real public ProgramsPage, CoursesPage and VideoModal; inspect YouTube/Vimeo/MP4/playlist player URLs and closing; external streams blocked."},null,2));
  console.log(JSON.stringify({checks,passed:true}));
}finally{
  if(page) await page.screenshot({path:path.join(output,"public-media-last-state.png"),fullPage:true,animations:"disabled"}).catch(()=>{});
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
