import { test } from "node:test";
import assert from "node:assert/strict";
import { clipSeoDescription } from "../../lib/seo-description";

test("published SEO descriptions respect language budgets and keep concise reviewed text intact", () => {
  const japanese = "エルサレム旧市街の住宅修復を支援し、家族が安全で尊厳ある暮らしを続けられる住環境を整えます。歴史的な街並みと建築遺産を守る取り組みにご協力ください。";
  assert.equal(clipSeoDescription(japanese, "ja"), japanese);
  for (const locale of ["ja", "zh"]) {
    const text = japanese.repeat(3), output = clipSeoDescription(text, locale);
    assert.ok(output.length <= 90); assert.ok(output.endsWith("…"));
  }
  for (const locale of ["ar", "en", "tr"]) {
    const text = "<em>Support families in Jerusalem.</em> ".repeat(12), output = clipSeoDescription(text, locale);
    assert.ok(output.length <= 160); assert.ok(!output.includes("<")); assert.ok(output.endsWith("…"));
  }
});
