/* eslint-disable @typescript-eslint/no-explicit-any -- Fault-injection fixtures deliberately supply partial Prisma clients and VM module exports. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const service = import(pathToFileURL(resolve('scripts/retired-category-cleanup-service.mjs')).href);
function fixture() {
 let state:any = { category:{id:'6aa2eb54817054fc3dd6b2c7',name:'صدقة',isActive:false,campaignIds:['a','b'],editorVersion:null},
  projects:[{id:'a',categoryIds:['6aa2eb54817054fc3dd6b2c7','other'],categoryPriorities:{other:1},isActive:true},{id:'b',categoryIds:['6aa2eb54817054fc3dd6b2c7'],isActive:false,isDeleted:true}], refs:0, logs:[] };
 let backup:any, failBackup=false,failAudit=false,race=false,writes=0;
 const client=(s:any):any=>({category:{findUnique:async()=>s.category,delete:async()=>{s.category=null;}},campaign:{findMany:async()=>s.projects,count:async()=>s.projects.filter((p:any)=>p.categoryIds.includes('6aa2eb54817054fc3dd6b2c7')).length},donationCategoryItem:{count:async()=>s.refs},subscriptionCategoryItem:{count:async()=>0},superCategoryItem:{count:async()=>0},
  $runCommandRaw:async(command:any)=>{const update=command.updates[0];assert.deepEqual(Object.keys(update.u).sort(),['$pull','$set','$unset']);assert.equal(update.u.$pull.categoryIds.$oid,'6aa2eb54817054fc3dd6b2c7');for(const p of s.projects)p.categoryIds=p.categoryIds.filter((id:string)=>id!=='6aa2eb54817054fc3dd6b2c7');return{ok:1,n:s.projects.length};},auditLog:{create:async({data}:any)=>{if(failAudit)throw Error('audit down');s.logs.push(data);}}});
 const db:any={};for(const name of ['category','campaign','donationCategoryItem','subscriptionCategoryItem','superCategoryItem'])db[name]=new Proxy({},{get:(_t,key)=>(...args:any[])=>client(state)[name][key](...args)});
 db.$transaction=async(fn:any)=>{if(race)state.projects[0].updatedAt='changed';const draft=structuredClone(state);const value=await fn(client(draft));state=draft;writes++;return value;};
 return{db,state:()=>state,writes:()=>writes,backup:()=>backup,failBackup:()=>{failBackup=true;},failAudit:()=>{failAudit=true;},race:()=>{race=true;},saveBackup:async(s:any)=>{if(failBackup)throw Error('backup down');backup=structuredClone(s);return'/private/fixture.json';}};
}
test('review is read only; cleanup preserves shared and deleted projects and is idempotent',async()=>{
 const api=await service,f=fixture(),opts={expectedProjects:2,saveBackup:f.saveBackup};assert.equal((await api.cleanRetiredCategory(f.db,opts)).readOnly,true);assert.equal(f.writes(),0);assert.equal(f.backup(),undefined);
 const report=await api.cleanRetiredCategory(f.db,{...opts,apply:true});assert.equal(report.verifiedAbsent,true);assert.equal(report.projectsDeleted,0);assert.equal(f.state().projects.length,2);assert.deepEqual(f.state().projects[0].categoryIds,['other']);assert.equal(f.state().projects[0].isActive,true);assert.equal(f.state().projects[1].isDeleted,true);assert.equal(f.backup().projects[0].categoryIds.length,2);assert.equal(f.state().logs.length,1);
 assert.equal((await api.cleanRetiredCategory(f.db,{...opts,apply:true})).alreadyAbsent,true);assert.equal(f.writes(),1);
});
test('scope, direct financial references, backup failure and concurrent edits stop deletion',async()=>{
 const api=await service;
 for(const mode of ['scope','refs','backup','race']){const f=fixture();if(mode==='refs')f.state().refs=1;if(mode==='backup')f.failBackup();if(mode==='race')f.race();await assert.rejects(api.cleanRetiredCategory(f.db,{apply:true,expectedProjects:mode==='scope'?3:2,saveBackup:f.saveBackup}));assert.ok(f.state().category);assert.equal(f.writes(),0);assert.equal(f.state().projects[0].categoryIds.length,2);}
});
test('failed audit rolls back category deletion and project detachment together',async()=>{
 const api=await service,f=fixture();f.failAudit();await assert.rejects(api.cleanRetiredCategory(f.db,{apply:true,expectedProjects:2,saveBackup:f.saveBackup}),/audit down/);assert.ok(f.state().category);assert.equal(f.state().projects[0].categoryIds.length,2);assert.equal(f.writes(),0);
});
