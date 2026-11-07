// Isolated browser acceptance tests for dashboard controls. All records are synthetic.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwind from "tailwindcss";
const require = createRequire(import.meta.url),
  id = "111111111111111111111111";
const artifacts = path.resolve(
  process.env.CONTENT_EDITOR_ARTIFACTS || ".artifacts/content-editor",
  "dashboard-control",
);
await mkdir(artifacts, { recursive: true });
const dictionaries = {
  en: require("../lib/dashboard/i18n/catalog/en.json"),
  tr: require("../lib/dashboard/i18n/catalog/tr.json"),
};
const text = (lang, key) =>
  lang === "ar" ? key : dictionaries[lang][key] || key;
const bundle = await build({
  stdin: {
    contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {setDashLocale} from './lib/dashboard/i18n';import SiteSecurityManager from './app/(dashboard)/dashboard/security/SiteSecurityManager';import {TeamPermissionPicker} from './components/dashboard/TeamPermissionPicker';import {GoogleSearchAccounts} from './components/dashboard/GoogleSearchAccounts';import {CategoryLinkedProjects} from './components/dashboard/CategoryLinkedProjects';import UsersManagement from './app/(dashboard)/dashboard/users/_components/UsersManagement';import {WhatsappInbox} from './app/(dashboard)/dashboard/communication/inbox/_components/WhatsappInbox';import TrackingPixels from './components/TrackingPixels';const q=new URLSearchParams(location.search),lang=q.get('lang')||'ar',surface=q.get('surface');setDashLocale(lang);document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';function Permissions(){const [v,set]=useState([]);return <main className="p-4"><TeamPermissionPicker value={v} onChange={set}/><output data-permissions>{JSON.stringify(v)}</output></main>}createRoot(document.getElementById('root')).render(surface==='security'?<SiteSecurityManager/>:surface==='permissions'?<Permissions/>:surface==='accounts'?<main className="p-4"><GoogleSearchAccounts initialOpen onChanged={()=>{}} canManage={q.get('role')!=='STAFF'} canTest/></main>:surface==='categories'?<CategoryLinkedProjects categoryId="${id}" admin onClose={()=>{}} onDeleted={()=>{}}/>:surface==='members'?<UsersManagement scope="team"/>:surface==='pixels'?<TrackingPixels><p>Tracking fixture</p></TrackingPixels>:<WhatsappInbox/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  tsconfig: path.resolve("tsconfig.json"),
  define: { "process.env.NODE_ENV": '"test"' },
  banner: { js: 'globalThis.process={env:{NODE_ENV:"test"}};' },
  plugins: [
    {
      name: "test-adapters",
      setup(builder) {
        const mocks = {
          "next/navigation": `export function useRouter(){return {push(){},refresh(){}}}export function useSearchParams(){return new URLSearchParams(location.search)}export function usePathname(){return location.pathname}`,
          "next/link": `import React from 'react';export default function Link(props){return <a {...props}/>}`,
          "next/image": `import React from 'react';export default function Image({fill,priority,quality,...props}){return <img {...props}/>}`,
          "next-auth/react": `export function useSession(){return {data:{user:{id:'operator',name:'Administrator',role:new URLSearchParams(location.search).get('role')||'ADMIN',dashboardPermissions:['team','donors','messages']}}}}`,
          "@/context/CurrencyContext": `export function useCurrency(){return {currency:'USD',convertToCurrency:v=>v}}`,
          "@/context/ViewUserProfileContext": `export function useViewUserProfile(){return {openUserProfileCard(){}}}`,
          "@/components/dashboard/SendTemplateDialog": `export function SendTemplateDialog(){return null}`,
          "@/components/dashboard/SmartWhatsappDialog": `export function SmartWhatsappDialog(){return null}`,
          "@/lib/tracking/marketing-gate": `export function whenMarketingAllowed(fn){fn();return ()=>{}}`,
          "@vercel/analytics": `export function track(){}`,
        };
        builder.onResolve({ filter: /.*/ }, (args) =>
          args.path in mocks
            ? { path: args.path, namespace: "test-adapter" }
            : null,
        );
        builder.onLoad({ filter: /.*/, namespace: "test-adapter" }, (args) => ({
          contents: mocks[args.path],
          loader: "tsx",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const css = (
  await postcss([
    tailwind({
      ...require("../tailwind.config.ts").default,
      content: [
        "app/(dashboard)/dashboard/**/*.tsx",
        "components/dashboard/**/*.tsx",
        "components/ui/*.tsx",
      ],
    }),
  ]).process("@tailwind base;@tailwind components;@tailwind utilities;", {
    from: undefined,
  })
).css;
const theme =
  (await readFile("app/[locale]/globals.css", "utf8")).match(
    /:root\s*\{[\s\S]*?\}/,
  )?.[0] || "";
const member = {
  id,
  name: "Fixture member",
  email: "member@example.test",
  role: "STAFF",
  dashboardPermissions: ["campaigns"],
  updatedAt: "2026-10-31T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00Z",
  badgeIds: [],
  countryCode: "TR",
  countryName: "Türkiye",
  phone: "+905551112233",
  totalDonationsCount: 0,
  totalDonatedAmount: 0,
  totalDonatedAmountUSD: 0,
  lastDonationAt: null,
  accountStatus: "MEMBER",
};
const sender = {
  id: "business",
  name: "Default sender",
  phone: "+905550000000",
};
const conversations = Array.from({ length: 127 }, (_, index) => ({
  id: "thread-" + index,
  phone: "+1555" + String(index).padStart(7, "0"),
  donor: null,
  unresolved: true,
  handled: false,
  lastMessageAt: "2026-10-31T10:00:00Z",
  lastInboundText: "Fixture message " + index,
  needsReply: true,
  unread: true,
  inboundCount: 1,
  outboundCount: 0,
  sender,
}));
let writes = [],
  accounts = [],
  rules = [],
  members = [member];
const account = (name, customerId, grant = false) => ({
  id: customerId.padStart(24, "0"),
  name,
  customerId,
  managerId: null,
  clientId: null,
  enabled: true,
  fundingType: grant ? "AD_GRANTS" : "PAID",
  revision: "a".repeat(64),
  status: "MISSING_CONFIG",
  lastTestAt: null,
  secrets: {},
  conversionId: "AW-" + customerId,
  conversionLabel: "fixture",
  trackingEnabled: true,
});
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://fixture"),
      json = (data, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
    if (url.pathname === "/bundle.js") {
      res.setHeader("Content-Type", "application/javascript");
      return res.end(bundle.outputFiles[0].contents);
    }
    if (url.pathname === "/style.css") {
      res.setHeader("Content-Type", "text/css");
      return res.end(
        css + theme + "body{margin:0;font-family:system-ui;background:#f8fafc}",
      );
    }
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const part of req) raw += part;
      const body = raw ? JSON.parse(raw) : {};
      if (req.method !== "GET")
        writes.push({ url: url.pathname, method: req.method, body });
      if (url.pathname === "/api/admin/site-security") {
        if (req.method === "POST")
          rules.push({
            id: "b".repeat(64),
            kind: body.kind,
            value: body.value,
            action: body.action,
            reason: body.reason,
            enabled: true,
            updatedAt: new Date().toISOString(),
          });
        if (req.method === "DELETE")
          rules = rules.map((row) => ({ ...row, enabled: false }));
        return json(
          req.method === "GET"
            ? {
                rows: [
                  {
                    id: "visit",
                    ip: "203.0.113.7",
                    country: "TR",
                    path: "/ar",
                    blocked: false,
                    visits: 2,
                    lastSeenAt: "2026-10-31T10:00:00Z",
                    donor: member,
                  },
                ],
                page: 1,
                total: 1,
                rules,
                retentionDays: 90,
              }
            : { ok: true },
        );
      }
      if (url.pathname === "/api/admin/google-search/accounts") {
        if (req.method === "POST" && body.action === "save") {
          const row = {
            ...account(
              body.name,
              body.customerId,
              body.fundingType === "AD_GRANTS",
            ),
            ...body,
            id: body.id || body.customerId.padStart(24, "0"),
          };
          accounts = [...accounts.filter((item) => item.id !== row.id), row];
          return json({ ok: true, id: row.id });
        }
        return json({ accounts });
      }
      if (url.pathname.includes("/api/admin/categories/"))
        return json({
          category: { id, name: "Archived category", editorVersion: "version" },
          projects: [
            {
              id: "222222222222222222222222",
              title: "Hidden project",
              isActive: false,
              isDeleted: false,
              categoryIds: [id],
            },
            {
              id: "333333333333333333333333",
              title: "Archived project",
              isActive: false,
              isDeleted: true,
              categoryIds: [id],
            },
          ],
          references: {
            donations: 0,
            subscriptions: 0,
            programmeReferences: 0,
          },
          canDetachAndDelete: true,
        });
      if (url.pathname === "/api/users")
        return json(
          url.searchParams.get("summary")
            ? { registeredDonorsTotal: 1 }
            : {
                users: members,
                pagination: { total: members.length, page: 1 },
              },
        );
      if (url.pathname === "/api/badges") return json({ badges: [] });
      if (url.pathname === "/api/users/" + id) {
        if (req.method === "DELETE") members = [];
        if (req.method === "PUT") {
          const current = members.find(item => item.id === id);
          if (body.updatedAt !== current.updatedAt) return json({error:"PROFILE_CONFLICT"},409);
          Object.assign(current,body,{updatedAt:new Date(new Date(current.updatedAt).getTime()+1).toISOString()});
          Object.assign(member,current);return json(current);
        }
        return json({ ok: true });
      }
      if (url.pathname === "/api/tracking/config")
        return json({
          googleAdsTargets: [
            { conversionId: "AW-123", conversionLabel: "paid" },
            { conversionId: "AW-456", conversionLabel: "grant" },
          ],
        });
      if (url.pathname.endsWith("/senders"))
        return json({ ok: true, senders: [sender] });
      if (url.pathname === "/api/dashboard/communication/inbox") {
        const offset = Number(url.searchParams.get("offset") || 0),
          limit = Number(url.searchParams.get("limit") || 50);
        return json({
          ok: true,
          total: conversations.length,
          conversations: conversations.slice(offset, offset + limit),
          needsReply: 127,
          senders: [sender],
        });
      }
      if (url.pathname.startsWith("/api/dashboard/communication/inbox/")) {
        if (req.method === "POST") return json({ ok: true });
        const row = conversations.find((item) =>
          url.pathname.endsWith("/" + item.id),
        );
        return json({
          ok: true,
          conversation: {
            ...row,
            timeline: [
              {
                id: "event:" + "a".repeat(24),
                kind: "inbound",
                text: "Fixture incoming message",
                at: "2026-10-31T10:00:00Z",
                status: null,
              },
            ],
            hasMore: false,
            oldestAt: null,
          },
          replyWindow: {
            open: true,
            remainingMs: 3600000,
            lastInboundAt: "2026-10-31T10:00:00Z",
          },
        });
      }
      return json({ error: "UNEXPECTED_FIXTURE_REQUEST" }, 404);
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  } catch (error) {
    res.statusCode = 500;
    res.end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
let browser,
  checks = 0;
const errors = [];
const noOverflow = async (page) => {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
    "document must fit viewport: " + page.url(),
  );
  checks++;
};
try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  for (const lang of (process.env.CONTROL_BROWSER_LOCALES || "ar,en,tr").split(","))
    for (const width of (process.env.CONTROL_BROWSER_WIDTHS || "390,1440").split(",").map(Number)) {
      const page = await browser.newPage({ viewport: { width, height: 930 } });
      page.on("pageerror", (error) => {
        errors.push(error.message);
        console.error(error.stack);
      });
      await page.route("https://**/*", (route) => route.abort());
      await page
        .context()
        .addCookies([{ name: "dash-locale", value: lang, url: origin }]);
      writes = [];
      rules = [];
      await page.goto(`${origin}/?surface=security&lang=${lang}`);
      await expect(
        page.getByText("203.0.113.7", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: text(lang, "إعداد حظر هذا العنوان"),
          exact: true,
        })
        .click();
      assert.equal(writes.length, 0);
      checks++;
      await page
        .getByLabel(text(lang, "سبب القاعدة"), { exact: true })
        .fill("Fixture protection");
      await page
        .getByRole("button", {
          name: text(lang, "حفظ قاعدة الوصول"),
          exact: true,
        })
        .click();
      await expect(page.getByRole("status")).toContainText(
        text(lang, "تم حفظ قاعدة الوصول"),
      );
      assert.equal(writes.length, 1);
      assert.equal(writes[0].body.value, "203.0.113.7");
      checks++;
      await noOverflow(page);
      await page.screenshot({
        path: path.join(artifacts, `security-${lang}-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await page.goto(`${origin}/?surface=permissions&lang=${lang}`);
      await page
        .getByRole("button", {
          name: text(lang, "التواصل وخدمة المتبرعين"),
          exact: true,
        })
        .click();
      await expect(page.locator("[data-permissions]")).toContainText(
        "messages",
      );
      await page
        .getByLabel(text(lang, "البحث في الصلاحيات"), { exact: true })
        .fill(text(lang, "المشاريع"));
      await noOverflow(page);
      await page.screenshot({
        path: path.join(artifacts, `permissions-${lang}-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
      checks++;
      accounts = [
        account("Paid account", "1234567890"),
        account("Grant account", "0987654321", true),
      ];
      writes = [];
      await page.goto(`${origin}/?surface=accounts&lang=${lang}`);
      await page
        .getByRole("button")
        .filter({ hasText: "Paid account" })
        .click();
      await expect(
        page.getByRole("checkbox", {
          name: text(lang, "تسجيل التبرعات المؤكدة كتحويلات في هذا الحساب"),
        }),
      ).toBeChecked();
      await page
        .getByLabel("Conversion Label", { exact: true })
        .fill("updated_label");
      await page
        .getByRole("button", { name: text(lang, "حفظ الحساب"), exact: true })
        .click();
      await expect(page.getByRole("status")).toBeVisible();
      assert.equal(writes[0].body.customerId, "1234567890");
      assert.equal(writes[0].body.conversionLabel, "updated_label");
      checks++;
      await noOverflow(page);
      await page.screenshot({
        path: path.join(artifacts, `accounts-${lang}-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await page.goto(`${origin}/?surface=categories&lang=${lang}`);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("Hidden project");
      await expect(dialog).toContainText("Archived project");
      await expect(
        dialog.getByRole("button", {
          name: text(lang, "فك الارتباط وحذف التصنيف"),
          exact: true,
        }),
      ).toBeDisabled();
      await noOverflow(page);
      checks++;
      await page.screenshot({
        path: path.join(artifacts, `category-links-${lang}-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
      members = [{ ...member, role: "STAFF" }];
      writes = [];
      await page.goto(`${origin}/?surface=members&lang=${lang}`);
      await page
        .getByRole("button", { name: text(lang, "الإجراءات"), exact: true })
        .click();
      await page
        .getByRole("menuitem", {
          name: text(lang, "تعديل بيانات العضو"),
          exact: true,
        })
        .click();
      await expect(
        page
          .getByRole("dialog")
          .getByLabel(text(lang, "البريد الإلكتروني"), { exact: true }),
      ).toHaveValue("member@example.test");
      await page
        .getByRole("dialog")
        .getByLabel(text(lang, "الاسم"), { exact: true })
        .fill("Updated fixture");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: text(lang, "حفظ"), exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      assert.equal(writes[0].body.name, "Updated fixture");
      checks++;
      for (const preset of ["التقارير المالية","التسويق والتحليلات"]) {
        await page.getByRole("button",{name:text(lang,"الإجراءات"),exact:true}).click();
        await page.getByRole("menuitem",{name:text(lang,"تعديل الصلاحيات"),exact:true}).click();
        await page.getByRole("dialog").getByRole("button",{name:text(lang,preset),exact:true}).click();
        await page.screenshot({path:path.join(artifacts,`role-editor-${lang}-${width}.png`),animations:"disabled"});
        await page.getByRole("dialog").getByRole("button",{name:text(lang,"حفظ"),exact:true}).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);checks++;
      }

      await page
        .getByRole("button", { name: text(lang, "الإجراءات"), exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: text(lang, "حذف العضو"), exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog")
          .getByRole("button", { name: text(lang, "حذف العضو"), exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: text(lang, "إلغاء"), exact: true })
        .click();
      assert.equal(writes.filter((item) => item.method === "DELETE").length, 0);
      checks++;
      await noOverflow(page);
      await page.goto(`${origin}/?surface=members&lang=${lang}&role=STAFF`);
      await page
        .getByRole("button", { name: text(lang, "الإجراءات"), exact: true })
        .click();
      await expect(
        page.getByRole("menuitem", {
          name: text(lang, "حذف العضو"),
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("menuitem", {
          name: text(lang, "تعديل بيانات العضو"),
          exact: true,
        }),
      ).toHaveCount(0);
      checks++;
      writes = [];
      await page.goto(`${origin}/?surface=inbox&lang=${lang}`);
      await expect(
        page
          .locator(
            'button[aria-label^="' +
              text(lang, "فتح محادثة: {0}").split("{0}")[0] +
              '"]',
          )
          .first(),
      ).toBeVisible();
      assert.equal(writes.length, 0);
      await page
        .getByRole("button", {
          name: text(lang, "عرض المزيد من المحادثات"),
          exact: true,
        })
        .click();
      await expect(
        page
          .locator(
            'button[aria-label^="' +
              text(lang, "فتح محادثة: {0}").split("{0}")[0] +
              '"]',
          )
          .nth(99),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: text(lang, "عرض المزيد من المحادثات"),
          exact: true,
        })
        .click();
      assert.equal(
        await page
          .locator(
            'button[aria-label^="' +
              text(lang, "فتح محادثة: {0}").split("{0}")[0] +
              '"]',
          )
          .count(),
        127,
      );
      checks++;
      await page
        .locator(
          'button[aria-label^="' +
            text(lang, "فتح محادثة: {0}").split("{0}")[0] +
            '"]',
        )
        .nth(126)
        .click();
      await expect(
        page.getByText("Fixture incoming message", { exact: true }),
      ).toBeVisible();
      await page.locator("textarea").fill("Unsent fixture reply");
      assert.ok(writes.every((item) => item.body.action === "read"));
      await noOverflow(page);
      await page.screenshot({
        path: path.join(artifacts, `inbox-${lang}-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
      checks++;
      await page.close();
    }
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  let tags = 0;
  await page.route("https://www.googletagmanager.com/**", (route) => {
    tags++;
    return route.fulfill({
      contentType: "application/javascript",
      body: "window.fixtureTagLoaded=true;",
    });
  });
  await page.goto(`${origin}/ar/success/fixture?surface=pixels`);
  await expect
    .poll(() => page.evaluate(() => typeof window.gtag))
    .toBe("function");
  const configured = await page.evaluate(() =>
    window.dataLayer
      .filter((args) => args[0] === "config")
      .map((args) => args[1]),
  );
  assert.deepEqual(configured, ["AW-123", "AW-456"]);
  assert.equal(tags, 1);
  checks++;
  await page.close();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      checks,
      locales: 3,
      widths: [390, 1440],
      errors,
      recipientMessages: 0,
      productionWrites: 0,
    }),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
