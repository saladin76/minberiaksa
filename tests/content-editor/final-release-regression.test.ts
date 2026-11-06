import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function evaluate(source: string, context: Record<string, unknown>) {
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
}

test("a failed bank catalogue does not prevent loading the transaction ledger", async () => {
  const source = fs.readFileSync("app/(dashboard)/dashboard/bank-transfers/page.tsx", "utf8");
  const start = source.indexOf("  async function loadInitial()");
  const end = source.indexOf("  async function loadTransactions(", start);
  let read = 0;
  let failed = false;
  let loading = true;
  const fixtureModule = { exports: null as unknown as () => Promise<void> };
  evaluate(source.slice(start, end) + "\nmodule.exports=loadInitial;", {
    module: fixtureModule, axios: { get: async () => { throw new Error("catalogue unavailable"); } },
    setLoading: (value: boolean) => { loading = value; }, setLoadError: (value: boolean) => { failed = value; },
    setBanks: () => {}, setSupportedCurrencies: () => {}, dt: (value: string) => value, toast: { error: () => {} },
    defaultFilters: {}, loadTransactions: async () => { read++; },
  });
  await fixtureModule.exports();
  assert.equal(read, 1); assert.equal(failed, true); assert.equal(loading, false);
});

test("PDF MIME normalization accepts real PDF filenames and rejects unknown empty types", () => {
  const source = fs.readFileSync("app/(dashboard)/dashboard/templates/_components/WhatsappTemplateEditorDialog.tsx", "utf8");
  const start = source.indexOf("function normalizeMediaMime(");
  const end = source.indexOf("async function inspectMediaFile(", start);
  const fixtureModule = { exports: null as unknown as (file: File, type: string) => string };
  evaluate(source.slice(start, end) + "\nmodule.exports=normalizeMediaMime;", { module: fixtureModule });
  for (const type of ["", "application/pdf", "application/x-pdf", "application/octet-stream"]) {
    assert.equal(fixtureModule.exports(new File(["%PDF-1.4"], "تقرير.PDF", { type }), "DOCUMENT"), "application/pdf");
  }
  assert.equal(fixtureModule.exports(new File(["abc"], "payload.exe"), "DOCUMENT"), "");
});

test("media API validates PDF bytes, upload size and origin before requesting a Meta sample", async () => {
  const source = fs.readFileSync("app/api/templates/whatsapp/media-sample/route.ts", "utf8").replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  let media = "%PDF-1.4\nQA";
  let calls = 0;
  const fixtureModule = { exports: null as unknown as (request: unknown) => Promise<{ status: number }> };
  evaluate(source + "\nmodule.exports=POST;", {
    module: fixtureModule, Buffer, File, Uint8Array, URL, console,
    NextResponse: { json: (body: unknown, init: { status?: number } = {}) => ({ body, status: init.status ?? 200 }) },
    getServerSession: async () => ({}), authOptions: {}, requireAdminOrDashboardPermission: () => null,
    fetch: async () => new Response(media, { headers: { "content-type": "application/octet-stream" } }),
    uploadMetaTemplateSample: async () => { calls++; return { ok: true, handle: "sample" }; },
  });
  const request = (patch = {}) => ({ headers: new Headers({ "content-type": "application/json" }), json: async () => ({ url: "https://res.cloudinary.com/test/qa.pdf", name: "qa.pdf", type: "application/pdf", size: 12, ...patch }) });
  for (const type of ["application/pdf", "", "application/octet-stream", "application/x-pdf"]) assert.equal((await fixtureModule.exports(request({ type }))).status, 200);
  assert.equal(calls, 4);
  media = "this is not a PDF";
  assert.equal((await fixtureModule.exports(request())).status, 400);
  for (const size of [-1, NaN, 1.5, 101 * 1024 * 1024]) assert.equal((await fixtureModule.exports(request({ size }))).status, 413);
  assert.equal((await fixtureModule.exports(request({ url: "https://example.org/file.pdf" }))).status, 400);
  assert.equal(calls, 4);
});
