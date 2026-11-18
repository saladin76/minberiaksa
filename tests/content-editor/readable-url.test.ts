import assert from "node:assert/strict";
import test from "node:test";
import { toReadableUrl } from "../../lib/marketing/readable-url";

const enc = (s: string) => encodeURIComponent(s);

test("decodes an Arabic slug from the bug report", () => {
  assert.equal(
    toReadableUrl("https://minberiaksa.org/ar/bagislar/%D9%83%D9%86-%D8%AF%D9%81%D8%A7%D9%87%D9%85"),
    "https://minberiaksa.org/ar/bagislar/كن-دفاهم",
  );
});

test("readable URL resolves to the same canonical URL", () => {
  const cases = [
    `https://minberiaksa.org/ar/bagislar/${enc("كن-دفاهم")}`,
    `https://minberiaksa.org/tr/bagislar/${enc("kış-kampanyası")}?currency=TRY`,
    `https://minberiaksa.org/ar/bagislar/${enc("حملة الشتاء")}?utm_campaign=${enc("حملة الشتاء")}&utm_source=meta`,
    `https://minberiaksa.org/ar/bagislar/${enc("a/b?c#d%e")}?x=${enc("ق&ر=س+ت")}#${enc("قسم")}`,
    "https://minberiaksa.org/en/zakat?ref=abc&openCartPayment=1",
  ];
  for (const canonical of cases) {
    assert.equal(new URL(toReadableUrl(canonical)).href, new URL(canonical).href, canonical);
  }
});

test("keeps URL-significant characters encoded", () => {
  const out = toReadableUrl(`https://x.org/ar/${enc("أ ب?ج#د/هـ%")}?q=${enc("س&ع=ص")}`);
  assert.ok(!/\s/.test(out), "no raw spaces");
  assert.match(out, /%20/);
  assert.match(out, /%3F/);
  assert.match(out, /%23/);
  assert.match(out, /%2F/);
  assert.match(out, /%25/);
  assert.match(out, /%26/);
  assert.match(out, /%3D/);
});

test("arabic utm value with '+' spaces stays valid", () => {
  const q = new URLSearchParams({ utm_campaign: "حملة الشتاء" }).toString();
  const out = toReadableUrl(`https://x.org/ar?${q}`);
  assert.equal(out, "https://x.org/ar?utm_campaign=حملة+الشتاء");
  assert.equal(new URL(out).searchParams.get("utm_campaign"), "حملة الشتاء");
});

test("bidi / invisible characters stay encoded", () => {
  const rlo = enc("\u202E");
  const out = toReadableUrl(`https://x.org/ar/abc${rlo}def?x=${enc("ق\u200Fر")}`);
  assert.match(out, /%E2%80%AE/);
  assert.match(out, /%E2%80%8F/);
});

test("ascii-only and invalid input are unchanged", () => {
  assert.equal(toReadableUrl("https://x.org/en/zakat?a=1&b=2"), "https://x.org/en/zakat?a=1&b=2");
  assert.equal(toReadableUrl(""), "");
  assert.equal(toReadableUrl("not a url"), "not a url");
  assert.equal(toReadableUrl("https://x.org/a%E0%A4%A"), "https://x.org/a%E0%A4%A");
});
