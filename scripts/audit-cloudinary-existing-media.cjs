#!/usr/bin/env node
'use strict';
/**
 * Discover already-uploaded campaign images in the current Cloudinary account.
 * READ-ONLY. Lists metadata from Cloudinary Admin API, no download, delete, upload or DB writes.
 * Any name-based candidate requires human photographic/content verification.
 */
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
if(!fs.existsSync('package.json')||!fs.existsSync('lib/minbar/content/media.ts'))throw Error('RUN_FROM_PROJECT_ROOT');
const projectRequire=createRequire(path.join(process.cwd(),'package.json'));
const cloud=projectRequire('cloudinary').v2;
const name=process.env.CLOUDINARY_CLOUD_NAME;
if(!name||name==='z9drzccl'||!process.env.CLOUDINARY_API_KEY||!process.env.CLOUDINARY_API_SECRET)throw Error('CURRENT_CLOUDINARY_CREDENTIALS_NOT_AVAILABLE');
cloud.config({cloud_name:name,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true});
const root=process.env.MINBER_RECOVERY_DIR||'/root/minber-media-recovery/from-drive';
const inventoryPath=path.join(root,'remaining-projects','remaining-media-inventory.json');
const inventory=JSON.parse(fs.readFileSync(inventoryPath,'utf8'));
if(!Array.isArray(inventory.projects)||inventory.projects.length<1)throw Error('MISSING_PROJECT_MEDIA_AUDIT');
const pages=Math.min(20,Math.max(1,Number.parseInt(process.env.CLOUDINARY_AUDIT_MAX_PAGES||'8',10)||8));
const norm=s=>String(s||'').toLowerCase().normalize('NFKC')
 .replace(/[أإآ]/g,'ا').replace(/[ى]/g,'ي').replace(/[ؤ]/g,'و').replace(/[ئ]/g,'ي')
 .replace(/[\u064b-\u065f\u0670]/g,'')
 .replace(/[^a-z0-9\u0600-\u06ff]+/g,' ').trim();
const stop=new Set(['مشروع','دعم','توفير','في','من','الى','على','ال','ل','أهل','اهالي','لأهل','القدس','غزة','المسجد','الاقصى','المبارك','للاسر','الاسر','تحت','منبر','منبرالاقصى','images','image','uploads','upload','minberiaksa','minber','assets','media']);
function tokens(text){
 return norm(text).split(' ').filter(x=>x.length>2&&!stop.has(x));
}
function grade(p,a){
 const hay=norm([a.public_id,a.original_filename,a.folder,...(a.tags||[]),Object.values(a.context?.custom||{}).join(' ')].join(' '));
 const slug=norm(p.slug);
 const locales=(p.localized_slugs||[]).map(x=>norm(x.slug)).filter(Boolean);
 if((slug&&hay.includes(slug))||locales.some(s=>hay.includes(s)))return {score:100,reason:'EXACT_SLUG_IN_ASSET_NAME'};
 const tok=[...new Set(tokens([p.title,p.slug].join(' ')))];
 const hits=tok.filter(t=>hay.includes(t));
 if(hits.length>=2)return {score:hits.length,reason:'MULTIPLE_NAME_KEYWORDS:'+hits.slice(0,5).join(',')};
 return null;
}
async function main(){
 const assets=[];
 let cursor,scannedPages=0;
 for(let i=0;i<pages;i++){
  const options={resource_type:'image',type:'upload',max_results:500,context:true,tags:true};
  if(cursor)options.next_cursor=cursor;
  const result=await cloud.api.resources(options);
  if(!Array.isArray(result.resources))throw Error('CLOUDINARY_RESOURCE_LIST_MALFORMED');
  for(const a of result.resources){
   if(a.public_id?.startsWith('minberiaksa/drive-recovery-20261107/'))continue;
   assets.push({
    public_id:a.public_id,secure_url:a.secure_url,format:a.format,
    created_at:a.created_at,width:a.width,height:a.height,bytes:a.bytes,
    original_filename:a.original_filename||null,folder:a.folder||null,
    tags:a.tags||[],context:a.context||null
   });
  }
  scannedPages++;
  cursor=result.next_cursor||null;
  if(!cursor)break;
 }
 const projects=inventory.projects.map(p=>{
  const candidates=assets.map(a=>{
   const match=grade(p,a);
   return match?{...match,public_id:a.public_id,url:a.secure_url,created_at:a.created_at}:null;
  }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,12);
  return {title:p.title,slug:p.slug,broken:p.broken_legacy_references,
    matches_by_filename:candidates,
    status:candidates.length?'PHOTO_REVIEW_REQUIRED':'NO_FILENAME_MATCH'};
 });
 const report={
  mode:'READ_ONLY_MEDIA_DISCOVERY',cloud_name:name,
  scanned_pages:scannedPages,scan_complete:!cursor,non_recovery_images_seen:assets.length,
  projects_with_name_candidates:projects.filter(x=>x.matches_by_filename.length).length,
  projects_without_name_candidates:projects.filter(x=>!x.matches_by_filename.length).length,
  warning:'Filename matches do NOT establish that photos are from the project. Do not automatically apply or reuse.',
  projects,assets
 };
 const directory=path.join(root,'remaining-projects');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const out=path.join(directory,'cloudinary-existing-media-audit.json');
 fs.writeFileSync(out,JSON.stringify(report,null,2),{mode:0o600});
 console.log('CLOUDINARY_EXISTING_AUDIT:',JSON.stringify({
  scanned_pages:scannedPages,scan_complete:!cursor,
  non_recovery_images_seen:assets.length,projects_considered:projects.length,
  projects_with_name_candidates:report.projects_with_name_candidates,
  projects_without_name_candidates:report.projects_without_name_candidates}));
 for(const p of projects)if(p.matches_by_filename.length)
  console.log('POSSIBLE_MATCH:',p.title,'CANDIDATES:',p.matches_by_filename.length,
   'TOP_ASSET:',p.matches_by_filename[0].public_id.slice(0,120),
   'REASON:',p.matches_by_filename[0].reason);
 console.log('REPORT:',out);
 console.log('DATABASE_CHANGED: NO');console.log('CLOUDINARY_UPLOADS: NONE');
}
main().catch(e=>{console.error('CLOUDINARY_DISCOVERY_FAILED:',String(e.message).slice(0,200));process.exitCode=1;});
