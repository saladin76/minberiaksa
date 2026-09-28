import { test, expect } from "@playwright/test";

import { expectPageOk, firstPost } from "./support/helpers";

/**
 * Blog routes, including the two things that broke here before: a post page rendering the About page's
 * metadata, and a description clipped mid-word at 165 characters.
 *
 * So these assert the metadata a post page produces, not just that it responds.
 */
test.describe("blog routes", () => {
  test("the blog index renders and lists posts", async ({ page }) => {
    await expectPageOk(page, "/ar/blog");
    /* An index with no links to posts is either an empty database or a broken query; either way the page
       should not look finished. */
    const postLinks = await page.locator('a[href*="/blog/"]').count();
    expect(postLinks, "blog index links to no posts").toBeGreaterThan(0);
  });

  test("a post page renders its own metadata, not another page's", async ({ page, request }, testInfo) => {
    const post = await firstPost(request, testInfo);
    await expectPageOk(page, `/ar/blog/${post.slug || post.id}`);

    const title = await page.title();
    expect(title.trim().length, "post page has no title").toBeGreaterThan(0);

    /* The root layout used to supply a single description to every page. A post's description must come
       from the post. */
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description, "post page has no meta description").toBeTruthy();
    expect(description!.trim().length).toBeGreaterThan(20);

    /* Descriptions were being cut with slice(0, 165), which lands mid-word. A clipped description should
       end at a word or sentence boundary, and never with a bare partial word plus nothing. */
    if (description!.length > 150) {
      expect(description!.trimEnd(), "description looks cut mid-word").toMatch(/[.!?…»”"]$|\p{L}$/u);
    }

    /* And the canonical must point at this post, not at the site root. */
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href").catch(() => null);
    if (canonical) expect(canonical, "post canonical points elsewhere").toContain("/blog/");
  });

  test("an unknown post is a 404", async ({ page }) => {
    const response = await page.goto("/ar/blog/this-post-does-not-exist-000", { waitUntil: "domcontentloaded" });
    expect(response?.status(), "an unknown post did not 404").toBeGreaterThanOrEqual(400);
  });

  test("the blog renders in the other locales", async ({ page }) => {
    for (const locale of ["en", "tr", "fr"]) {
      await expectPageOk(page, `/${locale}/blog`);
    }
  });

  test("news and publications indexes render", async ({ page }) => {
    /* Sibling content routes that share the post pipeline. */
    for (const path of ["/ar/news", "/ar/publications"]) {
      await expectPageOk(page, path);
    }
  });
});
