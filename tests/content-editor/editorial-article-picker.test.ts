import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function route(allowed = true) {
  const queries: {select: Record<string, boolean>; take?: number; where?: unknown}[] = [];
  const loaded = {exports: {}};
  const selectedId = "222222222222222222222222";
  const rows = Array.from({length: 51}, (_, index) => ({id: String(index), title: "Article " + index}));
  const code = ts.transpileModule(readFileSync("app/api/admin/editorial-jobs/articles/route.ts", "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code, {module: loaded, exports: loaded.exports, Promise, require(name: string) {
    if (name === "next/server") return {NextResponse: {json: (body: unknown, init?: ResponseInit) => Response.json(body, init)}};
    if (name === "next-auth") return {getServerSession: async () => ({user: {role: "ADMIN"}})};
    if (name.endsWith("/options")) return {authOptions: {}};
    if (name.endsWith("/api-auth")) return {requireAdminOrDashboardPermission: (_session: unknown, permission: string) => {assert.equal(permission, "blog"); return allowed ? null : Response.json({}, {status:403});}};
    if (name.endsWith("/prisma")) return {prisma: {post: {
      findMany: async (query: typeof queries[number]) => {queries.push(query); return rows;},
      findUnique: async (query: typeof queries[number]) => {queries.push(query); return {id:selectedId,title:"Selected article"};},
    }}};
    throw new Error("Unexpected dependency " + name);
  }});
  return {queries, selectedId, get: (loaded.exports as {GET: (request: {nextUrl: URL}) => Promise<Response>}).GET};
}

test("article picker requires blog access before reading article data", async () => {
  const handler = route(false);
  assert.equal((await handler.get({nextUrl: new URL("https://fixture.test?q=article")})).status,403);
  assert.equal(handler.queries.length,0);
});
test("article picker bounds results and requests no article bodies or translations", async () => {
  const handler = route();
  const response = await handler.get({nextUrl: new URL("https://fixture.test?q=water&selected=" + handler.selectedId)});
  const body = await response.json();
  assert.equal(body.hasMore,true); assert.equal(body.items.length,51); assert.equal(body.items[0].id,handler.selectedId);
  assert.equal(handler.queries[0].take,51);
  assert.equal(JSON.stringify(handler.queries[0].where),JSON.stringify({title:{contains:"water",mode:"insensitive"}}));
  for (const query of handler.queries) assert.equal(JSON.stringify(query.select),JSON.stringify({id:true,title:true}));
  assert.equal(response.headers.get("Cache-Control"),"no-store");
});
test("invalid article picker searches fail before opening the database", async () => {
  for (const query of ["q=" + "a".repeat(121), "selected=invalid", "q=first%00last"]) {
    const handler=route();
    assert.equal((await handler.get({nextUrl:new URL("https://fixture.test?"+query)})).status,400);
    assert.equal(handler.queries.length,0);
  }
});
