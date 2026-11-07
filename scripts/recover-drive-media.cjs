#!/usr/bin/env node
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- Standalone Node.js CommonJS recovery CLI intentionally uses require. */
/**
 * Recovered Google Drive media staging.
 * Read-only audit and optional Cloudinary upload ONLY.
 * Never modifies campaigns, translations, donations, or deployed runtime.
 *
 * Usage (in repository root):
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.production --env-file-if-exists=.env.production.local scripts/recover-drive-media.cjs audit
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.production --env-file-if-exists=.env.production.local scripts/recover-drive-media.cjs upload --groups=GAZA_BREAD,GAZA_PARCELS,GAZA_MEALS,TRAVEL
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
// The script is extracted to /root/minber-media-recovery, outside the app.
// Resolve installed dependencies from the repository, never from the script location.
const projectRoot = process.cwd();
if (!fs.existsSync(path.join(projectRoot, 'lib/minbar/content/media.ts')) ||
    !fs.existsSync(path.join(projectRoot, 'package.json'))) {
  throw Error('RUN_FROM_PROJECT_ROOT: cd /root/minberiaksa');
}
const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
const root = process.env.MINBER_RECOVERY_DIR || '/root/minber-media-recovery/from-drive';
const allowedGroups = new Set(['GAZA_MEALS','GAZA_PARCELS','GAZA_BREAD','TRAVEL']);
const groupNames = ['GAZA_MEALS','GAZA_WATER','GAZA_PARCELS','GAZA_BREAD','QUDS_IFTAR','QUDS_CITY','TRAVEL'];
const oldUrl = s => typeof s === 'string' && /^https:\/\/res\.cloudinary\.com\/z9drzccl\//i.test(s);
const digest = x => crypto.createHash('sha256').update(x).digest('hex');

function library() {
  const text = fs.readFileSync('lib/minbar/content/media.ts','utf8');
  const groups = {};
  for(const name of groupNames) {
    const m = text.match(new RegExp('export const '+name+'\\s*=\\s*\\[([\\s\\S]*?)\\];'));
    if(!m) throw Error('SOURCE_GROUP_MISSING:'+name);
    groups[name]=[...m[1].matchAll(/"([A-Za-z0-9_-]{20,})"/g)].map(x=>x[1]);
  }
  if(Object.values(groups).reduce((n,x)=>n+x.length,0)!==33) throw Error('SOURCE_LIBRARY_CHANGED');
  return groups;
}
function loadAssets() {
  const groups=library();
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  if(!Array.isArray(manifest.items)||manifest.items.length!==33) throw Error('EXPECTED_33_ITEMS');
  const seen=new Set(),assets=[];
  for(const item of manifest.items) {
    if(item.status!=='OK'||!groups[item.group]?.includes(item.drive_id)||seen.has(item.drive_id)) throw Error('SOURCE_UNVERIFIED:'+item.drive_id);
    seen.add(item.drive_id);
    if(typeof item.file!=='string'||path.basename(item.file)!==item.file||!/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/i.test(item.file))throw Error('UNSAFE_FILENAME');
    if(!/^[a-f0-9]{64}$/i.test(item.sha256))throw Error('BAD_MANIFEST_SHA');
    const file=path.join(root,item.file);
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.size<5000||stat.size>12*1024*1024)throw Error('INVALID_IMAGE_SIZE');
    const bytes=fs.readFileSync(file);
    if(digest(bytes)!==item.sha256)throw Error('SOURCE_CHECKSUM_MISMATCH:'+item.drive_id);
    const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!jpg&&!png&&!webp)throw Error('NOT_AN_IMAGE:'+item.drive_id);
    assets.push({id:item.drive_id,group:item.group,file,sha256:item.sha256});
  }
  return assets.sort((a,b)=>a.group.localeCompare(b.group)||a.id.localeCompare(b.id));
}
function receipts() {
  const folder=path.join(root,'cloudinary-receipts');
  const found={};
  if(fs.existsSync(folder))for(const name of fs.readdirSync(folder)){
    if(!/^[A-Za-z0-9_-]+\.json$/.test(name))continue;
    const r=JSON.parse(fs.readFileSync(path.join(folder,name),'utf8'));
    if(r.drive_id&&r.secure_url)found[r.drive_id]=r;
  }
  return found;
}
async function checkPublicImage(url,cloudName) {
  const p=new URL(url);
  if(p.protocol!=='https:'||p.hostname!=='res.cloudinary.com'||p.pathname.split('/')[1]!==cloudName)throw Error('WRONG_DELIVERY_HOST');
  const response=await fetch(url,{headers:{Range:'bytes=0-512'},signal:AbortSignal.timeout(30000)});
  const type=response.headers.get('content-type')||'';
  await response.body?.cancel();
  if(!response.ok||!type.startsWith('image/'))throw Error('DELIVERY_HTTP_'+response.status);
}
async function audit(assets) {
  const {PrismaClient}=projectRequire('@prisma/client');
  const prisma=new PrismaClient();
  let rows;
  try { rows=await prisma.campaign.findMany({where:{isActive:true},select:{id:true,title:true,slug:true,images:true,translations:{select:{slug:true,image:true,locale:true}}}}); }
  finally {await prisma.$disconnect();}
  const groups={
    'gaza-hot-meals':'GAZA_MEALS',
    'gaza-food-parcels':'GAZA_PARCELS',
    'gaza-bread':'GAZA_BREAD',
    'مشروع-نقل-المصلين-الى-المسجد-الاقصى':'TRAVEL'
  };
  const prepared=receipts();
  const projects=rows.map(p=>{
    const urls=[...new Set([...(p.images||[]),...(p.translations||[]).map(t=>t.image)].filter(Boolean))];
    const old=urls.filter(oldUrl);
    const slugs=new Set([p.slug,...(p.translations||[]).map(t=>t.slug)].filter(Boolean));
    const candidates=[...new Set([...slugs].map(s=>groups[s]).filter(Boolean))];
    const group=candidates.length===1?candidates[0]:null;
    return {title:p.title,slug:p.slug,old_url_count:old.length,other_url_count:urls.length-old.length,
      old_translation_covers:(p.translations||[]).filter(t=>oldUrl(t.image)).length,
      candidate_group:group, candidate_source_ids:group?assets.filter(a=>a.group===group).map(a=>a.id):[],
      staged_count:group?assets.filter(a=>a.group===group&&prepared[a.id]).length:0,
      action:'EDITORIAL_REVIEW_REQUIRED_NO_DATABASE_CHANGES'};
  });
  const result={mode:'READ_ONLY',active_projects:rows.length,affected_projects:projects.filter(p=>p.old_url_count).length,
    recovered_valid_files:assets.length,staged_files:Object.keys(prepared).length,
    candidate_projects:projects.filter(p=>p.old_url_count&&p.candidate_group).length,
    warning:'Historical Drive photos are not proven identical to inaccessible Cloudinary images; manual visual approval required.',
    projects};
  const location=path.join(root,'recovery-audit.json');
  fs.writeFileSync(location,JSON.stringify(result,null,2),{mode:0o600});
  console.log('AUDIT:',JSON.stringify({active:result.active_projects,affected:result.affected_projects,recovered:assets.length,staged:result.staged_files,candidates:result.candidate_projects}));
  console.log('REPORT:',location);console.log('DATABASE_CHANGED: NO');
}
async function upload(assets, groups) {
  const name=process.env.CLOUDINARY_CLOUD_NAME;
  if(!name||name==='z9drzccl'||!process.env.CLOUDINARY_API_KEY||!process.env.CLOUDINARY_API_SECRET)throw Error('NEW_CLOUDINARY_NOT_CONFIGURED');
  const cloud=projectRequire('cloudinary').v2;
  cloud.config({cloud_name:name,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true});
  await cloud.api.ping();
  const directory=path.join(root,'cloudinary-receipts');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  let ok=0,skipped=0,failed=0;
  for(const asset of assets.filter(x=>groups.has(x.group))) {
    const receiptFile=path.join(directory,asset.id+'.json');
    try {
      if(fs.existsSync(receiptFile)) {
        const previous=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
        if(previous.sha256!==asset.sha256||previous.cloud_name!==name||previous.drive_id!==asset.id)throw Error('RECEIPT_CONFLICT');
        await checkPublicImage(previous.secure_url,name);
        console.log('EXISTING_VERIFIED:',asset.id);skipped++;continue;
      }
      const result=await cloud.uploader.upload(asset.file,{resource_type:'image',folder:'minberiaksa/drive-recovery-20261107',
        public_id:'drive-'+asset.id+'-'+asset.sha256.slice(0,12),overwrite:false,unique_filename:false,
        tags:['restored-drive','editorial-review-required']});
      await checkPublicImage(result.secure_url,name);
      fs.writeFileSync(receiptFile,JSON.stringify({drive_id:asset.id,group:asset.group,sha256:asset.sha256,
        cloud_name:name,secure_url:result.secure_url,public_id:result.public_id,
        review_status:'NOT_PUBLISHED',uploaded_at:new Date().toISOString()},null,2),{mode:0o600,flag:'wx'});
      console.log('UPLOADED_HTTP_200:',asset.group,asset.id);ok++;
    }catch(err){console.error('UPLOAD_FAILED:',asset.id,String(err.message).slice(0,150));failed++;}
  }
  console.log('UPLOAD_SUMMARY:',JSON.stringify({uploaded:ok,skipped,failed,database_changed:false}));
  if(failed)process.exitCode=1;
}
async function main(){
  const assets=loadAssets();
  const mode=process.argv[2];
  if(mode==='audit')return audit(assets);
  if(mode!=='upload')throw Error('USAGE: audit or upload --groups=GAZA_BREAD,GAZA_PARCELS,GAZA_MEALS,TRAVEL');
  const option=process.argv.find(x=>x.startsWith('--groups='));
  if(!option)throw Error('UPLOAD_REQUIRES_EXPLICIT_GROUPS');
  const groups=new Set(option.slice(9).split(','));
  if(!groups.size||[...groups].some(g=>!allowedGroups.has(g)))throw Error('GROUP_NOT_ELIGIBLE_FOR_STAGING');
  return upload(assets,groups);
}
main().catch(err=>{console.error('RECOVERY_ERROR:',String(err.message).slice(0,150));process.exitCode=1;});
