import test from "node:test";
import assert from "node:assert/strict";
import { fixtureModule } from "./gift-delivery-fixture";
import * as locales from "../../lib/locales";
import * as policy from "../../lib/communication/campaign-audience-accounting";

const id="a".repeat(24);
test("failed counter aggregate falls back to complete, bounded event pages without reading contacts or writing", async () => {
  let pages=0;
  const service=fixtureModule<typeof import("../../lib/communication/campaign-counter-service")>("lib/communication/campaign-counter-service.ts",{"@/lib/prisma":{prisma:{communicationDelivery:{
    aggregateRaw:async()=>{throw Error("timeout");},
    findMany:async(query:{take:number;select:Record<string,boolean>;where:{id?:{gt:string}}})=>{
      assert.equal(query.take,1000);assert.equal(query.select.renderedBody,undefined);assert.equal(query.select.recipientEmail,undefined);
      const offset=Number(query.where.id?.gt??0);pages++;
      return Array.from({length:pages===1?1000:2},(_,i)=>({id:String(offset+i+1).padStart(24,"0"),campaignId:id,status:i===0?"FAILED":"SENT",sentAt:i===0?null:new Date(),deliveredAt:null,readAt:null,openedAt:null,clickedAt:null,repliedAt:null}));
    },
  }}}});
  const result=await service.readCampaignDeliveryCounters([id,id]);assert.equal(pages,2);assert.equal(result.get(id)?.total,1002);assert.equal(result.get(id)?.sent,1000);assert.equal(result.get(id)?.failed,2);
});
test("a failed later counter page rejects the read instead of presenting partial success", async () => {
  let pages=0;
  const service=fixtureModule<typeof import("../../lib/communication/campaign-counter-service")>("lib/communication/campaign-counter-service.ts",{"@/lib/prisma":{prisma:{communicationDelivery:{aggregateRaw:async()=>{throw Error("timeout");},findMany:async()=>{if(pages++)throw Error("page unavailable");return Array.from({length:1000},(_,i)=>({id:String(i+1).padStart(24,"0"),campaignId:id,status:"SENT"}));}}}}});
  await assert.rejects(service.readCampaignDeliveryCounters([id]),/page unavailable/);
});
test("coverage fallback matches channel policy, preferred language and explicit opt-outs without creating profiles", async () => {
  const donors=Array.from({length:7},(_,i)=>({id:String(i),email:i===0?null:"fixture@example.test",phone:i===0?null:"+905550000000",smsNotifications:i!==2,preferredLang:i===6?"unknown":"tr"}));
  const profiles=[{userId:"3",doNotContact:true},{userId:"4",consentSource:"meta-whatsapp-inbound-opt-out"},{userId:"5",smsOptIn:false,consentSource:"email-unsubscribe"}];
  const service=fixtureModule<typeof import("../../lib/communication/campaign-language-counts")>("lib/communication/campaign-language-counts.ts",{"@/lib/prisma":{prisma:{communicationAudienceMember:{aggregateRaw:async()=>{throw Error("timeout");},findMany:async()=>donors.map((row,i)=>({id:String(i+1).padStart(24,"0"),userId:row.id}))},user:{findMany:async()=>donors},donorCommunicationProfile:{findMany:async()=>profiles}}},"@/lib/locales":locales,"./campaign-audience-accounting":policy});
  for(const channel of ["EMAIL","SMS","WHATSAPP"] as const){
    const expected:Record<string,number>={};
    for(const donor of donors){const profile=profiles.find(row=>row.userId===donor.id);if(policy.recipientExclusionReason(donor,channel,policy.previewConsentForLegacyDonor(donor,channel,profile)))continue;const locale=locales.isValidLocale(donor.preferredLang)?donor.preferredLang:locales.DEFAULT_LOCALE;expected[locale]=(expected[locale]??0)+1;}
    assert.deepEqual(JSON.parse(JSON.stringify(await service.countSavedListLanguages(id,channel))),expected);
  }
});
