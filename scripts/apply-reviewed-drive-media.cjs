#!/usr/bin/env node
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- Standalone Node.js CommonJS recovery CLI intentionally uses require. */
/**
 * Project-specific recovery of previously broken Cloudinary image references.
 * Stage 2: carefully guarded media-only edits. Independent of deployment.
 * Modes: plan, apply <64-hex-plan-hash>, rollback <backup-basename> <64-hex-backup-hash>.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const projectRoot = process.cwd();
if (!fs.existsSync(path.join(projectRoot, 'lib/minbar/content/media.ts')) || !fs.existsSync(path.join(projectRoot, 'package.json'))) {
  throw new Error('RUN_FROM_PROJECT_ROOT');
}
const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
const { PrismaClient } = projectRequire('@prisma/client');
const root = process.env.MINBER_RECOVERY_DIR || '/root/minber-media-recovery/from-drive';
const receiptsPath = path.join(root, 'cloudinary-receipts');
const planPath = path.join(root, 'four-project-recovery-plan.json');
const backupDir = path.join(root, 'pre-update-backups');
const TARGETS = Object.freeze([
  { key: 'GAZA_BREAD', aliases: ['gaza-bread'] },
  { key: 'GAZA_MEALS', aliases: ['gaza-hot-meals'] },
  { key: 'GAZA_PARCELS', aliases: ['gaza-food-parcels'] },
  { key: 'TRAVEL', aliases: ['مشروع-نقل-المصلين-الى-المسجد-الاقصى', 'al-quds-friday-transport'] },
]);
const old = url => typeof url === 'string' && /^https:\/\/res\.cloudinary\.com\/z9drzccl\//i.test(url);
const sha = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const validHash = s => /^[a-f0-9]{64}$/.test(s || '');
function writePrivate(file, obj, exclusive = false) {
  fs.mkdirSync(path.dirname(file), {recursive:true,mode:0o700});
  const fd=fs.openSync(file, exclusive ? 'wx' : 'w', 0o600);
  try {fs.writeFileSync(fd, JSON.stringify(obj,null,2));fs.fsyncSync(fd);}finally {fs.closeSync(fd);}
}
function sourceIds() {
  const text=fs.readFileSync('lib/minbar/content/media.ts','utf8');
  const groups={};
  for (const {key} of TARGETS) {
    const match=text.match(new RegExp('export const '+key+'\\s*=\\s*\\[([\\s\\S]*?)\\];'));
    if (!match)throw Error('HISTORICAL_LIBRARY_NOT_FOUND:'+key);
    const ids=[...match[1].matchAll(/"([A-Za-z0-9_-]{20,})"/g)].map(m=>m[1]);
    if (ids.length!==4)throw Error('EXPECTED_FOUR_IMAGES_PER_GROUP:'+key);
    groups[key]=ids;
  }
  return groups;
}
async function verifyImage(url, cloudName) {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:' || parsed.hostname!=='res.cloudinary.com' || parsed.pathname.split('/')[1]!==cloudName)throw Error('UNTRUSTED_CLOUDINARY_URL');
  const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{Range:'bytes=0-1023'}});
  const type=response.headers.get('content-type')||'';
  await response.body?.cancel();
  if(!response.ok||!type.startsWith('image/'))throw Error('BAD_DELIVERY:'+response.status);
}
async function receiptUrls() {
  const source=sourceIds();
  const name=process.env.CLOUDINARY_CLOUD_NAME;
  if(!name || name==='z9drzccl')throw Error('NEW_CLOUDINARY_NAME_MISSING');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  if(!Array.isArray(manifest.items)||manifest.items.length!==33)throw Error('RECOVERY_MANIFEST_MISSING');
  const all=[];
  for(const [group,ids] of Object.entries(source)) {
    const urls=[];
    for(const id of ids){
      const file=path.join(receiptsPath,id+'.json');
      const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
      const asset=manifest.items.find(x=>x.drive_id===id);
      if(!asset||asset.group!==group||asset.status!=='OK'||asset.sha256!==receipt.sha256||receipt.cloud_name!==name||receipt.drive_id!==id||receipt.review_status!=='NOT_PUBLISHED')throw Error('UNVERIFIED_RECEIPT:'+id);
      if(!/^https:\/\/res\.cloudinary\.com\//.test(receipt.secure_url||''))throw Error('INVALID_URL:'+id);
      await verifyImage(receipt.secure_url,name);
      urls.push(receipt.secure_url);
    }
    all.push({group,ids,urls});
  }
  return all;
}
function snapshot(p){
  return {
    id:p.id,slug:p.slug,title:p.title,isActive:p.isActive,isDeleted:p.isDeleted??null,
    updatedAt:p.updatedAt?.toISOString?.() || p.updatedAt || null,
    images:[...p.images],ogImage:p.ogImage??null,
    translations:[...(p.translations||[])].map(t=>({id:t.id,locale:t.locale,slug:t.slug??null,image:t.image??null,ogImage:t.ogImage??null})).sort((a,b)=>a.locale.localeCompare(b.locale))
  };
}
function proposed(before,urls){
  const newImages=[...new Set([...urls, ...before.images.filter(x=>typeof x==='string' && !old(x) && x.trim())])];
  return {
    ...before,
    images:newImages,
    ogImage:old(before.ogImage)?urls[0]:before.ogImage,
    translations:before.translations.map(t=>({...t,image:old(t.image)?urls[0]:t.image,ogImage:old(t.ogImage)?urls[0]:t.ogImage}))
  };
}
const projection={id:true,slug:true,title:true,isActive:true,isDeleted:true,updatedAt:true,images:true,ogImage:true,
  translations:{select:{id:true,locale:true,slug:true,image:true,ogImage:true}}};
async function getRows(prisma) {
  return prisma.campaign.findMany({where:{AND:[{isActive:true},{OR:[{isDeleted:false},{isDeleted:null},{isDeleted:{isSet:false}}]}]},select:projection});
}
async function generatePlan(prisma) {
  const [receipts,rows]=await Promise.all([receiptUrls(),getRows(prisma)]);
  const entries=[],used=new Set();
  for (const target of TARGETS){
    const matches=rows.filter(p=>{
      const slugs=new Set([p.slug,...p.translations.map(t=>t.slug)].filter(Boolean));
      return target.aliases.some(alias=>slugs.has(alias));
    });
    if(matches.length!==1)throw Error('EXPECTED_ONE_PROJECT:'+target.key+':'+matches.length);
    const campaign=matches[0];
    if(used.has(campaign.id))throw Error('DUPLICATE_PROJECT_ID');
    used.add(campaign.id);
    const before=snapshot(campaign);
    if(!before.images.some(old))throw Error('NO_LEGACY_IMAGES_FOR:'+target.key);
    const source=receipts.find(r=>r.group===target.key);
    const after=proposed(before,source.urls);
    entries.push({key:target.key,sourceIds:source.ids,before,after});
  }
  if(entries.length!==4)throw Error('INCOMPLETE_PLAN');
  const content={version:1,mode:'REVIEW_ONLY',cloudName:process.env.CLOUDINARY_CLOUD_NAME,entries};
  return {...content,planHash:sha(content)};
}
async function changeInTransaction(tx,entries,which){
  for(const e of entries){
    const current=await tx.campaign.findUnique({where:{id:e.before.id},select:projection});
    if(!current)throw Error('PROJECT_MISSING:'+e.key);
    const expected=which==='apply'?e.before:e.after;
    const destination=which==='apply'?e.after:e.before;
    const currentState=snapshot(current);
    const ignoreTime=state=>({...state,updatedAt:null});
    if(!equal(ignoreTime(currentState),ignoreTime(expected)))throw Error('CONCURRENT_EDIT:'+e.key);
    if(which==='apply' && currentState.updatedAt!==expected.updatedAt)throw Error('CONCURRENT_TIMESTAMP:'+e.key);
    if(!current.isActive||current.isDeleted===true)throw Error('PROJECT_NOT_ACTIVE:'+e.key);
    await tx.campaign.update({where:{id:current.id},data:{images:destination.images,...(expected.ogImage!==destination.ogImage?{ogImage:destination.ogImage}:{})}});
    const nextTranslations=destination.translations;
    for(const existing of currentState.translations){
      const target=nextTranslations.find(x=>x.id===existing.id);
      if(!target)throw Error('TRANSLATION_REMOVED');
      const data={...(existing.image!==target.image?{image:target.image}:{}),...(existing.ogImage!==target.ogImage?{ogImage:target.ogImage}:{})};
      if(Object.keys(data).length)await tx.campaignTranslation.update({where:{id:existing.id},data});
    }
  }
}
async function plan(prisma){
  const candidate=await generatePlan(prisma);
  writePrivate(planPath,candidate);
  console.log('PLAN_HASH:',candidate.planHash);
  console.log('PLAN_FILE:',planPath);
  for(const e of candidate.entries)console.log('CANDIDATE:',e.key,'PROJECT:',e.before.title,'LEGACY:',e.before.images.filter(old).length,'NEW:',e.after.images.length,'LOCALE_COVERS_FIXED:',e.before.translations.filter(t=>old(t.image)).length,'OG_IMAGES_FIXED:',Number(old(e.before.ogImage))+e.before.translations.filter(t=>old(t.ogImage)).length);
  console.log('DATABASE_CHANGED: NO');
}
async function apply(prisma,confirmation){
  if(!validHash(confirmation))throw Error('APPLY_REQUIRES_EXACT_PLAN_HASH');
  const saved=JSON.parse(fs.readFileSync(planPath,'utf8'));
  const {planHash,...base}=saved;
  if(planHash!==sha(base)||confirmation!==planHash||saved.mode!=='REVIEW_ONLY'||saved.entries?.length!==4)throw Error('PLAN_CONFIRMATION_FAILED');
  const fresh=await generatePlan(prisma);
  if(fresh.planHash!==saved.planHash)throw Error('PLAN_STALE_REVIEW_AGAIN');
  const backup={version:1,mode:'PRE_UPDATE_SNAPSHOT',planHash,entries:saved.entries,createdAt:new Date().toISOString()};
  const backupHash=sha(backup);
  const backupFile=path.join(backupDir,'campaign-image-backup-'+planHash.slice(0,12)+'-'+Date.now()+'.json');
  writePrivate(backupFile,{...backup,backupHash},true);
  console.log('BACKUP_CREATED:',backupFile);
  console.log('BACKUP_HASH:',backupHash);
  await prisma.$transaction(async tx=>{await changeInTransaction(tx,saved.entries,'apply');},{maxWait:20000,timeout:45000});
  console.log('TRANSACTION_COMMITTED: 4');
  console.log('CHANGED_FIELDS: Campaign.images, Campaign.ogImage, CampaignTranslation.image, CampaignTranslation.ogImage');
  console.log('MONEY_OR_DONATION_DATA_CHANGED: NO');
  console.log('ROLLBACK_REFERENCE:',path.basename(backupFile));
}
async function rollback(prisma,filename,confirmation){
  if(!/^campaign-image-backup-[a-f0-9]{12}-[0-9]+\.json$/.test(filename)||!validHash(confirmation))throw Error('ROLLBACK_REQUIRES_BACKUP_BASENAME_AND_HASH');
  const backup=JSON.parse(fs.readFileSync(path.join(backupDir,filename),'utf8'));
  const {backupHash,...base}=backup;
  if(backupHash!==sha(base)||backupHash!==confirmation||backup.mode!=='PRE_UPDATE_SNAPSHOT'||backup.entries.length!==4)throw Error('BACKUP_INTEGRITY_FAILED');
  await prisma.$transaction(async tx=>{await changeInTransaction(tx,backup.entries,'rollback');},{maxWait:20000,timeout:45000});
  console.log('ROLLBACK_COMMITTED: 4');
}
async function main(){
  const prisma=new PrismaClient();
  try{
    const mode=process.argv[2];
    if(mode==='plan')return await plan(prisma);
    if(mode==='apply')return await apply(prisma,process.argv[3]);
    if(mode==='rollback')return await rollback(prisma,process.argv[3],process.argv[4]);
    throw Error('USAGE: plan | apply PLAN_HASH | rollback BACKUP_FILENAME BACKUP_HASH');
  } finally {await prisma.$disconnect();}
}
main().catch(e=>{console.error('RECOVERY_FAILED:',String(e.message).slice(0,180));process.exitCode=1;});
