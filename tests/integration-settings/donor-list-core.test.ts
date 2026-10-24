import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDonorListContact, parseDonorListCsv } from "../../lib/donor-lists/core";

test("donor contact normalization requires a name and at least one valid contact method", () => {
  assert.equal(normalizeDonorListContact({ name: "  A  " }), null);
  assert.equal(normalizeDonorListContact({ name: "A", email: "not-an-email" }), null);
  assert.deepEqual(normalizeDonorListContact({ name: " A ", email: "A@Example.org" }), {
    name: "A",
    email: "A@Example.org",
    phone: null,
    normalizedEmail: "a@example.org",
    normalizedPhone: null,
  });
  assert.equal(normalizeDonorListContact({ name: "A", phone: "+90 (555) 111-2233" })?.normalizedPhone, "905551112233");
});

test("CSV parsing supports quoted commas, CRLF, and Arabic headers", () => {
  const result = parseDonorListCsv(
    "الاسم,البريد الإلكتروني,الهاتف\r\n\"سارة, علي\",sara@example.org,+905551112233\r\n"
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.contacts, [{ name: "سارة, علي", email: "sara@example.org", phone: "+905551112233" }]);
});

test("CSV import rejects unknown headers and batches above the safe limit", () => {
  assert.ok(parseDonorListCsv("x,y\n1,2").errors.length);
  const rows = ["name,email", ...Array.from({ length: 251 }, (_, index) => "Donor " + index + ",donor" + index + "@example.org")].join("\n");
  assert.deepEqual(parseDonorListCsv(rows).contacts, []);
  assert.match(parseDonorListCsv(rows).errors[0], /250/);
});
