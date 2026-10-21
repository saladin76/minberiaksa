import test from "node:test";
import assert from "node:assert/strict";
import { whatsappDeliveryProgress } from "../../lib/communication/whatsapp-delivery-progress";
test("read and reply evidence keeps the delivery funnel cumulative without fabricating timestamps",()=>{
  for(const status of ["READ","REPLIED"]){const row={status,deliveredAt:null,readAt:null};const before=JSON.stringify(row);const p=whatsappDeliveryProgress(row);assert.equal(p.delivered,true);assert.equal(p.accepted,true);assert.equal(p.read,true);assert.equal(JSON.stringify(row),before);}
});
test("failed provider requests are attempts but never reported as accepted without provider evidence",()=>{
  const rejected=whatsappDeliveryProgress({status:"FAILED"});assert.equal(rejected.accepted,false);assert.equal(rejected.attempted,true);
  const accepted=whatsappDeliveryProgress({status:"FAILED",providerMessageId:"provider-id"});assert.equal(accepted.accepted,true);assert.equal(accepted.failed,true);
  for(const status of ["SKIPPED","DRAFT","RENDERED","CANCELLED"]){assert.equal(whatsappDeliveryProgress({status}).attempted,false);}
});
