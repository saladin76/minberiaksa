import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as media from "../../lib/communication/inbox-media";
import * as phone from "../../lib/communication/phone";
import * as timeline from "../../lib/communication/inbox-timeline";
import * as childProcess from "node:child_process";
import * as promises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

function load<T>(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const loaded = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, Date, Map, Set, Buffer, Blob, File, Response, Headers, FormData, Request, URL, AbortSignal, TransformStream, Uint8Array, setTimeout, clearTimeout, process: { env: { DATABASE_URL: "fixture" } }, console: { error() {} }, require: (id: string) => { if (!(id in dependencies)) throw new Error(id); return dependencies[id]; }, ...globals });
  return loaded.exports as T;
}
test("attachments enforce Cloud API sizes and MIME types and never proxy arbitrary URLs", () => {
  assert.equal(media.inboxMediaSpec("image/png", 5 * 1024 * 1024)?.kind, "image");
  for (const [type, size] of [["image/svg+xml", 10], ["text/html", 10], ["image/png", 5 * 1024 * 1024 + 1], ["audio/webm", 10]] as const) assert.equal(media.inboxMediaSpec(type, size), null);
  assert.equal(media.inboxMediaSpec("audio/webm;codecs=opus", 10, true)?.kind, "audio");
  for (const url of ["http://lookaside.fbsbx.com/a", "https://lookaside.fbsbx.com.evil.test/a", "https://evil.test/a", "https://token@lookaside.fbsbx.com/a", "https://lookaside.fbsbx.com:444/a"]) assert.equal(media.trustedMetaMediaUrl(url), null);
  assert.equal(media.trustedMetaMediaUrl("https://lookaside.fbsbx.com/a")?.hostname, "lookaside.fbsbx.com");
  assert.equal(media.inboxMediaFilename("../test\r\n.txt"), ".._test__.txt");
});

test("provider media payloads contain uploaded ids, voice flags and reply context without browser URLs", async () => {
  const calls: unknown[] = [];
  const provider = load<{ uploadMessageMedia: (...args: unknown[]) => Promise<{ok:boolean}>; sendMediaMessage: (...args: unknown[]) => Promise<{ok:boolean}> }>("lib/communication/providers/meta-whatsapp/media-messages.ts", {
    "./graph": { graphFetch: async (_config: unknown, _path: unknown, input: RequestInit) => { calls.push(JSON.parse(String(input.body))); return { ok: true, data: { messages: [{ id: "wamid.accepted" }] } }; } },
  }, { fetch: async (_url: unknown, input: RequestInit) => { assert.ok(input.body instanceof FormData); assert.equal((input.headers as Record<string,string>)["Content-Type"], undefined); return Response.json({ id: "999" }); } });
  assert.equal((await provider.uploadMessageMedia({graphVersion:"v24.0",accessToken:"secret"}, "123", new Blob(["OggS"],{type:"audio/ogg"}), "voice.ogg")).ok, true);
  assert.equal((await provider.sendMediaMessage({}, {phoneNumberId:"123",to:"15555555555",kind:"audio",id:"999",voice:true,replyToMessageId:"incoming"})).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {messaging_product:"whatsapp",to:"15555555555",type:"audio",audio:{id:"999",voice:true},context:{message_id:"incoming"}});
  assert.equal((await provider.sendMediaMessage({}, {phoneNumberId:"123",kind:"image",id:"https://evil.test/file"})).ok, false);assert.equal(calls.length,1);
});

test("media upload and download authorize before reading bodies or touching message archives", async () => {
  let reads=0;
  const common={"next/server":{NextResponse:{json:(body:unknown,options?:{status?:number})=>({body,status:options?.status||200})}},"next-auth":{getServerSession:async()=>({})},"@/app/api/auth/[...nextauth]/options":{},"@/lib/dashboard/api-auth":{requireAdminOrDashboardPermission:()=>({status:403})}};
  const upload=load<{POST:(...args:unknown[])=>Promise<{status:number}>}>("app/api/dashboard/communication/inbox/[id]/media/route.ts",{...common,"@/lib/audit-log":{},"@/lib/communication/conversation-reply-service":{sendConversationReply:async()=>{reads++;}},"@/lib/communication/inbox-media":media});
  assert.equal((await upload.POST({get body(){reads++;throw Error("unauthorized body");}},{params:Promise.resolve({id:"contact"})})).status,403);
  const download=load<{GET:(...args:unknown[])=>Promise<{status:number}>}>("app/api/dashboard/communication/inbox/[id]/media/[itemId]/route.ts",{...common,"@/lib/communication/inbox-media-service":{conversationMediaResponse:async()=>{reads++;}}});
  assert.equal((await download.GET({}, {params:Promise.resolve({id:"contact",itemId:"event"})})).status,403);assert.equal(reads,0);
});

function replyHarness(mode = "ok") {
  const calls: string[] = [], stored: Record<string, unknown>[] = [];
  const service = load<{ sendConversationReply: (id: string, body: string, actor: null, attachment?: { file: File; voice: boolean }) => Promise<{ ok: boolean; reason?: string }> }>("lib/communication/conversation-reply-service.ts", {
    "server-only": {}, "./inbox-media": media, "./phone": phone,
    "./voice-note": { prepareVoiceNote: async () => { calls.push("convert"); return new Blob(["OggS"], { type: "audio/ogg" }); } },
    "./conversation-service": { parseConversationId: () => ({ senderId: "business", phone: "+15555555555" }) },
    "@/lib/prisma": { prisma: {
      donorCommunicationProfile: { findFirst: async () => { if (mode === "policy-down") throw Error("unavailable"); return mode === "blocked" ? { id: "blocked" } : null; } },
      communicationProviderEvent: { findFirst: async () => ({ receivedAt: new Date(Date.now() - (mode === "expired" ? 25 * 3600000 : 1000)), providerMessageId: "incoming" }) },
      communicationDelivery: { update: async ({ data }: { data: Record<string, unknown> }) => { calls.push("media-reference"); stored.push(data); if (mode === "archive-down") throw Error("unavailable"); } },
    } },
    "./sender-resolution": { loadSenderRoutingSnapshot: async () => ({ raw: new Map([["business", { id: "business", phoneNumberId: "1234", enabled: mode !== "disabled", channel: "WHATSAPP", status: "ACTIVE" }]]) }) },
    "./runtime-config": { getActiveMetaWhatsappRuntimeConfig: async () => ({ configured: true, values: {} }) },
    "./delivery-log-service": { createDeliveryRecord: async ({ variables }: { variables: unknown }) => { calls.push("create"); stored.push({ variables }); return { ok: true, data: { id: "delivery" } }; }, markDeliveryStatus: async (_id: string, status: string) => { calls.push(status); return { ok: mode !== "accepted-unrecorded" }; } },
    "./providers/meta-whatsapp/media-messages": { uploadMessageMedia: async () => { calls.push("upload"); return mode === "upload-down" ? { ok: false, reason: "MEDIA_UPLOAD_FAILED" } : { ok: true, id: "9999" }; }, sendMediaMessage: async () => { calls.push("send"); return mode === "uncertain" ? {ok:false,reason:"MEDIA_SEND_UNCONFIRMED"} : { ok: true, providerMessageId: "accepted" }; } },
    "./providers/meta-whatsapp/messages": {},
  });
  return { calls, stored, send: (voice = false) => service.sendConversationReply("business:+15555555555", "", null, { file: new File(["fixture"], voice ? "record.webm" : "photo.png", { type: voice ? "audio/webm" : "image/png" }), voice }) };
}
for (const [mode, reason] of [["blocked", "DO_NOT_CONTACT"], ["policy-down", "CONTACT_POLICY_UNAVAILABLE"], ["expired", "REPLY_WINDOW_CLOSED"], ["disabled", "CONVERSATION_SENDER_UNAVAILABLE"]]) test(`${mode} blocks media before conversion, upload, archive or sending`, async () => {
  const h = replyHarness(mode); assert.equal((await h.send(true)).reason, reason); assert.deepEqual(h.calls, []);
});
test("voice conversion and media reference are recorded before sending and acceptance before SENT", async () => {
  const h = replyHarness(); assert.equal((await h.send(true)).ok, true);
  assert.deepEqual(h.calls, ["convert", "create", "upload", "media-reference", "send", "SENT"]);
  assert.match(JSON.stringify(h.stored), /audio\/ogg/); assert.match(JSON.stringify(h.stored), /9999/);
});
for (const [mode, reason] of [["upload-down", "MEDIA_UPLOAD_FAILED"], ["archive-down", "MEDIA_ARCHIVE_FAILED"], ["accepted-unrecorded", "ACCEPTED_UNRECORDED"]]) test(`${mode} never claims a recorded success`, async () => {
  const h = replyHarness(mode); assert.equal((await h.send()).reason, reason);
  assert.equal(h.calls.includes("send"), mode === "accepted-unrecorded");
});

test("uncertain media acceptance stays unresolved rather than marked failed", async () => { const h=replyHarness("uncertain");assert.equal((await h.send()).reason,"MEDIA_SEND_UNCONFIRMED");assert.ok(h.calls.includes("RENDERED"));assert.equal(h.calls.includes("FAILED"),false); });

test("actual browser WebM is converted into an OGG/Opus audio stream", async () => {
  const fixture = childProcess.execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.15", "-c:a", "libopus", "-f", "webm", "pipe:1"]);
  const service = load<{ prepareVoiceNote: (blob: Blob) => Promise<Blob> }>("lib/communication/voice-note.ts", { "server-only": {}, "node:child_process": childProcess, "node:fs/promises": promises, "node:os": os, "node:path": path });
  const result = await service.prepareVoiceNote(new Blob([fixture], { type: "audio/webm" }));
  const bytes = Buffer.from(await result.arrayBuffer());
  assert.equal(result.type, "audio/ogg"); assert.equal(bytes.subarray(0, 4).toString(), "OggS"); assert.ok(bytes.includes(Buffer.from("OpusHead")));
  await assert.rejects(service.prepareVoiceNote(new Blob(["invalid audio"])), /VOICE_CONVERSION_FAILED/);
});

test("protected media reads stay within the exact business/contact archive and keep tokens server-side", async () => {
  const queries: unknown[] = [], requests: unknown[] = []; let found = true, host = "https://lookaside.fbsbx.com/file";
  const service = load<{ conversationMediaResponse: (id: string, item: string, range: string | null) => Promise<Response> }>("lib/communication/inbox-media-service.ts", {
    "server-only": {}, "./inbox-media": media, "./phone": phone, "./conversation-service": { parseConversationId: () => ({ senderId: "a".repeat(24), phone: "+15555555555" }) },
    "../prisma": { prisma: { communicationProviderEvent: { findFirst: async (query: unknown) => { queries.push(query); return found ? { payloadSanitized: { media: { mediaId: "123", filename: "record.ogg" } } } : null; } }, communicationSender: { findUnique: async () => ({ phoneNumberId: "999" }) } } },
    "./runtime-config": { getActiveMetaWhatsappRuntimeConfig: async () => ({ configured: true, values: { accessToken: "secret-token" } }) },
    "./providers/meta-whatsapp/graph": { graphFetch: async () => ({ ok: true, data: { url: host, mime_type: "audio/ogg", file_size: 4 } }) },
  }, { fetch: async (_url: URL, options: RequestInit) => { requests.push(options); return new Response("OggS", { status: 206, headers: { "Content-Range": "bytes 0-3/4" } }); } });
  const response = await service.conversationMediaResponse("conversation", "event:" + "b".repeat(24), "bytes=0-");
  assert.equal(response.status, 206); assert.equal(response.headers.get("content-type"), "audio/ogg"); assert.equal(await response.text(), "OggS");
  assert.match(JSON.stringify(queries), /"senderId":"a{24}"/); assert.match(JSON.stringify(queries), /recipient/);
  assert.match(JSON.stringify(requests), /"Range":"bytes=0-"/); assert.doesNotMatch(JSON.stringify([...response.headers]), /secret-token|lookaside/);
  found = false; assert.equal((await service.conversationMediaResponse("foreign", "event:" + "b".repeat(24), null)).status, 404); assert.equal(requests.length, 1);
  found = true; host = "https://evil.test/file"; assert.equal((await service.conversationMediaResponse("conversation", "event:" + "b".repeat(24), null)).status, 502); assert.equal(requests.length, 1);
});

test("read acknowledgements use the displayed inbound timestamp and leave later messages unread", async () => {
  const read = new Date("2026-10-28T10:00:00Z"), next = new Date("2026-10-28T10:01:00Z"), writes: unknown[] = [], queries: unknown[] = [];
  let readThrough = read.toISOString(), eventFound = true;
  const aggregate = async (query: unknown) => JSON.stringify(query).includes("inbound_message") ? [{ _id: { senderId: "business", phone: "+15555555555" }, count: 1, lastAt: next }] : [];
  const service = load<{ markConversationRead: (conversation: string, event: string) => Promise<boolean>; listConversations: () => Promise<{ unread: boolean; needsReply: boolean }[]> }>("lib/communication/conversation-service.ts", {
    "@/lib/dashboard/donor-account": {}, "./phone": phone, "./inbox-timeline": timeline, "@/lib/audit-log": { writeAuditLog: async (row: unknown) => writes.push(row) },
    "@/lib/prisma": { prisma: {
      communicationProviderEvent: { aggregateRaw: aggregate, findFirst: async (query: unknown) => { queries.push(query); return eventFound ? { receivedAt: read } : null; } },
      communicationDelivery: { aggregateRaw: aggregate }, donorCommunicationProfile: { findMany: async () => [] }, communicationSender: { findMany: async () => [] },
      auditLog: { create:async (row:unknown)=>writes.push(row), findMany: async () => [{ entityId: "business:+15555555555", metadata: { seenThrough: readThrough } }] },
    } },
  });
  assert.equal(await service.markConversationRead("business:+15555555555", "event:" + "c".repeat(24)), true);
  assert.match(JSON.stringify(writes), /2026-10-28T10:00:00.000Z/); assert.match(JSON.stringify(queries), /"senderId":"business"/);
  assert.equal((await service.listConversations())[0].unread, true);
  readThrough = next.toISOString(); const opened = (await service.listConversations())[0]; assert.equal(opened.unread, false); assert.equal(opened.needsReply, true);
  eventFound = false; assert.equal(await service.markConversationRead("business:+15555555555", "event:" + "d".repeat(24)), false); assert.equal(writes.length, 1);
});

test("all conversations survive the former 101-row cursor boundary and unknown-sender history remains scoped",async()=>{
  const queries:unknown[]=[];
  const service=load<{listConversations:()=>Promise<{phone:string}[]>;getConversation:(id:string)=>Promise<unknown>}>("lib/communication/conversation-service.ts",{
    "@/lib/dashboard/donor-account":{},"./phone":phone,"./inbox-timeline":timeline,"@/lib/audit-log":{},"@/lib/prisma":{prisma:{
      communicationProviderEvent:{aggregateRaw:async(query:unknown)=>JSON.stringify(query).includes("inbound_message")?Array.from({length:127},(_,i)=>({_id:{senderId:null,phone:"+1555555"+String(i).padStart(4,"0")},count:1,lastAt:new Date()})):[],findMany:async(query:unknown)=>{queries.push(query);return [];}},
      communicationDelivery:{aggregateRaw:async()=>[],findMany:async(query:unknown)=>{queries.push(query);return [];}},auditLog:{findMany:async()=>[]},donorCommunicationProfile:{findMany:async()=>[]},communicationSender:{findMany:async()=>[]},
    }},
  });
  assert.equal((await service.listConversations()).length,127);
  await service.getConversation("unknown:+15555550000");assert.equal(queries.length,2);
  for(const query of queries)assert.match(JSON.stringify(query),/"OR":\[\{"senderId":null\},\{"senderId":\{"isSet":false\}\}\]/);
});
