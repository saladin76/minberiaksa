import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p: string) => fs.readFileSync(p, "utf8");
test("Clarity 7 days: donate buttons in the first screen, a fixed pay bar in the cart, a quiet checkout, a readable certificate", () => {
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /\.mia-scope \.mia-hero-actions--mobile \{ order: 2; margin-top: 0; \}/);
  assert.match(css, /\.mia-scope \.mia-hero-media \{ order: 3; \}/);
  assert.match(css, /\.cart-sticky-pay \{ display: flex; position: fixed;/);
  assert.match(css, /html\[data-mia-finishing="1"\] \.mia-mobile-bottom-nav/);
  assert.match(read("components/minbar/cart/CartPage.tsx"), /<div className="cart-sticky-pay">[\s\S]*\{totalLabel\}/);
  assert.match(read("components/minbar/shell/MobileBottomNav.tsx"), /\["cart", "checkout"\]\.includes\(finishingRoute\)/);
  const w = read("components/minbar/waqf/WaqfCertificatePreview.tsx");
  assert.match(w, /onClick=\{overlay \? undefined : \(\) => setZoomed\(true\)\}/);
  assert.match(w, /<WaqfCertificatePreview unit=\{unit\} count=\{count\} total=\{total\} name=\{name\} onBehalf=\{onBehalf\} open overlay \/>/);
});
