import test from "node:test";
import assert from "node:assert/strict";
import { donorLoginEmail } from "../../lib/auth/donor-login-email";

test("Arabic sign-in email contains the brand, a readable code and expiry", () => {
  const email = donorLoginEmail("123456", "ar");
  assert.ok(email.html.includes('dir="rtl"'));
  assert.ok(email.html.includes("/minbar/assets/logo-horizontal.png"));
  assert.ok(email.html.includes("123456"));
  assert.ok(email.html.includes("10"));
  assert.ok(email.text.includes("123456"));
  assert.ok(!email.html.includes("فتح صفحة الدخول وتفعيل الحساب"));
});
test("English email and code validation work independently of providers", () => {
  assert.ok(donorLoginEmail("654321", "en").html.includes('dir="ltr"'));
  for (const code of ["12345", "1234567", "<script>", "abcdef"]) {
    assert.throws(() => donorLoginEmail(code, "ar"), /INVALID_CODE/);
  }
});
test("only same-origin invitation links are rendered and query strings are escaped", () => {
  const previous = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = "https://minberiaksa.org";
  try {
    const email = donorLoginEmail("123456", "ar", "https://minberiaksa.org/ar/login?ticket=abc&invite=1");
    assert.ok(email.html.includes("ticket=abc&amp;invite=1"));
    for (const url of ["https://foreign.invalid/login", "javascript:alert(1)"]) {
      assert.ok(!donorLoginEmail("123456", "ar", url).html.includes("فتح صفحة الدخول وتفعيل الحساب"));
    }
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = previous;
  }
});
