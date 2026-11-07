#!/usr/bin/env node
'use strict';
/**
 * Read-only survey of project photo sources on the Minber production host.
 * Scans explicit public/media/cached/release directories, never decompresses,
 * copies, removes, uploads or modifies any source data.
 * All results remain private on the server. Never follows symlinks.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const app = process.cwd();
if (!fs.existsSync(path.join(app, 'lib/minbar/content/media.ts')) ||
    !fs.existsSync(path.join(app, 'package.json'))) {
  throw Error('RUN_FROM_PROJECT_ROOT: cd /root/minberiaksa');
}
const home = process.env.MINBER_MEDIA_SCAN_HOME || '/root';
const outdir = process.env.MINBER_MEDIA_SCAN_OUTPUT || '/root/minber-media-recovery/from-drive/server-source-discovery';
const LIMIT_FILES = 100000, LIMIT_IMAGES = 4000, LIMIT_ARCHIVES = 150;
const deadline = Date.now() + 90000;
const skip = /^(?:\.git|node_modules|\.pnpm|\.npm|\.turbo|\.vercel|logs|log|tmp|temp|private|secrets|donors|invoices|payment-receipts|bank-transfer|certificates|passports|identity-documents)$/i;
const privatePath = /(?:^|\/)(?:donors?|invoices?|receipts?|bank-transfers?|kyc|identity-documents?|passports?|secrets?|private|certificates?)(?:\/|$)/i;
const imageExt = /\.(?:jpe?g|png|webp|avif|heic|heif|gif|bmp|tiff?)$/i;
const archiveExt = /\.(?:zip|tar|tgz|tar\.gz|tar\.xz|tar\.zst|7z|rar|bak)$/i;
const roots = [
  ['public', path.join(app,'public'),8],
  ['next-image-cache',path.join(app,'.next/cache/images'),8],
  ['previous-image-cache',path.join(app,'.next-previous/cache/images'),8],
  ['next-static-media',path.join(app,'.next/static/media'),6],
  ['previous-static-media',path.join(app,'.next-previous/static/media'),6],
  ['app-uploads',path.join(app,'uploads'),8],
  ['app-media',path.join(app,'media'),8],
  ['app-storage',path.join(app,'storage'),8],
  ['app-backups',path.join(app,'backups'),8],
  ['release-backups',path.join(home,'minberi-release-backups'),9],
  ['old-backups',path.join(home,'minberiaksa-backups'),8],
  ['minber-backups',path.join(home,'minber-backups'),8],
  ['nginx-cache','/var/cache/nginx',8],
  ['var-www-site','/var/www/minberiaksa',7],
];
const counters={entries:0,images:0,archives:0,truncated:false};
const images=[], archives=[], rootsChecked=[], errors=[], seenPaths=new Set();
function typeOf(b) {
  if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'jpg';
  if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
  if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'webp';
  if(b.length>=6&&b.toString('ascii',0,3)==='GIF')return 'gif';
  if(b.length>=16&&b.toString('ascii',4,8)==='ftyp'&&/avif|avis/.test(b.toString('ascii',8,16)))return 'avif';
  if(b.length>=16&&b.toString('ascii',4,8)==='ftyp'&&/heic|heix/.test(b.toString('ascii',8,16)))return 'heic';
  return null;
}
function magic(file) {
  const fd=fs.openSync(file,'r');
  try {
    const bytes=Buffer.alloc(24);
    const n=fs.readSync(fd,bytes,0,bytes.length,0);
    return typeOf(bytes.subarray(0,n));
  }finally{fs.closeSync(fd);}
}
function hash(file){
  const dig=crypto.createHash('sha256'),fd=fs.openSync(file,'r');
  const buf=Buffer.allocUnsafe(1024*1024);
  try {
    let n;
    while((n=fs.readSync(fd,buf,0,buf.length,null))>0)dig.update(buf.subarray(0,n));
    return dig.digest('hex');
  }finally{fs.closeSync(fd);}
}
function scan(group,folder,depthLimit){
  const entry={group,folder,status:'MISSING',found:0,archive_count:0,seen:0};
  let st;
  try{st=fs.lstatSync(folder);}catch{return entry;}
  if(!st.isDirectory()||st.isSymbolicLink())return entry;
  const stack=[{folder,depth:0}];
  entry.status='SCANNED';
  while(stack.length){
    if(Date.now()>deadline||counters.entries>=LIMIT_FILES||images.length>=LIMIT_IMAGES||archives.length>=LIMIT_ARCHIVES){
      counters.truncated=true;break;
    }
    const cur=stack.pop();
    if(seenPaths.has(cur.folder))continue;
    seenPaths.add(cur.folder);
    let listing;
    try{listing=fs.readdirSync(cur.folder,{withFileTypes:true});}
    catch(e){errors.push({source:group,code:e.code||'UNREADABLE_DIRECTORY'});continue;}
    for(const d of listing){
      counters.entries++;entry.seen++;
      if(counters.entries>=LIMIT_FILES||Date.now()>deadline){counters.truncated=true;break;}
      const p=path.join(cur.folder,d.name);
      if(privatePath.test(p)||d.isSymbolicLink())continue;
      if(d.isDirectory()){
        if(cur.depth<depthLimit&&!skip.test(d.name))stack.push({folder:p,depth:cur.depth+1});
        continue;
      }
      if(!d.isFile())continue;
      const cache=group.includes('cache');
      const possibleImage=imageExt.test(d.name)||cache;
      const possibleArchive=archiveExt.test(d.name);
      if(!possibleImage&&!possibleArchive)continue;
      let st;
      try{st=fs.statSync(p);}catch{continue;}
      if(possibleArchive){
        if(/(?:minber|aksa|backup|public|site|archive|image|photo|asset|media|upload|build)/i.test(p)){
          archives.push({source:group,file:p,bytes:st.size,modified:st.mtime.toISOString()});
          entry.archive_count++;counters.archives++;
        }
        continue;
      }
      if(st.size<2048||st.size>30*1024*1024)continue;
      let format;
      try{format=magic(p);}catch{continue;}
      if(!format)continue;
      let sha256=null;
      try{sha256=hash(p);}catch{}
      images.push({source:group,file:p,bytes:st.size,format,sha256,modified:st.mtime.toISOString(),
        classification:'UNVERIFIED_PHOTO_DO_NOT_PUBLISH'});
      entry.found++;counters.images++;
    }
    if(counters.truncated)break;
  }
  return entry;
}
async function getOldFileBasenames() {
  try {
    const {PrismaClient}=createRequire(path.join(app,'package.json'))('@prisma/client');
    const db=new PrismaClient();
    try{
      const rows=await db.campaign.findMany({
        where:{isActive:true},
        select:{title:true,slug:true,images:true,ogImage:true,
          translations:{select:{image:true,ogImage:true}}}
      });
      const refs=[];
      for(const r of rows){
        const urls=[...(r.images||[]),r.ogImage,...r.translations.flatMap(x=>[x.image,x.ogImage])];
        for(const url of urls)if(typeof url==='string'&&
          /^https:\/\/res\.cloudinary\.com\/z9drzccl\//i.test(url)){
          const last=decodeURIComponent(url.split('?')[0].split('/').pop()||'');
          const stem=last.replace(/\.[^.]+$/,'').toLowerCase();
          if(stem.length>=10)refs.push({project:r.title,slug:r.slug,stem});
        }
      }
      return refs;
    }finally{await db.$disconnect();}
  }catch(e){errors.push({source:'campaign-readonly',code:String(e.message).slice(0,100)});return [];}
}
async function main(){
  roots.forEach(row=>rootsChecked.push(scan(...row)));
  const known=await getOldFileBasenames();
  const matches=[];
  for(const f of images){
    const stem=path.basename(f.file).replace(/\.[^.]+$/,'').toLowerCase();
    for(const ref of known)if(stem===ref.stem||stem.endsWith('-'+ref.stem)||ref.stem.endsWith('-'+stem)&&stem.length>=12){
      matches.push({project:ref.project,slug:ref.slug,legacy_stem:ref.stem,local_path:f.file,sha256:f.sha256,
        method:'BASENAME_CANDIDATE_NEEDS_VISUAL_VERIFICATION'});
    }
  }
  const discovered=[];
  try {
    for(const d of fs.readdirSync(home,{withFileTypes:true})){
      if(d.isSymbolicLink())continue;
      if(!/(?:minber|aksa|backup|media|archive)/i.test(d.name))continue;
      const p=path.join(home,d.name);
      if(roots.some(x=>x[1]===p)||p===app||p.includes('minber-media-recovery'))continue;
      discovered.push({path:p,type:d.isDirectory()?'directory':'file'});
    }
  }catch{}
  const groups={};
  images.forEach(x=>groups[x.source]=(groups[x.source]||0)+1);
  const summary={images:images.length,archives:archives.length,
    legacy_filename_candidates:matches.length,old_url_stems_compared:known.length,
    additional_backup_locations:discovered.length,counts_by_source:groups,truncated:counters.truncated};
  const report={mode:'READ_ONLY_LOCAL_MEDIA_DISCOVERY',summary,roots:rootsChecked,
    candidates:matches,images,archives,additional_backup_locations:discovered,errors,
    warning:'Local image evidence alone does not prove association with a campaign. Manual content review required.'};
  fs.mkdirSync(outdir,{recursive:true,mode:0o700});
  const file=path.join(outdir,'server-media-inventory.json');
  fs.writeFileSync(file,JSON.stringify(report,null,2),{mode:0o600});
  console.log('SERVER_MEDIA_DISCOVERY:',JSON.stringify(summary));
  rootsChecked.filter(x=>x.status==='SCANNED').forEach(x=>
    console.log('SOURCE:',x.group,'IMAGES:',x.found,'ARCHIVES:',x.archive_count));
  matches.slice(0,20).forEach(x=>console.log('POSSIBLE_ORIGINAL:',x.project,'LOCAL_FILE:',x.local_path));
  discovered.forEach(x=>console.log('OTHER_BACKUP_LOCATION:',x.path));
  console.log('REPORT:',file);
  console.log('DATABASE_CHANGED: NO');
  console.log('CLOUDINARY_UPLOADS: NONE');
}
main().catch(e=>{console.error('SERVER_MEDIA_DISCOVERY_FAILED:',String(e.message).slice(0,160));process.exitCode=1;});
