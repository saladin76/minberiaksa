import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

type Node = { type: unknown; props: Record<string, unknown> };
const flatten = (value: unknown): Node[] => Array.isArray(value) ? value.flatMap(flatten) : value && typeof value === "object" && "props" in value ? [value as Node, ...flatten((value as Node).props.children)] : [];
async function harness() {
  const timers: { fn: () => void; period: number }[] = [];
  const hooks: unknown[] = [], effects: Array<() => void> = [], calls: { url: string; method: string; body?: string }[] = [];
  let cursor = 0, dirty = true, nodes: Node[] = [];
  const same = (a: unknown[], b?: unknown[]) => b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (fn: () => unknown, deps: unknown[]) => { const index = cursor++, old = hooks[index] as { value: unknown; deps: unknown[] } | undefined; if (!old || !same(deps, old.deps)) hooks[index] = { value: fn(), deps }; return (hooks[index] as { value: unknown }).value; };
  const react = {
    useState(initial: unknown) { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial; return [hooks[index], (next: unknown) => { const value = typeof next === "function" ? next(hooks[index]) : next; if (!Object.is(value, hooks[index])) { hooks[index] = value; dirty = true; } }]; },
    useRef(initial: unknown) { const index = cursor++; return hooks[index] ??= { current: initial }; },
    useMemo: memo, useCallback: (fn: unknown, deps: unknown[]) => memo(() => fn, deps),
    useEffect(fn: () => void | (() => void), deps: unknown[]) { const index = cursor++, old = hooks[index] as { deps: unknown[]; cleanup?: () => void } | undefined; if (!old || !same(deps, old.deps)) { hooks[index] = { deps }; effects.push(() => { old?.cleanup?.(); const cleanup = fn(); if (typeof cleanup === "function") (hooks[index] as { cleanup?: () => void }).cleanup = cleanup; }); } },
  };
  const sender = { id: "business", name: "Default", phone: "+900000000000" };
  const conversations = ["first", "second"].map(id => ({ id, phone: "+10000000000", donor: null, unresolved: true, handled: false, lastMessageAt: "2026-10-29T12:00:00Z", lastInboundText: id, needsReply: true, unread: true, inboundCount: 1, outboundCount: 0, sender }));
  const format = (text: string, args: unknown[] = []) => text.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)]));
  const deps: Record<string, unknown> = {
    react, "react/jsx-runtime": { jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }), jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }), Fragment: "fragment" },
    "next/link": { __esModule: true, default: "link" }, "next/navigation": { useSearchParams: () => new URLSearchParams() },
    "lucide-react": new Proxy({}, { get: (_target, key) => String(key) }),
    "@/hooks/useDashboardUnsavedChanges": { useDashboardUnsavedChanges() {} },
    "@/components/dashboard/PageHeader": { PageHeader: "PageHeader" }, "@/components/dashboard/EmptyState": { EmptyState: "EmptyState" },
    "../../_shared/channel-ui": { SegmentedControl: "SegmentedControl", fmtDateTime: () => ({ date: "2026-10-29", time: "12:00" }), fmtFull: String },
    "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }, "@/components/dashboard/SmartWhatsappDialog": { SmartWhatsappDialog: "SmartWhatsappDialog" },
    "@/lib/dashboard/i18n": { dt: format, dtx: format, dashDir: () => "rtl" }, "@/lib/communication/inbox-timeline": { mergeInboxTimeline: (_old: unknown, current: unknown) => current },
    "./InboxAttachments": { InboxAttachments: "InboxAttachments" }, "./InboxMedia": { InboxMedia: "InboxMedia" }, "@/components/dashboard/DonorAccountBadge": { DonorAccountBadge: "DonorAccountBadge" },
  };
  const loaded = { exports: {} as { WhatsappInbox: () => Node } };
  const source = ts.transpileModule(fs.readFileSync("app/(dashboard)/dashboard/communication/inbox/_components/WhatsappInbox.tsx", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const browser = { innerHeight: 844, matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, setInterval: (fn: () => void, period: number) => { timers.push({fn, period}); return timers.length; }, clearInterval() {}, dispatchEvent() {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, AbortController, AbortSignal, URL, URLSearchParams, FormData, console, document: { visibilityState: "visible" }, window: browser,
    CustomEvent: class { constructor(public type: string) {} }, requestAnimationFrame: (fn: () => void) => { fn(); return 1; }, cancelAnimationFrame() {},
    fetch: async (url: string, init?: RequestInit) => { calls.push({ url, method: init?.method || "GET", body: init?.body as string | undefined });
      if (url.endsWith("/senders")) return Response.json({ ok: true, senders: [sender] });
      if (url.includes("?")) return Response.json({ ok: true, conversations: new URL(url, "https://fixture.test").searchParams.get("filter") === "unread" ? conversations.filter(item => item.unread) : conversations, needsReply: 2 });
      if (init?.method === "POST") { const conversation = conversations.find(item => url.endsWith("/" + item.id)); if (conversation && JSON.parse(String(init.body)).action === "read") conversation.unread = false; return Response.json({ ok: true }); }
      const id = url.split("/").at(-1)!;
      return Response.json({ ok: true, conversation: { ...conversations.find(item => item.id === id), timeline: [{ id: id + "-message", kind: "inbound", at: "2026-10-29T12:00:00Z", text: "Fixture", status: null }], hasMore: false, oldestAt: null }, replyWindow: { open: true, remainingMs: 3600000, lastInboundAt: "2026-10-29T12:00:00Z" } });
    }, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; },
  });
  const settle = async () => { for (let turn = 0; turn < 30; turn++) { if (dirty) { dirty = false; cursor = 0; nodes = flatten(loaded.exports.WhatsappInbox()); } while (effects.length) effects.shift()!(); await new Promise(resolve => setImmediate(resolve)); if (!dirty && !effects.length) return; } assert.fail("Component did not settle"); };
  const click = async (label: string) => { const node = nodes.find(item => item.type === "button" && item.props["aria-label"] === label); assert.ok(node, label); (node.props.onClick as (event: unknown) => void)({ currentTarget: { isConnected: true, focus() {} } }); await settle(); };
  await settle(); return { calls, click, settle, nodes: () => nodes,
    filter: async (value: string) => { const control = nodes.find(node => node.type === "SegmentedControl")!; (control.props.onChange as (value: string) => void)(value); await settle(); },
    poll: async () => { timers.filter(timer => timer.period === 30000).at(-1)!.fn(); await settle(); },
  };
}
test("opening the inbox does not open or mark its first unread conversation as read", async () => {
  const h = await harness();
  assert.ok(h.calls.some(call => call.url.includes("inbox?")));
  assert.equal(h.calls.some(call => /inbox\/(first|second)$/.test(call.url)), false);
  assert.equal(h.calls.filter(call => call.method === "POST").length, 0);
});
test("explicit opening acknowledges only that conversation and the mobile back action preserves separate drafts", async () => {
  const h = await harness(); await h.click("فتح محادثة: +10000000000");
  const input = h.nodes().find(node => node.type === "textarea"); assert.ok(input);
  (input.props.onChange as (event: unknown) => void)({ target: { value: "Unsent draft" } }); await h.settle();
  let back = h.nodes().find(node => "data-inbox-back" in node.props); assert.ok(back); (back.props.onClick as () => void)(); await h.settle();
  const second = h.nodes().filter(node => node.type === "button" && String(node.props["aria-label"]).startsWith("فتح محادثة:"))[1];
  (second.props.onClick as (event: unknown) => void)({ currentTarget: { isConnected: true, focus() {} } }); await h.settle();
  assert.equal(h.nodes().find(node => node.type === "textarea")?.props.value, "");
  back = h.nodes().find(node => "data-inbox-back" in node.props)!; (back.props.onClick as () => void)(); await h.settle();
  await h.click("فتح محادثة: +10000000000"); assert.equal(h.nodes().find(node => node.type === "textarea")?.props.value, "Unsent draft");
  const recording = h.nodes().find(node => node.type === "InboxAttachments")!;
  (recording.props.onRecordingChange as (value: boolean) => void)(true); await h.settle();
  const competingSelection = h.nodes().filter(node => node.type === "button" && String(node.props["aria-label"]).startsWith("فتح محادثة:"))[1];
  (competingSelection.props.onClick as (event: unknown) => void)({ currentTarget: { isConnected: true, focus() {} } }); await h.settle();
  assert.equal(h.nodes().find(node => node.type === "textarea")?.props.value, "Unsent draft", "a stale selection must not interrupt voice recording");
  (recording.props.onRecordingChange as (value: boolean) => void)(false); await h.settle();
  const acknowledgements = h.calls.filter(call => call.method === "POST");
  assert.equal(acknowledgements.length, 2); assert.ok(acknowledgements.every(call => JSON.parse(call.body!).action === "read"));
});

test("refreshing the unread filter never closes the thread just acknowledged as read", async () => {
  const h = await harness(); await h.filter("unread"); await h.click("فتح محادثة: +10000000000");
  const input = h.nodes().find(node => node.type === "textarea")!;
  (input.props.onChange as (event: unknown) => void)({ target: { value: "Reply still being composed" } }); await h.settle();
  const before = h.calls.length; await h.poll(); assert.ok(h.calls.length > before);
  assert.equal(h.nodes().filter(node => node.type === "button" && String(node.props["aria-label"]).startsWith("فتح محادثة:")).length, 1);
  assert.equal(h.nodes().find(node => node.type === "textarea")?.props.value, "Reply still being composed");
  assert.equal(h.calls.filter(call => call.method === "POST").length, 1);
});
