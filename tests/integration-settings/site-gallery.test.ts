import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { galleryCaption, galleryEmailHtml, galleryHiddenOn, galleryTexts, galleryVariant, isGalleryImageUrl } from "../../lib/site-gallery/shared";

const URL = "https://res.cloudinary.com/idhqsozi/image/upload/v1731900000/minber/field/a1.jpg";

test("only our Cloudinary uploads are accepted", () => {
  assert.equal(isGalleryImageUrl(URL), true);
  for (const bad of ["http://res.cloudinary.com/x/image/upload/a.jpg", "https://evil.example/a.jpg", "https://res.cloudinary.com/x/video/upload/a.mp4", `${URL}" onerror="x`, 42])
    assert.equal(isGalleryImageUrl(bad), false, String(bad));
});

test("sized variants: site thumbnail, full view, and a plain 600 px JPEG for e-mails", () => {
  assert.match(galleryVariant(URL, "thumb"), /\/image\/upload\/c_fill,g_auto,w_640,h_480,q_auto,f_auto\/v1731900000\//);
  assert.match(galleryVariant(URL, "email"), /\/image\/upload\/c_limit,w_600,q_auto:good,f_jpg\/v1731900000\//);
  const already = URL.replace("/upload/", "/upload/c_scale,w_100/");
  assert.equal((galleryVariant(already, "full").match(/\/upload\//g) ?? []).length, 1, "an existing transformation is replaced, not stacked");
  const html = galleryEmailHtml(URL, 'a "quoted" <b>caption</b>');
  assert.match(html, /^<img src="https:\/\/res\.cloudinary\.com\/.*f_jpg.*" width="600" alt="a quoted bcaption\/b" style="/);
});

test("titles in four languages, English for the rest; captions fall back sensibly", () => {
  assert.equal(galleryTexts("ar").title, "لقطات من الميدان");
  assert.equal(galleryTexts("tr").title, "Sahadan Kareler");
  assert.equal(galleryTexts("de").title, galleryTexts("en").title);
  assert.equal(galleryCaption({ ar: "غزة", en: "Gaza" }, "fr"), "Gaza");
  assert.equal(galleryCaption({ ar: "غزة" }, "tr"), "غزة");
});

test("hidden while a donor pays, shown everywhere else", () => {
  for (const p of ["/ar/checkout", "/tr/cart", "/en/success/6af674e2d1cd34cbb9de7d1a", "/ar/payment-pending/x", "/ar/auth/signin"]) assert.equal(galleryHiddenOn(p), true, p);
  for (const p of ["/ar", "/ar/bagislar/gaza-bread", "/tr/bagislar", "/ar/blog", "/en/about-us"]) assert.equal(galleryHiddenOn(p), false, p);
});

type Doc = Record<string, unknown>;
type Store = {
  addGalleryImage: (i: { url: unknown; visible: unknown; captions?: unknown; by: string }) => Promise<{ id: string; visible: boolean }>;
  updateGalleryImage: (id: string, p: { visible?: unknown; captions?: unknown }) => Promise<void>;
  reorderGallery: (ids: unknown) => Promise<void>;
  deleteGalleryImage: (id: string) => Promise<void>;
  listGallery: () => Promise<Array<{ id: string; visible: boolean; captions: Record<string, string> }>>;
  publicGallery: () => Promise<Array<{ id: string }>>;
};
function loadStore(db: { reads: number; docs: Doc[] }): Store {
  const out = ts.transpileModule(fs.readFileSync("lib/site-gallery/store.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const shared = fs.readFileSync("lib/site-gallery/shared.ts", "utf8");
  const sharedJs = ts.transpileModule(shared, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sharedMod: { exports: Record<string, unknown> } = { exports: {} };
  vm.runInNewContext(sharedJs, { module: sharedMod, exports: sharedMod.exports });
  const matches = (d: Doc, q: Doc) => Object.entries(q).every(([k, v]) => d[k] === v);
  const sortDocs = (list: Doc[], sort?: Doc) => {
    if (!sort) return list;
    return [...list].sort((a, b) => {
      for (const [k, dir] of Object.entries(sort)) { const x = a[k] as number | string, y = b[k] as number | string; if (x !== y) return (x < y ? -1 : 1) * (dir as number); }
      return 0;
    });
  };
  const prisma = {
    $runCommandRaw: async (c: Doc): Promise<Doc> => {
      if (typeof c.find === "string") { db.reads++; const found = sortDocs(db.docs.filter((d) => matches(d, c.filter as Doc)), c.sort as Doc); return { cursor: { firstBatch: found.slice(0, (c.limit as number) ?? 1e9) } }; }
      if (typeof c.insert === "string") { db.docs.push(...(c.documents as Doc[])); return { ok: 1 }; }
      if (typeof c.update === "string") { for (const u of c.updates as Array<{ q: Doc; u: { $set: Doc } }>) { const d = db.docs.find((x) => matches(x, u.q)); if (d) Object.assign(d, u.u.$set); } return { ok: 1 }; }
      if (typeof c.delete === "string") { for (const q of c.deletes as Array<{ q: Doc }>) db.docs = db.docs.filter((d) => !matches(d, q.q)); return { ok: 1 }; }
      throw new Error("unsupported");
    },
  };
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports, Date, JSON, Math, Promise, String, Array, Number, Object,
    require: (n: string) => (n === "server-only" ? {} : n === "../prisma" ? { prisma } : n === "./shared" ? sharedMod.exports : n === "node:crypto" ? { randomBytes: (k: number) => ({ toString: () => Array.from({ length: k * 2 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("") }) } : (() => { throw new Error("unexpected " + n); })()) });
  return mod.exports as unknown as Store;
}

test("new images go first; only visible ones reach the site; edits are seen at once", async () => {
  const db = { reads: 0, docs: [] as Doc[] }, s = loadStore(db);
  const a = await s.addGalleryImage({ url: URL, visible: true, by: "admin" });
  const b = await s.addGalleryImage({ url: URL.replace("a1", "b2"), visible: false, captions: { ar: "  للبريد  ", xx: "dropped" }, by: "admin" });
  const all = await s.listGallery();
  assert.deepEqual(all.map((i) => i.id), [b.id, a.id], "newest first");
  assert.deepEqual(JSON.parse(JSON.stringify(all[0].captions)), { ar: "للبريد" }, "captions trimmed, unknown languages dropped");
  assert.deepEqual((await s.publicGallery()).map((i) => i.id), [a.id], "hidden images never reach the site");
  const reads = db.reads; await s.publicGallery(); assert.equal(db.reads, reads, "public list is cached");
  await s.updateGalleryImage(b.id, { visible: true });
  assert.equal((await s.publicGallery()).length, 2, "the cache is cleared on every edit");
  await s.reorderGallery([a.id, b.id]);
  assert.deepEqual((await s.listGallery()).map((i) => i.id), [a.id, b.id]);
  await s.deleteGalleryImage(a.id);
  assert.deepEqual((await s.publicGallery()).map((i) => i.id), [b.id]);
  await assert.rejects(s.addGalleryImage({ url: "https://evil.example/x.jpg", visible: true, by: "a" }), /INVALID_URL/);
  await assert.rejects(s.reorderGallery(["nope"]), /INVALID_ID/);
});

test("the site shows at most 12 images", async () => {
  const s = loadStore({ reads: 0, docs: [] });
  for (let i = 0; i < 15; i++) await s.addGalleryImage({ url: URL.replace("a1", `n${i}`), visible: true, by: "a" });
  assert.equal((await s.publicGallery()).length, 12);
});

test("wiring: admin-only management, public read-only list, gallery above the footer, translated manager", () => {
  const admin = fs.readFileSync("app/api/admin/site-gallery/route.ts", "utf8");
  assert.equal((admin.match(/const \{[^}]*denied[^}]*\} = await admin\(\);\s*\n\s*if \(denied\) return denied;/g) ?? []).length, 4, "GET, POST, PATCH, DELETE are admin-only");
  assert.doesNotMatch(fs.readFileSync("app/api/site-gallery/route.ts", "utf8"), /export async function (POST|PATCH|DELETE)/);
  const layout = fs.readFileSync("app/[locale]/layout.tsx", "utf8");
  assert.match(layout, /<main><DonationPauseBanner locale=\{locale\} \/>\{children\}<\/main>\n\s*<FieldGallery locale=\{locale\} \/>/);
  assert.match(fs.readFileSync("app/(dashboard)/dashboard/gallery/page.tsx", "utf8"), /role !== "ADMIN"\) redirect/);
  const ui = fs.readFileSync("app/(dashboard)/dashboard/gallery/GalleryManager.tsx", "utf8");
  for (const lang of ["en", "tr"]) {
    const cat = JSON.parse(fs.readFileSync(`lib/dashboard/i18n/catalog/${lang}.json`, "utf8")) as Record<string, string>;
    for (const m of ui.matchAll(/dt\("([^"]+)"/g)) assert.ok(cat[m[1]], `${lang}: ${m[1]}`);
  }
});
