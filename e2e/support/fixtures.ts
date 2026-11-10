import { test as base, expect } from "@playwright/test";

/**
 * Full staging E2E: fail closed on external browser traffic and unexpected
 * mutations. Login uses a test-only account on the reviewed staging database.
 * Sandbox payment scenarios need separate, explicitly reviewed fixtures.
 */
export const test = base.extend({
  request: async ({ request }, use) => {
    // The APIRequestContext fixture bypasses page.route. Deny mutating API
    // calls here too, so future tests cannot silently bypass browser guards.
    const stagingOrigin = new URL(process.env.E2E_BASE_URL ?? "").origin;
    const sameOrigin = (url: string) => new URL(url, stagingOrigin).origin === stagingOrigin;
    const safe = new Proxy(request, {
      get(target, key) {
        if (["post", "put", "patch", "delete"].includes(String(key))) {
          return async () => { throw new Error("E2E_MUTATING_REQUEST_DENIED"); };
        }
        if (key === "get" || key === "head") {
          return async (url: string, options?: { headers?: Record<string, string> }) => {
            if (!sameOrigin(url)) throw new Error("E2E_EXTERNAL_API_REQUEST_DENIED");
            return key === "get" ? target.get(url, options) : target.head(url, options);
          };
        }
        if (key === "fetch") {
          return async (url: string, options?: { method?: string }) => {
            if (!sameOrigin(url)) throw new Error("E2E_EXTERNAL_API_REQUEST_DENIED");
            if (!["GET", "HEAD", "OPTIONS"].includes((options?.method ?? "GET").toUpperCase())) {
              throw new Error("E2E_MUTATING_REQUEST_DENIED");
            }
            return target.fetch(url, options);
          };
        }
        const item = Reflect.get(target, key, target);
        return typeof item === "function" ? item.bind(target) : item;
      },
    });
    await use(safe);
  },
  page: async ({ page, context }, use) => {
    const baseUrl = new URL(process.env.E2E_BASE_URL ?? "");
    await context.route("**/*", async route => {
      const request = route.request();
      let target: URL;
      try { target = new URL(request.url()); } catch { await route.abort("blockedbyclient"); return; }
      if (target.origin !== baseUrl.origin) {
        await route.abort("blockedbyclient");
        return;
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        // Credentials sign-in against staging synthetic staff is the only
        // mutation permitted by the generic public/permissions suite.
        const login = request.method() === "POST" && /^\/api\/auth\/callback\/credentials\/?$/.test(target.pathname);
        if (!login) {
          await route.abort("blockedbyclient");
          return;
        }
      }
      await route.continue();
    });
    await use(page);
  },
});
export { expect };
