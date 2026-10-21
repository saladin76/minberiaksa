import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as links from "../../lib/templates/donation-link-parameters";
import { templateDonorName, donationProjectSummary } from "../../lib/templates/donation-projects";
import { SUPPORTED_LOCALES } from "../../lib/locales";
const schema=[{type:"BUTTONS",buttons:[{type:"URL",url:"https://donor.example/api/certificates/thanks/{{1}}"},{type:"URL",url:"https://donor.example/api/receipts/{{1}}"}]}];
const bindings={"button.0.1":"donation.id","button.1.1":"donation.id"};
test("guest document tokens are restricted to the owned origin and document button scopes",()=>{
  const slots=links.certificateParameterSlots(schema,bindings,"https://donor.example");
  assert.deepEqual(slots,["button.0.1","button.1.1"]);
  assert.deepEqual(links.certificateParameterOverrides(slots,"donation-id","fixture-token"),{"button.0.1":"donation-id?t=fixture-token","button.1.1":"donation-id?t=fixture-token"});
  assert.deepEqual(links.certificateParameterSlots(schema,bindings,"https://another.example"),[]);
  assert.deepEqual(links.certificateParameterSlots([{type:"BUTTONS",buttons:[{type:"URL",url:"https://donor.example.attacker.test/api/receipts/{{1}}"}]}],bindings,"https://donor.example"),[]);
  assert.deepEqual(links.certificateParameterOverrides(slots,"donation-id",null),{});
});
test("document link preparation checks the donor and never modifies body identifiers or credentials",async()=>{
  const source=fs.readFileSync("lib/communication/template-donation-links.ts","utf8");
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const dependencies:Record<string,unknown>={"server-only":{},"../server-base-url":{getServerBaseUrl:()=>"https://donor.example"},"../templates/donation-link-parameters":links,"@/lib/prisma":{prisma:{donation:{findUnique:async()=>({donorId:"owner",accessToken:"fixture-token"})}}}};
  const loaded={exports:{} as Record<string,any>};new vm.Script(output).runInNewContext({module:loaded,exports:loaded.exports,process:{env:{NEXT_PUBLIC_SITE_URL:"https://donor.example"}},require:(key:string)=>{assert.ok(key in dependencies,key);return dependencies[key];}});
  const base={componentsSchema:schema,scopedNames:bindings,values:{"donation.id":"donation-id","1":"Donor Name"},donationId:"donation-id",recipientUserId:"owner"};
  const result=await loaded.exports.donationTemplateValues(base);
  assert.equal(result.ok,true);assert.equal(result.values["donation.id"],"donation-id");assert.equal(result.values["1"],"Donor Name");assert.equal(result.values["button.0.1"],"donation-id?t=fixture-token");
  const mismatch=await loaded.exports.donationTemplateValues({...base,recipientUserId:"another-user"});assert.equal(mismatch.ok,false);assert.equal(mismatch.values,undefined);
});
test("all supported languages have a neutral salutation without replacing an existing donor name",()=>{
  for(const locale of SUPPORTED_LOCALES){assert.ok(templateDonorName("",locale).trim());assert.equal(templateDonorName("أحمد",locale),"أحمد");}
});
test("waqf-only donation context identifies actual line kinds instead of leaving project parameters empty",()=>{
  const result=donationProjectSummary({locale:"en",items:[],waqfItems:[{unit:"METER",count:2,amount:3000,amountUSD:3000}]});
  assert.equal(result.campaignTitle,"Waqf metre");assert.equal(result.lines[0].shareCount,2);assert.equal(result.lines[0].amount,3000);
});
