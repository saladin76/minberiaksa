/* eslint-disable @typescript-eslint/no-explicit-any -- Fault-injection fixtures deliberately supply partial Prisma clients and VM module exports. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { resolveTemplateKind } from "../../lib/communication/template-kind";
import { templateLocaleFromLanguage } from "../../lib/communication/template-locale-media";
type Value=Record<string,any>;
function load(file:string,deps:Value){const mod={exports:{} as Value};new vm.Script(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText).runInNewContext({module:mod,exports:mod.exports,Set,process:{env:{DATABASE_URL:"fixture"}},console:{error(){}},require:(name:string)=>{assert.ok(name in deps,name);return deps[name];}});return mod.exports;}
test("saved list language counts are one bounded database operation with no contacts or writes",async()=>{
 let query:Value|undefined;const lib=load("lib/communication/campaign-language-counts.ts",{"@/lib/prisma":{prisma:{communicationAudienceMember:{aggregateRaw:async(q:Value)=>{query=q;return[{_id:"ar",count:14842},{_id:"tr",count:2}];}}}},"@/lib/locales":{DEFAULT_LOCALE:"ar",SUPPORTED_LOCALES:["ar","tr","en"],isValidLocale:(s:string)=>["ar","tr","en"].includes(s)}});
 assert.deepEqual(JSON.parse(JSON.stringify(await lib.countSavedListLanguages("a".repeat(24),"WHATSAPP"))),{ar:14842,tr:2});assert.equal(query!.options.maxTimeMS,15000);
 assert.equal(query!.pipeline[0].$match.contactType,"DONOR");assert.equal(query!.pipeline[0].$match.status,"ACTIVE");assert.deepEqual(JSON.parse(JSON.stringify(query!.pipeline[0].$match.listId)),{$oid:"a".repeat(24)});
 assert.match(JSON.stringify(query),/meta-whatsapp-inbound-opt-out/);assert.doesNotMatch(JSON.stringify(query),/whatsappOptIn/);
 await lib.countSavedListLanguages("a".repeat(24),"SMS");assert.match(JSON.stringify(query),/\$size.*profiles/);assert.match(JSON.stringify(query),/smsNotifications/);
 await assert.rejects(lib.countSavedListLanguages("invalid","WHATSAPP"),/INVALID_AUDIENCE_LIST/);
});
test("invalid, duplicate, negative or incomplete aggregate results fail closed",async()=>{
 for(const rows of [null,[{_id:"xx",count:1}],[{_id:"ar",count:-1}],[{_id:"ar",count:"1"}],[{_id:"ar",count:1},{_id:"ar",count:2}]]){
  const lib=load("lib/communication/campaign-language-counts.ts",{"@/lib/prisma":{prisma:{communicationAudienceMember:{aggregateRaw:async()=>rows}}},"@/lib/locales":{DEFAULT_LOCALE:"ar",SUPPORTED_LOCALES:["ar"],isValidLocale:(s:string)=>s==="ar"}});await assert.rejects(lib.countSavedListLanguages("a".repeat(24),"WHATSAPP"));
 }
});
function templateGate(options:{archived?:boolean;system?:boolean;missingDefault?:boolean;broken?:boolean}={}){
 const file="lib/communication/template-compat.ts",source=readFileSync(file,"utf8");const deps:Value=Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],{}]));let rowReads=0,listReads=0;
 deps["./template-kind"]={resolveTemplateKind};deps["./template-locale-media"]={templateLocaleFromLanguage};deps["@/lib/locales"]={DEFAULT_LOCALE:"ar",isValidLocale:(s:string)=>["ar","en","tr"].includes(s)};
 deps["@/lib/prisma"]={prisma:{messageTrigger:{findFirst:async()=>options.system?{id:"event"}:null},communicationSender:{findMany:async()=>options.missingDefault?[]:[{businessAccountId:"default"}]},whatsappTemplate:{findMany:async()=>{listReads++;throw Error("No whole catalogue scan");},findUnique:async(q:Value)=>{rowReads++;if(options.broken)throw Error("database down");assert.equal(q.where.id,"older-than-picker-cap");assert.equal(q.select.wabaVariants.where.businessAccountId,"default");assert.equal(q.select.wabaVariants.where.approvalStatus,"APPROVED");return{id:q.where.id,kind:"CAMPAIGN",status:options.archived?"ARCHIVED":"ACTIVE",wabaVariants:[{languageCode:"en_US",providerTemplateName:"exact",providerTemplateId:"id"},{languageCode:"tr",providerTemplateName:"",providerTemplateId:"id"}]};}},emailTemplate:{findUnique:async()=>({kind:"CAMPAIGN",translations:{tr:{subject:"translated"}}})}}};
 const lib=load(file,deps);return {run:(channel="WHATSAPP")=>lib.getTemplateAvailableLocales(channel,"older-than-picker-cap"),reads:()=>({rowReads,listReads})};
}
test("a saved campaign checks only its exact template, even beyond the picker cap",async()=>{const f=templateGate();assert.deepEqual(JSON.parse(JSON.stringify(await f.run())),["en"]);assert.deepEqual(f.reads(),{rowReads:1,listReads:0});assert.deepEqual(JSON.parse(JSON.stringify(await f.run("EMAIL"))),["ar","tr"]);});
test("archived/system templates, ambiguous routing and provider-truth read failures never become ready",async()=>{for(const options of [{archived:true},{system:true}])assert.deepEqual(JSON.parse(JSON.stringify(await templateGate(options).run())),[]);await assert.rejects(templateGate({missingDefault:true}).run(),/DEFAULT/);await assert.rejects(templateGate({broken:true}).run(),/database down/);});
