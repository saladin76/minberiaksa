import test from "node:test";
import assert from "node:assert/strict";
import { automaticEmailHtml } from "../../lib/templates/font";
for (const locale of ["ar", "tr", "en", "ja"]) test(`email status symbols retain their graphic size and alignment in ${locale}`, () => {
  const source = '<html><head></head><body><div style="width:56px;height:56px;line-height:56px;border-radius:50%;background:#556B2F;color:#fff;font-size:30px;">✓</div><p style="font-size:42px;font-family:Arial">Body text</p><td style="font-size:1px;line-height:6px;height:6px">&nbsp;</td><td style="line-height:6px">&#160;</td></body></html>';
  const html = automaticEmailHtml(source, locale);
  const icon = /<div\b[^>]*>✓<\/div>/.exec(html)![0];
  assert.ok(icon.includes('data-email-symbol="true"'));
  assert.ok(icon.includes("font-size:30px"));
  assert.ok(icon.includes("line-height:56px"));
  assert.ok(icon.includes("Segoe UI Symbol"));
  assert.match(html, /<p[^>]*font-size:14px/);
  assert.ok(!html.includes('<td data-email-symbol="true"'));
  assert.equal(automaticEmailHtml(html, locale), html, "the common send pipeline can normalize twice without shrinking the icon");
});
