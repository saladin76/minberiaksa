#!/usr/bin/env node
'use strict';
/**
 * Read-only forensic image cache recovery scan.
 *
 * Next.js image optimizer cache keys are SHA-256 base64url of concatenated
 * [CACHE_VERSION, href, width, quality, mimeType] (Next 16.1.6 source).
 * Old image URLs can therefore be mapped to hashed local cache folders
 * without original filenames or reading unrelated database collections.
 *
 * Never writes to source/cache/DB; reports private local paths only.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const app=process.cwd();
if(!fs.existsSync(path.join(app,'package.json'))||!fs.existsSync(path.join(app,'lib/minbar/content/media.ts')))throw Error('RUN_FROM_PROJECT_ROOT');
const {PrismaClient}=createRequire(path.join(app,'package.json'))('@prisma/client');
const root=process.env.MINBER_RECOVERY_DIR||'/root/minber-media-recovery/from-drive';
const output=path.join(root,'server-source-discovery','next-optimizer-and-backups-audit.json');
const old=url=>typeof url==='string'&&/^https:\/\/res\.cloudinary\.com\/z9drzccl\//i.test(url.trim());
const hash=(a)=>{const h=crypto.createHash('sha256');for(const x of a)h.update(String(x));return h.digest('base64url');};
const widths=[16,32,48,64,96,128,256,384,640,750,828,1080,1200,1920,2048,2560,3840];
const qualities=[75,70,80,85,90,95,100];
const mimes=['','image/webp','image/avif','image/jpeg','image/png'];
const versions=[4,3,2,1];
const isImage=b=>(b[0]===255&&b[1]===216&&b[2]===255)||
  b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
  (b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')||
  b.toString('ascii',0,3)==='GIF'||
  (b.toString('ascii',4,8)==='ftyp'&&/avif|avis|heic|heix/.test(b.toString('ascii',8,16)));
function statSafe(p){try{return fs.lstatSync(p)}catch{return null}}
function oldVariants(src){
 const result=new Set([src]);
 // CDN transformations created by lib/minbar/image-url.ts; only include
 // variants for the observed old account and the known site transformation.
 const m=src.match(/^(https:\/\/res\.cloudinary\.com\/z9drzccl\/image\/upload\/)(.*)$/i);
 if(m){
  for(const w of [256,384,640,750,828,1080,1200,1920,2048]) {
   result.add(m[1]+'f_auto,q_auto,c_limit,w_'+w+'/'+m[2]);
  }
 }
 return [...result];
}
function cacheSources(){
 const roots=[
  {name:'current',folder:path.join(app,'.next/cache/images')},
  {name:'previous',folder:path.join(app,'.next-previous/cache/images')},
  {name:'deploy-backup-current',folder:'/root/deploy-backups'},
  {name:'category-backups',folder:'/root/minberi-category-backups'},
 ];
 const caches=new Map(),rootStatus=[];
 for(const row of roots.slice(0,2)){
  const st=statSafe(row.folder);
  if(!st?.isDirectory()||st.isSymbolicLink()){rootStatus.push({...row,status:'ABSENT'});continue;}
  let count=0,invalid=0,files=0;
  for(const entry of fs.readdirSync(row.folder,{withFileTypes:true})){
   if(!entry.isDirectory()||!/^[a-zA-Z0-9_-]{40,60}$/.test(entry.name)){invalid++;continue;}
   count++;
   const dir=path.join(row.folder,entry.name);
   let found=[];
   try{
    for(const f of fs.readdirSync(dir,{withFileTypes:true})){
     if(!f.isFile())continue;
     const full=path.join(dir,f.name);
     const s=statSafe(full);if(!s?.isFile()||s.isSymbolicLink()||s.size<1000||s.size>30*1024*1024)continue;
     const fd=fs.openSync(full,'r');let sample=Buffer.alloc(24);
     try{fs.readSync(fd,sample,0,24,0);}finally{fs.closeSync(fd)}
     if(isImage(sample))found.push({path:full,bytes:s.size,cache_file:f.name});
    }
   }catch(e){continue;}
   if(found.length){files+=found.length;const key=entry.name;const a=caches.get(key)||[];a.push(...found.map(f=>({...f,source:row.name})));caches.set(key,a);}
  }
  rootStatus.push({name:row.name,folder:row.folder,status:'SCANNED',directories:count,imageFiles:files,ignoredNonCacheEntries:invalid});
 }
 return {caches,rootStatus,backupRoots:roots.slice(2)};
}
function archivesAndImages(roots){
 const found=[],sum=[];
 const skip=/^(?:\.git|node_modules|\.next|private|secrets|donors|invoices|payments|bank-transfers|receipts|certificates|kyc|passport|tmp|temp)$/i;
 let seen=0;
 for(const {name,folder} of roots){
  const st=statSafe(folder);
  if(!st?.isDirectory()||st.isSymbolicLink()){sum.push({name,status:'ABSENT'});continue;}
  const stack=[{dir:folder,depth:0}];let files=0,photo=0,archive=0,limit=false;
  while(stack.length&&seen<30000){
   const {dir,depth}=stack.pop();
   let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{continue}
   for(const e of entries){
    seen++;
    if(seen>=30000){limit=true;break;}
    if(e.isSymbolicLink())continue;
    const full=path.join(dir,e.name);
    if(e.isDirectory()){
     if(depth<7&&!skip.test(e.name))stack.push({dir:full,depth:depth+1});
     continue;
    }
    if(!e.isFile())continue;
    if(!/\.(?:jpe?g|png|webp|avif|gif|zip|tar|tar\.gz|tgz|tar\.zst|7z|rar)$/i.test(e.name))continue;
    const s=statSafe(full);if(!s?.isFile()||s.isSymbolicLink())continue;
    files++;
    const type=/\.(?:zip|tar|tgz|tar\.gz|tar\.zst|7z|rar)$/i.test(e.name)?'archive':'image';
    if(type==='archive')archive++;else photo++;
    found.push({source:name,type,path:full,bytes:s.size});
   }
   if(limit)break;
  }
  sum.push({name,status:'SCANNED',files,photos:photo,archives:archive,truncated:limit});
 }
 return {found,sum};
}
async function main(){
 const prisma=new PrismaClient();let rows;
 try{
  rows=await prisma.campaign.findMany({
   where:{AND:[{isActive:true},{OR:[{isDeleted:false},{isDeleted:null},{isDeleted:{isSet:false}}]}]},
   select:{title:true,slug:true,images:true,ogImage:true,translations:{select:{image:true,ogImage:true}}}
  });
 }finally{await prisma.$disconnect();}
 const urls=new Map();
 for(const p of rows){
  for(const url of [...p.images,p.ogImage,...p.translations.flatMap(t=>[t.image,t.ogImage])]){
   if(!old(url))continue;
   const key=url.trim();let set=urls.get(key)||new Set();set.add(p.title);urls.set(key,set);
  }
 }
 const {caches,rootStatus,backupRoots}=cacheSources();
 const matches=[];const matched=new Set();let tested=0;
 for(const [url,projects] of urls){
  for(const variant of oldVariants(url)){
   for(const v of versions)for(const w of widths)for(const q of qualities)for(const mime of mimes){
    tested++;
    const key=hash([v,variant,w,q,mime]);
    const hits=caches.get(key);if(!hits)continue;
    for(const f of hits){
     const signature=f.path+'|'+url;
     if(matched.has(signature))continue;matched.add(signature);
     matches.push({original_url:url,projects:[...projects],source_variant:variant,version:v,width:w,quality:q,mimeType:mime,cacheKey:key,...f,confidence:'EXACT_NEXT_CACHE_KEY'});
    }
   }
  }
 }
 const others=archivesAndImages(backupRoots);
 const report={
  mode:'READ_ONLY_CACHE_HASH_AND_BACKUP_DISCOVERY',
  legacy_unique_urls:urls.size,cache_directories:[...caches.keys()].length,
  combinations_checked:tested,
  exact_next_cache_hits:matches.length,
  projects_with_exact_hits:[...new Set(matches.flatMap(x=>x.projects))].length,
  backups_examined:others.sum,backup_candidates:others.found.length,
  root_status:rootStatus,matches,backup_candidates:others.found,
  note:'Exact hash match links a cached derivative to the requested legacy URL; verify image bytes and visual semantics before recovery. Backups are not extracted or modified.',
  database_changed:false,cloudinary_uploads:0};
 fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
 fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
 console.log('CACHE_AND_BACKUPS:',JSON.stringify({
  legacy_urls:urls.size,cached_image_directories:report.cache_directories,
  combinations_checked:tested,
  exact_cache_hits:matches.length,
  projects_with_cache_hits:report.projects_with_exact_hits,
  backup_candidates:others.found.length
 }));
 rootStatus.forEach(x=>console.log('CACHE_SOURCE:',x.name,x.status,'IMAGE_FILES:',x.imageFiles||0));
 others.sum.forEach(x=>console.log('BACKUP_SOURCE:',x.name,x.status,'IMAGES:',x.photos||0,'ARCHIVES:',x.archives||0));
 matches.slice(0,35).forEach(m=>console.log('EXACT_CACHE_MATCH:',m.projects.join(' | '),'FILE:',m.path,'WIDTH:',m.width));
 others.found.slice(0,25).forEach(x=>console.log('BACKUP_CANDIDATE:',x.type,x.path));
 console.log('REPORT:',output);
 console.log('DATABASE_CHANGED: NO');console.log('CLOUDINARY_UPLOADS: NONE');
}
main().catch(e=>{console.error('CACHE_DISCOVERY_FAILED:',String(e.message).slice(0,190));process.exitCode=1;});
