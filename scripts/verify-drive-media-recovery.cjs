#!/usr/bin/env node
'use strict';
/* Read-only audit after reviewed media recovery: no uploads or database writes. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
if(!fs.existsSync('lib/minbar/content/media.ts')||!fs.existsSync('package.json'))throw Error('RUN_FROM_PROJECT_ROOT');
const {PrismaClient}=createRequire(path.join(process.cwd(),'package.json'))('@prisma/client');
const root=process.env.MINBER_RECOVERY_DIR||'/root/minber-media-recovery/from-drive';
const old=s=>typeof s==='string'&&/^https:\/\/res\.cloudinary\.com\/z9drzccl\//i.test(s);
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const name=process.argv[2];
if(!/^campaign-image-backup-[a-f0-9]{12}-\d+\.json$/.test(name||''))throw Error('BACKUP_BASENAME_REQUIRED');
const fields={id:true,title:true,slug:true,isActive:true,isDeleted:true,images:true,ogImage:true,translations:{select:{id:true,locale:true,slug:true,image:true,ogImage:true}}};
const uniq=xs=>[...new Set(xs.filter(s=>typeof s==='string'&&s.trim()))];
const media=p=>uniq([...(p.images||[]),p.ogImage,...(p.translations||[]).flatMap(t=>[t.image,t.ogImage])]);
function matches(row,after){
 const translated=new Map(row.translations.map(t=>[t.id,t]));
 return same(row.images,after.images) &&
  (row.ogImage||null)===(after.ogImage||null) &&
  translated.size===after.translations.length &&
  after.translations.every(t=>translated.has(t.id)&&
   (translated.get(t.id).image||null)===(t.image||null)&&
   (translated.get(t.id).ogImage||null)===(t.ogImage||null));
}
async function check(url,cloudName){
 const p=new URL(url);
 if(p.protocol!=='https:'||p.hostname!=='res.cloudinary.com'||p.pathname.split('/')[1]!==cloudName)throw Error('BAD_CLOUDINARY_HOST');
 const r=await fetch(url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(30000)});
 const type=r.headers.get('content-type')||'';
 await r.body?.cancel();
 return {http:r.status,ok:r.ok&&type.startsWith('image/'),type};
}
async function main(){
 const backup=JSON.parse(fs.readFileSync(path.join(root,'pre-update-backups',name),'utf8'));
 const {backupHash,...unsigned}=backup;
 if(backupHash!==hash(unsigned)||backup.mode!=='PRE_UPDATE_SNAPSHOT'||backup.entries?.length!==4)throw Error('INVALID_BACKUP_HASH_OR_SCOPE');
 const cloudName=process.env.CLOUDINARY_CLOUD_NAME;
 if(!cloudName||cloudName==='z9drzccl')throw Error('NEW_CLOUDINARY_NOT_CONFIGURED');
 const db=new PrismaClient();let campaigns;
 try{campaigns=await db.campaign.findMany({where:{AND:[{isActive:true},{OR:[{isDeleted:false},{isDeleted:null},{isDeleted:{isSet:false}}]}]},select:fields});}
 finally{await db.$disconnect();}
 const restored=backup.entries.map(e=>{
  const current=campaigns.find(p=>p.id===e.before.id);
  return {group:e.key,title:e.before.title,found:!!current,media_matches_plan:!!current&&matches(current,e.after),
   remaining_legacy:current?media(current).filter(old).length:null};
 });
 const receipts=[];
 for(const e of backup.entries)for(const id of e.sourceIds){
  const r=JSON.parse(fs.readFileSync(path.join(root,'cloudinary-receipts',id+'.json'),'utf8'));
  if(r.drive_id!==id||r.group!==e.key||r.cloud_name!==cloudName||r.review_status!=='NOT_PUBLISHED')throw Error('RECEIPT_INVALID:'+id);
  receipts.push({group:e.key,driveId:id,url:r.secure_url});
 }
 const delivery=[];
 for(let i=0;i<receipts.length;i+=4){
  const result=await Promise.all(receipts.slice(i,i+4).map(async p=>{
   try{return {...p,...await check(p.url,cloudName)};}catch(e){return {...p,ok:false,error:String(e.message).slice(0,100)};}
  }));
  delivery.push(...result);
 }
 const remaining=campaigns.map(p=>{
  const original=media(p).filter(old);
  return {title:p.title,slug:p.slug,legacy:original.length,broken_gallery:p.images.filter(old).length,
   broken_localized_covers:p.translations.filter(t=>old(t.image)).length,
   broken_social:Number(old(p.ogImage))+p.translations.filter(t=>old(t.ogImage)).length};
 }).filter(x=>x.legacy).sort((a,b)=>b.legacy-a.legacy||a.title.localeCompare(b.title));
 const report={mode:'READ_ONLY_POST_RECOVERY_QA',planHash:backup.planHash,backupHash,
  active_campaigns:campaigns.length,restored,delivery,remaining,
  database_changed:false,uploads:false,
  note:'This audit does not verify Next.js HTML rendering or cached pages; visual browser QA still required.'};
 const target=path.join(root,'post-recovery-qa.json');
 fs.writeFileSync(target,JSON.stringify(report,null,2),{mode:0o600});
 const passed=delivery.filter(x=>x.ok).length;
 console.log('POST_QA:',JSON.stringify({active:campaigns.length,restored_verified:restored.filter(x=>x.media_matches_plan&&x.remaining_legacy===0).length,cloudinary_http_ok:passed,cloudinary_total:delivery.length,affected_remaining:remaining.length,legacy_images_remaining:remaining.reduce((n,x)=>n+x.legacy,0)}));
 restored.forEach(x=>console.log('RESTORED_PROJECT:',x.group,'MATCH:',x.media_matches_plan,'OLD_URLS:',x.remaining_legacy));
 remaining.forEach(x=>console.log('REMAINING:',x.title,'BROKEN:',x.legacy,'LOCALE_COVERS:',x.broken_localized_covers));
 console.log('REPORT:',target);console.log('DATABASE_CHANGED: NO');
 if(restored.some(x=>!x.media_matches_plan)||passed!==delivery.length)process.exitCode=2;
}
main().catch(e=>{console.error('POST_QA_FAILED:',String(e.message).slice(0,180));process.exitCode=1;});
