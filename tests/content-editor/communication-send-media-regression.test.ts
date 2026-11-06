import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const root = "app/(dashboard)/dashboard/";
function load(path: string, imports: Record<string, unknown>, extra = {}) {
  const mod = { exports: {} as {POST: (request: {json: () => Promise<{kind: string}>}) => Promise<{body: Record<string, unknown>; status: number}>} };
  const js = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: (name: string) => {
    if (name in imports) return imports[name];
    throw new Error(name);
  }, ...extra });
  return mod.exports;
}

test("portal action clicks stop bubbling and table navigation ignores portal and interactive targets", () => {
  function handler(file: string, elementName: string) {
    const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let expression = "";
    const walk = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === elementName) {
        const attr = node.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(ast) === "onClick");
        if (attr && ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer)) expression = attr.initializer.expression!.getText(ast);
      }
      ts.forEachChild(node, walk);
    };
    walk(ast); assert.ok(expression, file);
    let navigated = 0;
    const mod = {exports: undefined as unknown as (event: unknown) => void};
    vm.runInNewContext(ts.transpileModule("module.exports = " + expression, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {module: mod, router: {push: () => navigated++}, href: "/report"});
    return {click: mod.exports, navigations: () => navigated};
  }
  // The outer actions boundary is a React ancestor even for portalled dialogs.
  const actions = handler(root + "communication/campaigns/_components/CampaignRowActions.tsx", "div");
  let stopped = false; actions.click({stopPropagation: () => {stopped = true;}}); assert.equal(stopped, true);
  const row = handler(root + "communication/campaigns/_components/CampaignsTable.tsx", "tr");
  for (const [contained, interactive] of [[false, false], [true, true], [true, false]]) {
    row.click({currentTarget: {contains: () => contained}, target: {closest: () => interactive ? {} : null}});
  }
  assert.equal(row.navigations(), 1, "only a non-interactive target inside the real row navigates");
});

test("PDF signing retains a unique .pdf raw ID and signs exactly the returned upload fields", async () => {
  const signed: Record<string, unknown>[] = [];
  let n = 0;
  const {POST} = load("app/api/templates/whatsapp/media-signature/route.ts", {
    "next/server": {NextResponse: {json: (body: unknown, init: {status?: number} = {}) => ({body, status: init.status ?? 200})}},
    "next-auth": {getServerSession: async () => ({user: {id: "qa"}})}, "@/app/api/auth/[...nextauth]/options": {authOptions: {}},
    "@/lib/dashboard/api-auth": {requireAdminOrDashboardPermission: () => null},
    "@/lib/cloudinary": {utils: {api_sign_request: (params: Record<string, unknown>) => { signed.push(params); return "signed"; }}},
    "node:crypto": {randomUUID: () => `unique-${++n}`},
  }, {process: {env: {CLOUDINARY_CLOUD_NAME: "qa", CLOUDINARY_API_KEY: "key", CLOUDINARY_API_SECRET: "secret"}}});
  const first = await POST({json: async () => ({kind: "DOCUMENT"})});
  const second = await POST({json: async () => ({kind: "DOCUMENT"})});
  assert.equal(first.body.resourceType, "raw");
  assert.match(String(first.body.publicId), /\.pdf$/);
  assert.notEqual(first.body.publicId, second.body.publicId);
  assert.equal(signed[0].public_id, first.body.publicId);
  const image = await POST({json: async () => ({kind: "IMAGE"})});
  assert.equal(image.body.resourceType, "image");
  assert.equal(image.body.publicId, undefined);
});

test("actual editor sends the signed PDF ID to storage and retains public URL and Meta handle", async () => {
  const path = root + "templates/_components/WhatsappTemplateEditorDialog.tsx";
  const ast = ts.createSourceFile(path, fs.readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = "";
  const walk = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "uploadSample") expression = node.initializer!.getText(ast); ts.forEachChild(node, walk); };
  walk(ast);
  const file = new File(["%PDF-1.4\nQA"], "تقرير.pdf", {type: "application/pdf"});
  let header: Record<string, string> = {type: "DOCUMENT"};
  let phase = 0;
  let error = "";
  const mod = {exports: null as unknown as (file: File) => Promise<void>};
  const source = ts.transpileModule("module.exports = " + expression, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source, {module: mod, header, FormData, MEDIA_SPECS: {DOCUMENT: {accept: ["application/pdf"], maxBytes: 1000000}},
    dt: (s: string) => s, formatMegabytes: String, setUploadError: (s: string) => error = s, setUploadingSample: () => {}, setMediaInfo: () => {},
    inspectMediaFile: async () => ({size: file.size}), setHeader: (fn: (previous: Record<string, string>) => Record<string, string>) => header = fn(header), toast: {success: () => {}, error: assert.fail},
    axios: {post: async (url: string, data: FormData | Record<string, unknown>) => {
      phase++;
      if (phase === 1) return {data: {uploadUrl: "https://storage.test/upload", publicId: "unique.pdf", apiKey: "key", timestamp: 123, folder: "media", signature: "signed"}};
      if (phase === 2) { assert.ok(data instanceof FormData); assert.equal(data.get("public_id"), "unique.pdf"); assert.equal(data.get("signature"), "signed"); return {data: {secure_url: "https://storage.test/unique.pdf", public_id: "media/unique.pdf"}}; }
      assert.ok(!(data instanceof FormData));
      assert.equal(data.type, "application/pdf"); assert.equal(data.name, file.name);
      return {data: {handle: "meta-sample"}};
    }},
  });
  await mod.exports(file);
  assert.equal(phase, 3); assert.equal(error, "");
  assert.equal(header.exampleHandle, "meta-sample");
  assert.equal(header.fileName, file.name);
  assert.match(header.mediaUrl, /\.pdf$/);
});
