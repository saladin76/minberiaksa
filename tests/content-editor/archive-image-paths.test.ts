import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("archive image scanner includes public root files without normalizing traversal into public", () => {
  // Test only the pure path classifier. Import never invokes run() or reads archives.
  const code = [
    "import importlib.util, json",
    "spec = importlib.util.spec_from_file_location('archive_audit', 'scripts/diff-archived-public-images.py')",
    "mod = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(mod)",
    "names = [",
    "  'public/hero.jpg',",
    "  './minberiaksa/public/banner.png',",
    "  'minberiaksa/handoff-certificates/assets/receipt.png',",
    "  '../public/private.jpg',",
    "  '/public/private.jpg',",
    "  'public/../private.jpg',",
    "  'private/cover.jpg',",
    "  'public/../public/hero.jpg',",
    "]",
    "print(json.dumps([mod.valid_project_path(name) for name in names]))",
  ].join("\n");
  const rows = JSON.parse(execFileSync("python3", ["-c", code], { encoding: "utf8" })) as Array<string | null>;
  assert.deepEqual(rows, [
    "public/hero.jpg",
    "public/banner.png",
    "handoff-certificates/assets/receipt.png",
    null, null, null, null, null,
  ]);
});
