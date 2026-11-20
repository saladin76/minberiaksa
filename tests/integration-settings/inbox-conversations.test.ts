import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { classifyInboxLanguage, languageFromLocale, languageFromPhone, languageFromText } from "../../lib/communication/inbox-language";

test("four tabs: Arabic, Turkish, French, English — every other language is English", () => {
  for (const [l, want] of [["ar", "ar"], ["tr", "tr"], ["fr", "fr"], ["en", "en"], ["de", "en"], ["id", "en"], ["ur", "en"]] as const) assert.equal(languageFromLocale(l), want);
  assert.equal(languageFromLocale(""), null);
});

test("the message text decides when it is clear", () => {
  assert.equal(languageFromText("السلام عليكم، كيف أتبرع؟"), "ar");
  assert.equal(languageFromText("Merhaba, bağış yapmak istiyorum"), "tr");
  assert.equal(languageFromText("Bonjour, je voudrais faire un don"), "fr");
  assert.equal(languageFromText("Hello, how can I donate?"), "en");
  assert.equal(languageFromText("👍"), null, "ambiguous text decides nothing");
});

test("the phone's country decides last", () => {
  assert.equal(languageFromPhone("+905551234567"), "tr");
  assert.equal(languageFromPhone("+966501234567"), "ar");
  assert.equal(languageFromPhone("+212612345678"), "ar", "Morocco is read as +212, not +2…");
  assert.equal(languageFromPhone("+221771234567"), "fr");
  assert.equal(languageFromPhone("+447700900123"), null);
});

test("order: the site profile, then the text, then the phone, then English", () => {
  assert.deepEqual(classifyInboxLanguage({ profileLocale: "fr", text: "مرحبا", phone: "+905551234567" }), { language: "fr", source: "profile" });
  assert.deepEqual(classifyInboxLanguage({ text: "مرحبا", phone: "+33612345678" }), { language: "ar", source: "text" }, "a Moroccan in France writing Arabic goes to Arabic");
  assert.deepEqual(classifyInboxLanguage({ text: "ok", phone: "+905551234567" }), { language: "tr", source: "phone" });
  assert.deepEqual(classifyInboxLanguage({ text: "ok", phone: "+491701234567" }), { language: "en", source: "default" });
});

type Doc = Record<string, unknown>;
type Store = {
  touchInbound: (i: { senderId: string | null; phone: string; text: string | null; profileName?: string | null; at: Date }) => Promise<void>;
  touchOutbound: (i: { senderId: string | null; phone: string; text: string | null; at: Date }) => Promise<void>;
  listInboxConversations: (f: Record<string, unknown>) => Promise<Array<{ id: string; language: string; unreadCount: number; lastPreview: string; lastDirection: string; assigneeId: string | null }>>;
  inboxCounts: (u: string | null) => Promise<Record<string, number>>;
  updateInboxConversation: (id: string, p: Record<string, unknown>) => Promise<void>;
};
const SID = "aaaaaaaaaaaaaaaaaaaaaaaa", OTHER = "bbbbbbbbbbbbbbbbbbbbbbbb";
function loadStore(db: Record<string, Doc[]>): Store {
  const js = (f: string) => ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const lang: { exports: Record<string, unknown> } = { exports: {} };
  vm.runInNewContext(js("lib/communication/inbox-language.ts"), { module: lang, exports: lang.exports, String });
  const col = (n: string) => (db[n] ??= []);
  const match = (d: Doc, q: Doc): boolean => Object.entries(q).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) { const o = v as Doc; if ("$gt" in o) return (d[k] as number) > (o.$gt as number); if ("$lt" in o) return (d[k] as Date) < (o.$lt as Date); if ("$regex" in o) return new RegExp(String(o.$regex), String(o.$options ?? "")).test(String(d[k] ?? "")); }
    return d[k] === v; });
  const prisma = {
    $runCommandRaw: async (input: Doc): Promise<Doc> => {
      // Like real MongoDB, read extended-JSON dates ({ $date }) as dates.
      const reviveDates = (v: unknown): unknown => v instanceof Date ? v
        : Array.isArray(v) ? v.map(reviveDates)
        : v && typeof v === "object" ? (Object.keys(v).length === 1 && typeof (v as { $date?: unknown }).$date === "string" ? new Date((v as { $date: string }).$date) : Object.fromEntries(Object.entries(v).map(([k, y]) => [k, reviveDates(y)])))
        : v;
      const c = reviveDates(input) as Doc;
      if (typeof c.find === "string") { const f = { ...(c.filter as Doc) }; const or = f.$or as Doc[] | undefined; delete f.$or;
        const r = col(c.find).filter((d) => match(d, f) && (!or || or.some((o) => match(d, o)))).sort((a, b) => +(b.lastMessageAt as Date) - +(a.lastMessageAt as Date)); return { cursor: { firstBatch: r } }; }
      if (typeof c.update === "string") { for (const u of c.updates as Array<{ q: Doc; upsert?: boolean; u: { $set?: Doc; $setOnInsert?: Doc; $inc?: Doc } }>) {
        let d = col(c.update).find((x) => match(x, u.q)); if (!d) { if (!u.upsert) continue; d = { ...u.q, ...(u.u.$setOnInsert ?? {}) }; col(c.update).push(d); }
        Object.assign(d, u.u.$set ?? {}); for (const [k, v] of Object.entries(u.u.$inc ?? {})) d[k] = ((d[k] as number) ?? 0) + (v as number); } return { ok: 1 }; }
      if (typeof c.aggregate === "string") { const m = (c.pipeline as Doc[])[0].$match as Doc; const g = new Map<string, { n: number; mine: number }>();
        for (const d of col(c.aggregate).filter((x) => match(x, m))) { const e = g.get(String(d.language)) ?? { n: 0, mine: 0 }; e.n++; if (d.assigneeId === "me") e.mine++; g.set(String(d.language), e); }
        return { cursor: { firstBatch: [...g].map(([k, v]) => ({ _id: k, ...v })) } }; }
      throw new Error("unsupported");
    },
    communicationSender: { findFirst: async () => ({ id: SID }) },
    donorCommunicationProfile: { findFirst: async (a: { where: { phone: { in: string[] } } }) => (a.where.phone.in.includes("+33612345678") ? { preferredLocale: "fr", userId: "u1" } : null) },
    user: { findUnique: async () => ({ name: "Amina" }) },
  };
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  vm.runInNewContext(js("lib/communication/inbox-conversations.ts"), { module: mod, exports: mod.exports, Date, Math, Number, String, Object, Promise, RegExp, Map, Array, JSON,
    require: (n: string) => (n === "server-only" ? {} : n === "../prisma" ? { prisma } : n === "./inbox-language" ? lang.exports : (() => { throw new Error("unexpected " + n); })()) });
  return mod.exports as unknown as Store;
}

test("a message creates the conversation in its tab; more messages stack unread; a reply clears it", async () => {
  const db: Record<string, Doc[]> = {}, s = loadStore(db);
  await s.touchInbound({ senderId: SID, phone: "+905551234567", text: "Merhaba", at: new Date("2026-11-18T08:00:00Z") });
  await s.touchInbound({ senderId: SID, phone: "+905551234567", text: "bağış?", at: new Date("2026-11-18T08:01:00Z") });
  await s.touchInbound({ senderId: SID, phone: "+33612345678", text: "مرحبا", at: new Date("2026-11-18T08:02:00Z") });
  await s.touchInbound({ senderId: OTHER, phone: "+966501234567", text: "x", at: new Date() });
  const all = await s.listInboxConversations({});
  assert.equal(all.length, 2, "only the site's own number");
  assert.equal(all[0].language, "fr", "the donor's site language wins (profile)");
  assert.equal(all[1].language, "tr"); assert.equal(all[1].unreadCount, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(await s.inboxCounts(null))), { ar: 0, tr: 1, fr: 1, en: 0, all: 2, mine: 0 });
  await s.touchOutbound({ senderId: SID, phone: "+905551234567", text: "Teşekkürler", at: new Date("2026-11-18T08:05:00Z") });
  const tr = (await s.listInboxConversations({ language: "tr" }))[0];
  assert.equal(tr.unreadCount, 0); assert.equal(tr.lastDirection, "out"); assert.equal(tr.lastPreview, "Teşekkürler");
});

test("assign, move between tabs, mark read and done; bad input is refused", async () => {
  const db: Record<string, Doc[]> = {}, s = loadStore(db);
  await s.touchInbound({ senderId: SID, phone: "+905551234567", text: "Merhaba", at: new Date() });
  const id = `${SID}:+905551234567`;
  await s.updateInboxConversation(id, { assigneeId: "me", assigneeName: "Leyla" });
  assert.equal((await s.listInboxConversations({ view: "mine", userId: "me" })).length, 1);
  await s.updateInboxConversation(id, { language: "ar" });
  assert.equal((await s.listInboxConversations({ language: "ar" })).length, 1);
  await s.updateInboxConversation(id, { read: true });
  assert.equal((await s.listInboxConversations({ view: "unread" })).length, 0);
  await s.updateInboxConversation(id, { status: "DONE" });
  assert.equal((await s.listInboxConversations({})).length, 0); assert.equal((await s.listInboxConversations({ view: "done" })).length, 1);
  await assert.rejects(s.updateInboxConversation(id, { language: "de" }), /INVALID_LANGUAGE/);
  await assert.rejects(s.updateInboxConversation("nope", {}), /INVALID_ID/);
});

test("wiring: fail-safe hooks on receive and reply; the API uses the inbox permission", () => {
  const w = fs.readFileSync("lib/communication/webhook-service.ts", "utf8");
  assert.match(w, /void import\("\.\/inbox-conversations"\)\s*\n\s*\.then\(\(m\) => m\.touchInbound\([\s\S]*?\.catch\(\(\) => undefined\);/);
  assert.match(fs.readFileSync("lib/communication/conversation-reply-service.ts", "utf8"), /m\.touchOutbound\([\s\S]*?\.catch\(\(\) => undefined\);\s*\n\s*return \{ ok: true, deliveryId/);
  const api = fs.readFileSync("app/api/dashboard/communication/inbox/conversations/route.ts", "utf8");
  assert.equal((api.match(/requireAdminOrDashboardPermission\(session, "messages"\)/g) ?? []).length, 2);
});
