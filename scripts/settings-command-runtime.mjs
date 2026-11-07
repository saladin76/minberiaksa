import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { metadataNodeExecutable, metadataNodeFlags } from "./release-metadata-runtime.mjs";

/** Standalone settings commands use the release's Node and TypeScript loader. */
export function ensureSettingsCommandRuntime(entry) {
  const root = fileURLToPath(new URL("..", entry));
  const executable = metadataNodeExecutable(root);
  const flags = process.execArgv;
  const tsx = flags.includes("--import=tsx") || flags.some((flag, i) => flag === "--import" && flags[i + 1] === "tsx");
  const server = flags.some((flag, i) => flag.startsWith("--conditions=") && flag.slice(13).split(",").includes("react-server") || flag === "--conditions" && flags[i + 1]?.split(",").includes("react-server"));
  if (process.versions.node.split(".")[0] === "24" && tsx && server) return;
  const child = spawnSync(executable, [...metadataNodeFlags, fileURLToPath(entry), ...process.argv.slice(2)], { cwd: root, env: process.env, stdio: "inherit" });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}
