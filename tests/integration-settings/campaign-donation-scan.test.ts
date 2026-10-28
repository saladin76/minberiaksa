import test from "node:test";
import assert from "node:assert/strict";
import { communicationDonationScan, communicationDonationPageIds } from "../../lib/communication/campaign-donation-scan";
import { isCommunicationUtmMedium } from "../../lib/communication/campaign-attribution-matching";
import { PrismaClient, Prisma } from "@prisma/client";
import { createServer } from "node:net";

test("the database selector preserves historical media and excludes unrelated advertising before transfer", () => {
  const query = communicationDonationScan();
  const rule = query.filter["attribution.utm_medium"];
  const regex = new RegExp(rule.$regex, rule.$options);
  for (const medium of ["communication", " messaging ", "WHATSAPP", "wa", "email", "sms", "paid_social", "cpc", "communication-other", ""])
    assert.equal(regex.test(medium), isCommunicationUtmMedium(medium), medium);
  assert.deepEqual(query.options.projection, {_id:1});
  assert.deepEqual(query.options.maxTimeMS, { secs: 15, nanos: 0 });
});

test("the installed Prisma engine accepts the bounded selector instead of rejecting its Duration", async () => {
  // A local socket deliberately rejects MongoDB handshakes. No real database, credentials or rows.
  const server = createServer(socket => socket.destroy());
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const client = new PrismaClient({ datasources: { db: { url: `mongodb://127.0.0.1:${address.port}/duration_fixture?directConnection=true&serverSelectionTimeoutMS=300&connectTimeoutMS=100` } }, log: [] });
  try {
    const selector = communicationDonationScan();
    await assert.rejects(client.donation.findRaw({ ...selector, options: { ...selector.options, maxTimeMS: 15000 } }), error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2023" && /expected struct Duration/.test(String(error.meta?.message)));
    // A transport error proves the valid options passed the real Rust engine's parser.
    await assert.rejects(client.donation.findRaw(selector), error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" && /Server selection timeout/.test(String(error.meta?.message)));
  } finally {
    await client.$disconnect();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
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
