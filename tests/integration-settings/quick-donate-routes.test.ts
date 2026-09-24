import test from "node:test";
import assert from "node:assert/strict";
import { QUICK_DONATE_ROUTES, routeForPathname, slugFor } from "../../lib/minbar/routes";

/**
 * `DEPLOYED_VS_DESIGN_AUDIT.md` § P2.1 — the floating quick-donation pill is
 * mounted from a central allowlist, and the pathname → page mapping it depends
 * on has to be right for every shape of URL the site serves.
 */

test("pathnames resolve to their page, including locale slugs and list/detail pairs", () => {
  assert.equal(routeForPathname("/ar"), "home");
  assert.equal(routeForPathname("/en/"), "home");
  assert.equal(routeForPathname("/en/projects"), "projects");
  assert.equal(routeForPathname("/en/projects/some-slug"), "projectDetail");
  assert.equal(routeForPathname("/en/blog"), "blog");
  assert.equal(routeForPathname("/en/blog/257-rural-road-repair-recovery"), "article");
  assert.equal(routeForPathname("/en/achievements-and-reports"), "reports");
  assert.equal(routeForPathname("/en/achievements-and-reports/2025"), "reportDetail");
  assert.equal(routeForPathname("/tr/al-aqsa-mosque"), "aqsa");
  assert.equal(routeForPathname("/en/courses/nur-ad-din-zengi"), "zenkiCourse", "the longer slug wins over `courses`");
  assert.equal(routeForPathname("/en/success/000000000000000000000000"), "donationSuccess");
  // A locale's own slug for a page resolves to the same page.
  const arZakat = slugFor("zakat", "ar");
  assert.equal(routeForPathname(`/ar/${arZakat}`), "zakat");
});

test("paths outside the page map resolve to null", () => {
  assert.equal(routeForPathname("/dashboard/monthly"), null);
  assert.equal(routeForPathname("/api/donations/x"), null);
  assert.equal(routeForPathname("/en/no-such-page"), null);
  assert.equal(routeForPathname(""), null);
});

test("the pill is absent from the home, the donation modules, the blog and every transactional surface", () => {
  for (const route of ["home", "projects", "projectDetail", "zakat", "zakatCalculator", "waqf", "recurring", "blog", "article", "cart", "checkout", "donationSuccess", "paymentPending", "receipt", "thanksCertificate", "waqfCertificate", "account", "maintenance"] as const) {
    assert.equal(QUICK_DONATE_ROUTES.has(route), false, `${route} must not carry the quick-donate pill`);
  }
});

test("the pill is present on the reading pages", () => {
  for (const route of ["aqsa", "jerusalem", "reports", "news", "programs", "about", "contact"] as const) {
    assert.equal(QUICK_DONATE_ROUTES.has(route), true, `${route} should carry the quick-donate pill`);
  }
});
