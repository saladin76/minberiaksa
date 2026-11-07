import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import * as localeMedia from "../../lib/communication/template-locale-media";
import * as work from "../../lib/communication/template-sync-work";
import * as status from "../../lib/communication/whatsapp-template-status";
import * as syncResult from "../../lib/communication/template-sync-result";
import * as readiness from "../../lib/communication/whatsapp-template-readiness";

function harness(failRead=false) {
  let active=0, peak=0, deletes=0, exactWrites=0;
  const rows:unknown[]=[];
  const audits:Array<{action:string}>=[];
  const wait=async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;};
  const prisma={
    communicationSender:{findMany:async()=>[{businessAccountId:"waba"}]},
    whatsappTemplate:{findMany:async()=>[{id:"template",name:"family",wabaVariants:[]}],update:async()=>({})},
    whatsappTemplateWabaVariant:{
      upsert:async({create}:{create:unknown})=>{await wait();rows.push(create);exactWrites++;return create;},
      findMany:async()=>{if(failRead)throw new Error("DB_READ_FAILED");return rows;},
      deleteMany:async()=>{deletes++;return{count:0};},
    },
    whatsappTemplateVariant:{upsert:async()=>({}),deleteMany:async()=>{deletes++;return{count:0};},findMany:async()=>[]},
  };
  const dependencies:Record<string,unknown>={
    "server-only":{},"@/lib/prisma":{prisma},"@/lib/audit-log":{writeAuditLog:async(row:{action:string})=>{audits.push(row);}},
    "@/lib/locales":{SUPPORTED_LOCALES},"./template-locale-media":localeMedia,"./template-sync-work":work,
    "./whatsapp-template-status":status,"./meta-parameter-name":{schemaHasInvalidMetaParameterNames:()=>false},
    "./template-sync-result":syncResult,
    "./whatsapp-template-readiness":readiness,
    "./providers/meta-whatsapp/templates":{listAllTemplates:async()=>({ok:true,templates:SUPPORTED_LOCALES.map(locale=>({name:"family",id:`id-${locale}`,language:localeMedia.META_TEMPLATE_LANGUAGES[locale],status:"APPROVED",category:"UTILITY",rejectedReason:null,qualityScore:null,components:[]}))})},
  };
  const output=ts.transpileModule(fs.readFileSync("lib/communication/whatsapp-template-sync.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loaded={exports:{} as Record<string,unknown>};
  new vm.Script(output).runInNewContext({module:loaded,exports:loaded.exports,Date,Set,Map,console,process:{env:{DATABASE_URL:"test"}},require:(id:string)=>{if(!(id in dependencies))throw new Error(`Unexpected dependency ${id}`);return dependencies[id];}});
  const syncMetaWhatsappTemplates=loaded.exports.syncMetaWhatsappTemplates as (opts?:{templateId?:string;businessAccountId?:string})=>Promise<{ok:boolean;variantsUpserted?:number}>;
  return {run:syncMetaWhatsappTemplates,stats:()=>({peak,active,deletes,exactWrites}),audits};
}

test("real sync persists all 19 languages with bounded database parallelism",async()=>{
  const h=harness();const result=await h.run();
  assert.equal(result.ok,true);assert.equal(result.variantsUpserted,19);
  assert.equal(h.stats().exactWrites,19);assert.equal(h.stats().peak,6);assert.equal(h.stats().active,0);
  assert.equal(h.audits[0].action,syncResult.WHATSAPP_CATALOGUE_SYNC_ACTION);
});

test("publishing one template or refreshing one WABA cannot replace the catalogue completion audit",async()=>{
  for(const scope of [{templateId:"template"},{businessAccountId:"waba"}]){
    const h=harness();assert.equal((await h.run(scope)).ok,true);
    assert.equal(h.audits[0].action,"communication.whatsapp.templates.sync");
  }
});

test("failed provider-truth read cannot delete aggregate approvals or report success",async()=>{
  const h=harness(true);
  await assert.rejects(h.run(),/DB_READ_FAILED/);
  // Only exact-WABA cleanup ran after a complete provider catalogue; aggregate cleanup never ran.
  assert.equal(h.stats().deletes,1);
});
