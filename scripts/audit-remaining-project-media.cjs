#!/usr/bin/env node
'use strict';
/**
 * READ-ONLY remaining Campaign image inventory.
 * Reads only media fields and checks existing non-legacy URLs.
 * No image replacement, no Cloudinary upload, no DB writes, no payment data.
 */
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
if(!fs.existsSync('package.json')||!fs.existsSync('lib/minbar/content/media.ts'))throw Error('RUN_FROM_MINBER_PROJECT_ROOT');
const {PrismaClient}=createRequire(path.join(process.cwd(),'package.json'))('@prisma/client');
const root=process.env.MINBER_RECOVERY_DIR||'/root/minber-media-recovery/from-drive';
const legacy=s=>typeof s==='string'&&/^https:\/\/res\.cloudinary\.com\/z9drzccl\//i.test(s.trim());
const uniq=a=>[...new Set(a.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))];
const items=p=>[
 ...(p.images||[]).map((url,index)=>({field:'gallery',index,url})),
 ...(p.ogImage?[{field:'og',url:p.ogImage}]:[]),
 ...(p.translations||[]).flatMap(t=>[
  ...(t.image?[{field:'locale_cover',locale:t.locale,url:t.image}]:[]),
  ...(t.ogImage?[{field:'locale_og',locale:t.locale,url:t.ogImage}]:[])
 ])
];
const acceptableHost=new Set(['res.cloudinary.com','drive.google.com','lh3.googleusercontent.com','minberiaksa.org','www.minberiaksa.org','img.youtube.com','i.ytimg.com']);
function publicTarget(url){
 if(url.startsWith('/')&&!url.startsWith('//'))return 'https://minberiaksa.org'+url;
 const u=new URL(url);
 if(u.protocol!=='https:'||!acceptableHost.has(u.hostname))throw Error('UNAPPROVED_MEDIA_HOST');
 return url;
}
async function inspect(url){
 try{
  const u=publicTarget(url);
  const r=await fetch(u,{headers:{Range:'bytes=0-2047','User-Agent':'MinberRecoveryReadOnly/1.0'},signal:AbortSignal.timeout(22000)});
  const type=r.headers.get('content-type')||'';
  const code=r.status;await r.body?.cancel();
  return {ok:r.ok&&type.startsWith('image/'),http:code,content_type:type.slice(0,100)};
 }catch(e){return {ok:false,error:String(e.message).slice(0,75)};}
}
const asCSV=v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+\-@]/,'\u0027$&')+'"';
async function main(){
 const prisma=new PrismaClient();
 let campaigns;
 try{
  campaigns=await prisma.campaign.findMany({
   where:{AND:[{isActive:true},{OR:[{isDeleted:false},{isDeleted:null},{isDeleted:{isSet:false}}]}]},
   select:{id:true,title:true,slug:true,images:true,ogImage:true,
    translations:{select:{locale:true,slug:true,image:true,ogImage:true}}}
  });
 }finally{await prisma.$disconnect();}
 const all=campaigns.map(p=>{
  const fields=items(p), old=fields.filter(x=>legacy(x.url));
  const available=uniq(fields.filter(x=>!legacy(x.url)).map(x=>x.url));
  return {id:p.id,title:p.title,slug:p.slug,
   localized_slugs:(p.translations||[]).map(t=>({locale:t.locale,slug:t.slug})),
   broken_legacy_references:old.length,
   broken_unique_urls:uniq(old.map(x=>x.url)).length,
   broken_gallery:old.filter(x=>x.field==='gallery').length,
   broken_cover:old.filter(x=>x.field==='locale_cover').length,
   broken_og:old.filter(x=>x.field==='og'||x.field==='locale_og').length,
   current_nonlegacy_urls:available,verified_current:[],
   status:'NOT_EVALUATED'};
 }).filter(p=>p.broken_legacy_references);
 const candidates=uniq(all.flatMap(p=>p.current_nonlegacy_urls));
 const probes={};
 for(let i=0;i<candidates.length;i+=4){
  const values=await Promise.all(candidates.slice(i,i+4).map(async url=>({url,check:await inspect(url)})));
  values.forEach(({url,check})=>{probes[url]=check;});
 }
 for(const p of all){
  p.verified_current=p.current_nonlegacy_urls.filter(url=>probes[url]?.ok);
  p.status=p.verified_current.length>0?'PRESERVE_VALID_PROJECT_MEDIA_AND_REVIEW_REMOVAL':'NEEDS_AUTHENTIC_PROJECT_IMAGES';
 }
 all.sort((a,b)=>b.broken_legacy_references-a.broken_legacy_references||a.title.localeCompare(b.title));
 const summary={
  active_campaigns:campaigns.length,
  affected_campaigns:all.length,
  broken_legacy_references:all.reduce((n,x)=>n+x.broken_legacy_references,0),
  broken_legacy_unique_within_projects:all.reduce((n,x)=>n+x.broken_unique_urls,0),
  with_verified_existing_media:all.filter(x=>x.verified_current.length).length,
  without_verified_existing_media:all.filter(x=>!x.verified_current.length).length,
  checked_nonlegacy_urls:candidates.length,verified_nonlegacy_urls:Object.values(probes).filter(x=>x.ok).length
 };
 const folder=path.join(root,'remaining-projects');
 fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const reportPath=path.join(folder,'remaining-media-inventory.json');
 const csvPath=path.join(folder,'remaining-media-inventory.csv');
 fs.writeFileSync(reportPath,JSON.stringify({mode:'READ_ONLY',summary,projects:all,probes,notes:[
  'Images from another project must not be reused without specific editorial evidence.',
  'Existing verified image links should be preserved. Do not blindly delete all old gallery records.',
  'No gallery modifications, uploads, or database writes occurred in this audit.'
 ]},null,2),{mode:0o600});
 const rows=[['المشروع','المسار','الروابط المعطلة','روابط المعرض المعطلة','الأغلفة المعطلة','صور موجودة صالحة','الحالة']];
 all.forEach(p=>rows.push([p.title,p.slug,p.broken_legacy_references,p.broken_gallery,p.broken_cover,p.verified_current.length,p.status]));
 fs.writeFileSync(csvPath,rows.map(r=>r.map(asCSV).join(',')).join('\n'),{mode:0o600});
 console.log('REMAINING_MEDIA_AUDIT:',JSON.stringify(summary));
 for(const p of all)console.log('PROJECT:',p.title,'BROKEN:',p.broken_legacy_references,'VERIFIED_EXISTING:',p.verified_current.length,'STATUS:',p.status);
 console.log('JSON_REPORT:',reportPath);console.log('CSV_REPORT:',csvPath);
 console.log('DATABASE_CHANGED: NO');console.log('CLOUDINARY_UPLOADS: NONE');
}
main().catch(e=>{console.error('AUDIT_FAILED:',String(e.message).slice(0,160));process.exitCode=1;});
