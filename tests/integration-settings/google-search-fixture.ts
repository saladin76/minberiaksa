import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
const helperNames = new Set(["./json", "./lease", "./scope", "./optimization-safety", "./planning-evidence", "./emergency-pause"]);
const caches = new WeakMap<object, Record<string,unknown>>();
export function searchTestDependencies(dependencies: Record<string, unknown>) {
  const cached=caches.get(dependencies);if(cached)return cached;
  const modules = { "node:crypto": { randomUUID }, "@/lib/audit-log": {queueAuditLog: () => {}}, ...dependencies };
  const resolve = (name: string): unknown => {
    if (Object.hasOwn(modules,name)) return modules[name as keyof typeof modules];
    assert.ok(helperNames.has(name), `Unexpected test dependency: ${name}`);
    const isolated = { exports: {} };
    const code = ts.transpileModule(readFileSync(`lib/marketing/google-search/${name.slice(2)}.ts`,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(code,{module:isolated,exports:isolated.exports,require:resolve,Date,Intl,URL,Buffer,Error,console});
    Object.assign(modules,{[name]:isolated.exports});
    return isolated.exports;
  };
  const proxy=new Proxy(modules as Record<string,unknown>,{has:(target,name)=>Object.hasOwn(target,name)||typeof name==="string"&&helperNames.has(name),get:(target,name)=>typeof name==="string"?resolve(name):Reflect.get(target,name)});
  caches.set(dependencies,proxy);return proxy;
}
