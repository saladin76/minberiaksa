import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as links from "../../lib/templates/donation-link-parameters";
import { donationDocumentPathToken, parseDonationDocumentPathToken } from "../../lib/donations/access-token-link";
import { templateDonorName, donationProjectSummary } from "../../lib/templates/donation-projects";
import { SUPPORTED_LOCALES } from "../../lib/locales";
const donationId="507f1f77bcf86cd799439011";
const token="a".repeat(48);
const schema=[{type:"BUTTONS",buttons:[{type:"URL",url:"https://donor.example/api/certificates/thanks/{{1}}"},{type:"URL",url:"https://donor.example/api/receipts/{{1}}"}]}];
const bindings={"button.0.1":"donation.id","button.1.1":"donation.id"};
test("guest document tokens are restricted to the owned origin and document button scopes",()=>{
  const slots=links.certificateParameterSlots(schema,bindings,"https://donor.example");
  assert.deepEqual(slots,["button.0.1","button.1.1"]);
  const pathToken=`${donationId}-${token}`;
  assert.deepEqual(links.certificateParameterOverrides(slots,donationId,token),{"button.0.1":pathToken,"button.1.1":pathToken});
  assert.match(pathToken,/^[0-9a-f-]+$/i);
  assert.equal(pathToken.includes("?"),false);
  assert.equal(donationDocumentPathToken(donationId,token),pathToken);
  assert.deepEqual(parseDonationDocumentPathToken(pathToken),{donationId,token});
  assert.deepEqual(parseDonationDocumentPathToken(donationId),{donationId,token:null});
  assert.equal(parseDonationDocumentPathToken(`${donationId}-short`),null);
  assert.deepEqual(links.certificateParameterSlots(schema,bindings,"https://another.example"),[]);
  assert.deepEqual(links.certificateParameterSlots([{type:"BUTTONS",buttons:[{type:"URL",url:"https://donor.example.attacker.test/api/receipts/{{1}}"}]}],bindings,"https://donor.example"),[]);
  assert.deepEqual(links.certificateParameterOverrides(slots,"donation-id",null),{});
});
test("document link preparation checks the donor and never modifies body identifiers or credentials",async()=>{
  const source=fs.readFileSync("lib/communication/template-donation-links.ts","utf8");
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const dependencies:Record<string,unknown>={"server-only":{},"../templates/donation-link-parameters":links,"@/lib/prisma":{prisma:{donation:{findUnique:async()=>({donorId:"owner",accessToken:token})}}}};
  const loaded={exports:{} as Record<string,any>};new vm.Script(output).runInNewContext({module:loaded,exports:loaded.exports,process:{env:{NEXT_PUBLIC_SITE_URL:"https://donor.example"}},require:(key:string)=>{assert.ok(key in dependencies,key);return dependencies[key];}});
  const base={componentsSchema:schema,scopedNames:bindings,values:{"donation.id":donationId,"1":"Donor Name"},donationId,recipientUserId:"owner"};
  const result=await loaded.exports.donationTemplateValues(base);
  assert.equal(result.ok,true);assert.equal(result.values["donation.id"],donationId);assert.equal(result.values["1"],"Donor Name");assert.equal(result.values["button.0.1"],`${donationId}-${token}`);
  const mismatch=await loaded.exports.donationTemplateValues({...base,recipientUserId:"another-user"});assert.equal(mismatch.ok,false);assert.equal(mismatch.reason,"DONATION_DOCUMENT_RECIPIENT_MISMATCH");assert.equal(mismatch.values,undefined);
});
test("legacy donations without a strong document token fail before Meta receives a broken button URL",async()=>{
  const source=fs.readFileSync("lib/communication/template-donation-links.ts","utf8");
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const dependencies:Record<string,unknown>={"server-only":{},"../templates/donation-link-parameters":links,"@/lib/prisma":{prisma:{donation:{findUnique:async()=>({donorId:"owner",accessToken:null})}}}};
  const loaded={exports:{} as Record<string,any>};new vm.Script(output).runInNewContext({module:loaded,exports:loaded.exports,process:{env:{NEXT_PUBLIC_SITE_URL:"https://donor.example"}},require:(key:string)=>{assert.ok(key in dependencies,key);return dependencies[key];}});
  const result=await loaded.exports.donationTemplateValues({componentsSchema:schema,scopedNames:bindings,values:{"donation.id":donationId},donationId,recipientUserId:"owner"});
  assert.equal(result.ok,false);assert.equal(result.reason,"DONATION_DOCUMENT_ACCESS_TOKEN_UNAVAILABLE");
});
test("waqf links using donation.id are rejected because a donation may issue several certificates",()=>{
  const waqfSchema=[{type:"BUTTONS",buttons:[{type:"URL",url:"https://donor.example/api/certificates/waqf/{{1}}"}]}];
  assert.equal(links.hasUnsupportedWaqfDonationButton(waqfSchema,{"button.0.1":"donation.id"},"https://donor.example"),true);
});
test("all supported languages have a neutral salutation without replacing an existing donor name",()=>{
  for(const locale of SUPPORTED_LOCALES){assert.ok(templateDonorName("",locale).trim());assert.equal(templateDonorName("أحمد",locale),"أحمد");}
});
test("waqf-only donation context identifies actual line kinds instead of leaving project parameters empty",()=>{
  const result=donationProjectSummary({locale:"en",items:[],waqfItems:[{unit:"METER",count:2,amount:3000,amountUSD:3000}]});
  assert.equal(result.campaignTitle,"Waqf metre");assert.equal(result.lines[0].shareCount,2);assert.equal(result.lines[0].amount,3000);
});
