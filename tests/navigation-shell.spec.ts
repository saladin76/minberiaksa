import { expect, test } from "@playwright/test";

const viewports = [
  { width: 1440, height: 1000 },
  { width: 1180, height: 900 },
  { width: 1024, height: 900 },
  { width: 768, height: 900 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

const primaryLinks = [
  "المشاريع",
  "الزكاة",
  "الأوقاف",
  "العطاء المستمر",
  "الأثر والإنجازات",
  "المعرفة",
  "من نحن",
];

const footerColumns = ["التبرع", "الثقة", "المؤسسة", "القانوني"];

async function openMobileMenu(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  await expect(page.getByRole("dialog", { name: "القائمة الرئيسية" })).toBeVisible();
}

test.describe("Navigation shell visual and UX safeguards", () => {
  test("has no horizontal overflow across desktop, tablet, and mobile", async ({ page }) => {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto("/", { waitUntil: "networkidle" });
      const sizes = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect.soft(sizes.document, `${viewport.width}px document`).toBeLessThanOrEqual(sizes.viewport + 1);
      expect.soft(sizes.body, `${viewport.width}px body`).toBeLessThanOrEqual(sizes.viewport + 1);
    }
  });

  test("desktop header keeps every primary link and one donation CTA", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/projects", { waitUntil: "networkidle" });

    const navigation = page.getByRole("navigation", { name: "التنقل الرئيسي" });
    await expect(navigation).toBeVisible();
    for (const label of primaryLinks) {
      await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await expect(navigation.getByRole("link", { name: "المشاريع", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".desktop-header-actions").getByRole("link", { name: "تبرع الآن" })).toHaveCount(1);
  });

  test("utility bar is quiet on desktop, retained on tablet, and moved into mobile menu", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".top-utility-bar")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "المشاركة مع المؤسسة" }).getByRole("link")).toHaveCount(3);

    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(page.locator(".top-utility-bar")).toBeVisible();
    await expect(page.getByRole("button", { name: "فتح القائمة" })).toBeVisible();

    await page.setViewportSize({ width: 768, height: 900 });
    await expect(page.locator(".top-utility-bar")).toBeHidden();
    await openMobileMenu(page);
    await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible();
    await expect(page.getByRole("link", { name: "حساب المتبرع" })).toBeVisible();
  });

  test("mobile menu is grouped and never overlaps the basket", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await openMobileMenu(page);

    for (const heading of ["العطاء", "الثقة والمعرفة", "المؤسسة", "الإعدادات"]) {
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("dialog", { name: "القائمة الرئيسية" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "سلة العطاء" })).toHaveCount(0);

    await page.locator(".mobile-nav-header").getByRole("button", { name: "إغلاق القائمة" }).click();
    await page.locator(".mobile-header-actions").getByRole("button", { name: /سلة العطاء/ }).click();
    await expect(page.getByRole("dialog", { name: "سلة العطاء" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "القائمة الرئيسية" })).toHaveCount(0);

    await page.getByRole("button", { name: "إغلاق السلة" }).click();
    await openMobileMenu(page);
    await expect(page.getByRole("dialog", { name: "سلة العطاء" })).toHaveCount(0);
  });

  test("all 13 languages and 14 currencies remain searchable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await openMobileMenu(page);

    await page.getByRole("button", { name: /اختيار اللغة/ }).click();
    const languageDialog = page.getByRole("dialog", { name: "اختر اللغة" });
    await expect(languageDialog).toBeVisible();
    await expect(languageDialog.getByRole("option")).toHaveCount(13);
    await languageDialog.getByLabel("ابحث باسم اللغة").fill("اردو");
    await expect(languageDialog.getByRole("option", { name: /اردو/ })).toBeVisible();
    await languageDialog.getByRole("button", { name: "إغلاق" }).click();

    await page.getByRole("button", { name: /اختيار العملة/ }).click();
    const currencyDialog = page.getByRole("dialog", { name: "اختر عملة العرض" });
    await expect(currencyDialog).toBeVisible();
    await expect(currencyDialog.getByRole("option")).toHaveCount(14);
    await currencyDialog.getByLabel("ابحث بالرمز أو اسم العملة").fill("MAD");
    await expect(currencyDialog.getByRole("option", { name: /MAD/ })).toBeVisible();
  });

  test("footer keeps four columns and readable official contact data", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/", { waitUntil: "networkidle" });
    const footer = page.locator("footer");
    await footer.scrollIntoViewIfNeeded();
    for (const heading of footerColumns) {
      await expect(footer.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await expect(footer.getByText("info@minberiaksa.org", { exact: true })).toBeVisible();
    for (const phone of ["+90 539 843 60 50", "+90 537 368 64 62", "+90 533 487 41 96"]) {
      await expect(footer.getByText(phone, { exact: true })).toBeVisible();
    }
    await expect(footer.getByText(/Haseki Sultan Mah\. Turgut Özal Millet Cad\./)).toBeVisible();
  });

  test("sticky donation CTA is contextual and avoids overlays and footer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    const sticky = page.locator(".sticky-donate-bar");
    await expect(sticky).not.toHaveClass(/is-visible/);

    await page.evaluate(() => window.scrollTo(0, 1100));
    await page.waitForTimeout(250);
    await expect(sticky).toHaveClass(/is-visible/);

    await openMobileMenu(page);
    await expect(sticky).toBeHidden();
    await page.locator(".mobile-nav-header").getByRole("button", { name: "إغلاق القائمة" }).click();

    await page.locator("footer").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await expect(sticky).not.toHaveClass(/is-visible/);

    await page.goto("/projects", { waitUntil: "networkidle" });
    await expect(page.locator(".sticky-donate-bar")).toHaveCount(0);
  });
});
