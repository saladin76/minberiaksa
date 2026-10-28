import test from "node:test";
import assert from "node:assert/strict";
import { communicationDonationScan, communicationDonationPageIds } from "../../lib/communication/campaign-donation-scan";
import { isCommunicationUtmMedium } from "../../lib/communication/campaign-attribution-matching";

test("the database selector preserves historical media and excludes unrelated advertising before transfer", () => {
  const query = communicationDonationScan();
  const rule = query.filter["attribution.utm_medium"];
  const regex = new RegExp(rule.$regex, rule.$options);
  for (const medium of ["communication", " messaging ", "WHATSAPP", "wa", "email", "sms", "paid_social", "cpc", "communication-other", ""])
    assert.equal(regex.test(medium), isCommunicationUtmMedium(medium), medium);
  assert.deepEqual(query.options.projection, {_id:1});
  assert.equal(query.options.maxTimeMS, 15000);
});

test("cursor pagination uses Extended JSON IDs without dropping older matched donations", () => {
  const ids = ["000000000000000000000001", "000000000000000000000002"];
  assert.deepEqual(communicationDonationPageIds(ids.map(id => ({_id:{$oid:id}}))), ids);
  assert.deepEqual(communicationDonationScan(ids[1]).filter._id, {$gt:{$oid:ids[1]}});
});

test("malformed, unsorted or truncated database pages cannot turn unavailable income into zero", () => {
  assert.throws(() => communicationDonationPageIds({}), /INVALID_PAGE/);
  assert.throws(() => communicationDonationPageIds([{_id:"invalid"}]), /INVALID_ID/);
  assert.throws(() => communicationDonationPageIds([{_id:"000000000000000000000002"},{_id:"000000000000000000000001"}]), /INVALID_ORDER/);
  assert.throws(() => communicationDonationScan("unsafe"), /INVALID_CURSOR/);
});
